import {
  BookingOverlapsOwnError,
  FreeByRequiredError,
  createMockGateway,
  type Booking,
  type SlotFloor,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmScreen from '../../app/reserve/confirm';
import { useSession } from '../stores/session';

/**
 * The confirm screen after the SMS detour, with a booking following on the
 * table: the time to free it by agreed on the booking screen goes as agreed,
 * and once the server names another, a yes to that one is what goes — never
 * checked again against the room's older time and asked once more.
 */

const BRANCH = 'b-lumen-north';
const mock = createMockGateway({ latencyMs: 0 });
const params = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => params.current,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));
vi.mock('@yalla/i18n', async (importOriginal) => {
  const { dinerResources: resources } = await import('@yalla/i18n/diner');
  const en = resources.en.diner as Record<string, unknown>;
  const lookup = (key: string): string =>
    String(
      key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)?.[part], en) ??
        key,
    );
  return {
    ...(await importOriginal<typeof I18nModule>()),
    useTranslation: () => ({
      t: (key: string, values: Record<string, unknown> = {}) =>
        (lookup(key) === key && typeof values['count'] === 'number'
          ? lookup(`${key}_${values['count'] === 1 ? 'one' : 'other'}`)
          : lookup(key)
        ).replace(/\{\{(\w+)\}\}/gu, (_, name: string) => String(values[name])),
    }),
    useLocale: () => ({ locale: 'en' }),
  };
});

const at = (time: string) => new Date(`2026-10-16T${time}:00+04:00`).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  useSession.setState({ signedIn: true, phoneE164: '+37499000000', guestName: 'Ani' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null });
  router.replace.mockReset();
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <GatewayProvider gateway={mock}>
      <QueryClientProvider client={client}>
        <ConfirmScreen />
      </QueryClientProvider>
    </GatewayProvider>,
  );
}

describe('the confirm screen, a booking following on the table', () => {
  it("sends the agreed time, then the server's once agreed to, and asks nothing more", async () => {
    const seven = await mock.getSlotFloor({
      branchId: BRANCH,
      slotUtc: at('19:00'),
      partySize: 2,
      timeZoneId: 'Asia/Yerevan',
    });
    const table = seven!.tables.find((candidate) => candidate.isBookable)!;
    // The room says 20:25; the server, a booking later, 20:20.
    const original = mock.getSlotFloor.bind(mock);
    vi.spyOn(mock, 'getSlotFloor').mockImplementation(async (input) => {
      const floor = await original(input);
      if (!floor) return floor;
      return {
        ...floor,
        tables: floor.tables.map((candidate) =>
          candidate.tableId === table.tableId
            ? { ...candidate, mustFreeByUtc: at('20:25'), isRequestable: false }
            : candidate,
        ),
      } satisfies SlotFloor;
    });
    const create = vi
      .spyOn(mock, 'createBooking')
      .mockRejectedValueOnce(
        new FreeByRequiredError({
          url: '/api/reservations',
          requiredFreeByUtc: '2026-10-16T16:20:00Z',
          nextBookingStartUtc: '2026-10-16T16:25:00Z',
        }),
      )
      .mockResolvedValueOnce({ id: 'r-new', status: 'confirmed' } as Booking);
    params.current = {
      branchId: BRANCH,
      venueId: 'v-lumen',
      tableId: table.tableId,
      slotUtc: at('19:00'),
      partySize: '2',
      // Agreed on the booking screen, before the SMS detour.
      acceptsFreeByUtc: at('20:25'),
    };
    renderScreen();

    const submit = await screen.findByRole('button', {
      name: /^(Confirm booking|Request table)$/u,
    });
    await waitFor(() => expect(submit.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(Date.parse(create.mock.calls[0]![0].acceptsFreeByUtc!)).toBe(Date.parse(at('20:25')));

    fireEvent.click(await screen.findByRole('button', { name: "Yes, I'll free it by 20:20" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(Date.parse(create.mock.calls[1]![0].acceptsFreeByUtc!)).toBe(Date.parse(at('20:20')));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/reserve/success',
        params: { bookingId: 'r-new' },
      }),
    );
    expect(screen.queryByRole('button', { name: /^Yes, I'll free it by/u })).toBeNull();
  });
});

/*
 * One diner, two overlapping bookings at the same branch: the server refuses
 * the second (QA round 2), and the screen names the one already held.
 */
describe('the confirm screen, a booking that overlaps the diner’s own', () => {
  async function refusedWith(error: BookingOverlapsOwnError) {
    const seven = await mock.getSlotFloor({
      branchId: BRANCH,
      slotUtc: at('19:00'),
      partySize: 2,
      timeZoneId: 'Asia/Yerevan',
    });
    const table = seven!.tables.find(
      (candidate) => candidate.isBookable && !candidate.mustFreeByUtc,
    )!;
    const create = vi.spyOn(mock, 'createBooking').mockRejectedValue(error);
    params.current = {
      branchId: BRANCH,
      venueId: 'v-lumen',
      tableId: table.tableId,
      slotUtc: at('19:00'),
      partySize: '2',
    };
    renderScreen();
    const submit = await screen.findByRole('button', {
      name: /^(Confirm booking|Request table)$/u,
    });
    await waitFor(() => expect(submit.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  }

  it('says the diner already has a booking then, and at which table', async () => {
    await refusedWith(
      new BookingOverlapsOwnError({
        url: '/api/reservations',
        existingReservationId: 'r-own',
        existingCode: 'ABC123',
        localStartTime: '19:30',
        tableLabel: '2',
      }),
    );
    expect(
      await screen.findByText(
        'You already have a booking here at 19:30 (table 2). Choose another time, or change that booking.',
      ),
    ).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('names the day too when the booking held is on another day', async () => {
    await refusedWith(
      new BookingOverlapsOwnError({
        url: '/api/reservations',
        existingReservationId: 'r-own',
        localStartTime: '19:30',
        localDate: '2026-10-15',
        tableLabel: '2',
      }),
    );
    expect(
      await screen.findByText(
        /^You already have a booking here on .*15.* at 19:30 \(table 2\)\. Choose another time, or change that booking\.$/u,
      ),
    ).toBeTruthy();
  });

  it('says the time alone when the refusal names no table', async () => {
    await refusedWith(
      new BookingOverlapsOwnError({
        url: '/api/reservations',
        existingReservationId: 'r-own',
        localStartTime: '19:30',
        tableLabel: null,
      }),
    );
    expect(
      await screen.findByText(
        'You already have a booking here at 19:30. Choose another time, or change that booking.',
      ),
    ).toBeTruthy();
  });
});
