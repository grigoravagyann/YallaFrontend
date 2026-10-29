import {
  BookingBlockedNoShowsError,
  BookingOverlapsOwnError,
  FreeByRequiredError,
  NEW_GUEST_RECORD,
  PhoneHasActiveBookingError,
  PhoneNotVerifiedError,
  createMockGateway,
  type Booking,
  type GuestRecord,
  type SlotFloor,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import type * as DeviceTimeZoneModule from '../deviceTimeZone';
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
// The phone's clock: Yerevan's, unless a test takes the phone abroad.
const phone = vi.hoisted(() => ({ zone: 'Asia/Yerevan' }));
vi.mock('../deviceTimeZone', async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceTimeZoneModule>()),
  deviceTimeZone: () => phone.zone,
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
 * Booked by time only (2026-10-29), after the SMS detour: no table is read,
 * the venue chooses one on arrival, and the wish goes as the note.
 */
describe('the confirm screen, a booking by time only', () => {
  it('reads no table, says the venue chooses it, and books with none', async () => {
    const floor = vi.spyOn(mock, 'getSlotFloor');
    const create = vi
      .spyOn(mock, 'createBooking')
      .mockResolvedValue({ id: 'r-time', status: 'confirmed' } as Booking);
    params.current = {
      branchId: BRANCH,
      venueId: 'v-lumen',
      byTime: '1',
      slotUtc: at('19:00'),
      partySize: '4',
      requests: 'By the window',
    };
    renderScreen();

    expect(await screen.findByText('The venue chooses your table when you arrive')).toBeTruthy();
    expect(screen.getByText('Your wish')).toBeTruthy();
    const submit = await screen.findByRole('button', { name: 'Confirm booking' });
    await waitFor(() => expect(submit.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0]).toMatchObject({
      tableId: null,
      partySize: 4,
      note: 'By the window',
    });
    expect(floor).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/reserve/success',
        params: { bookingId: 'r-time' },
      }),
    );
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

/*
 * No booking without a proved number (guest record, 2026-10-20 — as before
 * #72): an account whose number is not proved is sent to prove it, from the
 * profile before the tap and from the server's 403 after it. And the number
 * rules and the no-show pause, worded: at most three active bookings, no two
 * sittings too close anywhere, and a week without booking after three
 * no-shows in three days.
 */
describe('the confirm screen, the number rules and the no-show pause', () => {
  async function ready(options: { record?: Partial<GuestRecord> } = {}) {
    const seven = await mock.getSlotFloor({
      branchId: BRANCH,
      slotUtc: at('19:00'),
      partySize: 2,
      timeZoneId: 'Asia/Yerevan',
    });
    const table = seven!.tables.find(
      (candidate) => candidate.isBookable && !candidate.mustFreeByUtc,
    )!;
    params.current = {
      branchId: BRANCH,
      venueId: 'v-lumen',
      tableId: table.tableId,
      slotUtc: at('19:00'),
      partySize: '2',
    };
    const list = vi.spyOn(mock, 'listBookings').mockResolvedValue({
      upcoming: [],
      past: [],
      guestRecord: { ...NEW_GUEST_RECORD, ...options.record },
    });
    renderScreen();
    const submit = await screen.findByRole('button', {
      name: /^(Confirm booking|Request table|Verify my number)$/u,
    });
    return { submit, list };
  }

  async function refusedWith(error: unknown) {
    const { submit, list } = await ready();
    await waitFor(() => expect(submit.getAttribute('aria-disabled')).not.toBe('true'));
    const create = vi.spyOn(mock, 'createBooking').mockRejectedValue(error);
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    return { list };
  }

  afterEach(() => {
    useSession.setState({ profile: null });
    phone.zone = 'Asia/Yerevan';
  });

  // Review round 2 (N4): the pause belongs to no venue, so its end is said on
  // the phone's clock everywhere — the note here, the refusal, the bookings
  // tab and the feed — never the venue's on one screen and the phone's on another.
  it('says when the pause ends on the phone’s clock, not the venue’s', async () => {
    phone.zone = 'UTC';
    useSession.setState({
      profile: { phoneVerified: true } as ReturnType<typeof useSession.getState>['profile'],
    });
    await ready({ record: { blockedUntilUtc: '2026-10-23T09:30:00Z' } });
    expect(
      await screen.findByText(
        /^You can't book until .*23.*, 09:30, because of three missed bookings in three days\.$/u,
      ),
    ).toBeTruthy();
  });

  it('says the refusal’s end on the phone’s clock too', async () => {
    phone.zone = 'UTC';
    await refusedWith(
      new BookingBlockedNoShowsError({
        url: '/api/reservations',
        blockedUntilUtc: '2026-10-23T09:30:00Z',
      }),
    );
    expect(
      await screen.findByText(
        /^You can't book until .*23.*, 09:30, because of three missed bookings in three days\.$/u,
      ),
    ).toBeTruthy();
  });

  it('sends an account with no proved number to prove it before anything is sent', async () => {
    useSession.setState({
      profile: { phoneVerified: false } as ReturnType<typeof useSession.getState>['profile'],
    });
    const create = vi.spyOn(mock, 'createBooking');
    const { submit } = await ready();
    expect(
      screen.getByText('Confirm your phone number before booking. It takes one step.'),
    ).toBeTruthy();
    expect(submit.textContent).toBe('Verify my number');
    await waitFor(() => expect(submit.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(submit);
    expect(router.push).toHaveBeenCalledWith('/auth/code');
    expect(create).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/^Your number is not verified yet, so the venue may confirm/u),
    ).toBeNull();
  });

  it('sends the diner to prove the number after the server’s 403 too', async () => {
    await refusedWith(new PhoneNotVerifiedError({ url: '/api/reservations' }));
    expect(
      await screen.findByText('Confirm your phone number before booking. It takes one step.'),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Verify my number' }).length).toBeGreaterThan(0);
  });

  it('says three active bookings are the most, naming the next one', async () => {
    await refusedWith(
      new PhoneHasActiveBookingError({
        url: '/api/reservations',
        maxActiveBookings: 3,
        held: {
          reservationId: 'r-next',
          code: 'K7Q2LM',
          startUtc: '2026-10-22T15:30:00Z',
          localDate: '2026-10-22',
          localStartTime: '19:30',
          venueName: 'Café Aram',
          branchName: 'Main',
        },
      }),
    );
    expect(
      await screen.findByText(
        /^You already have 3 active bookings — the most one phone number can hold\. Cancel one \(the next is Café Aram, .*22.* at 19:30\) and try again\.$/u,
      ),
    ).toBeTruthy();
  });

  it('names the other venue when the booking held there is too close to this one', async () => {
    await refusedWith(
      new BookingOverlapsOwnError({
        url: '/api/reservations',
        existingReservationId: 'r-aram',
        localStartTime: '20:00',
        localDate: '2026-10-16',
        tableLabel: '4',
        venueName: 'Café Aram',
        branchName: 'Main',
      }),
    );
    expect(
      await screen.findByText(
        'You already have a booking at Café Aram at 20:00, too close to this time. Change that booking, or cancel it first.',
      ),
    ).toBeTruthy();
  });

  it('says until when booking is paused, and reads the bookings again for the banner', async () => {
    const { list } = await refusedWith(
      new BookingBlockedNoShowsError({
        url: '/api/reservations',
        blockedUntilUtc: '2026-10-23T09:30:00Z',
      }),
    );
    expect(
      await screen.findByText(
        /^You can't book until .*23.*, 13:30, because of three missed bookings in three days\.$/u,
      ),
    ).toBeTruthy();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not offer Confirm while booking is paused, and says why', async () => {
    useSession.setState({
      profile: { phoneVerified: true } as ReturnType<typeof useSession.getState>['profile'],
    });
    const create = vi.spyOn(mock, 'createBooking');
    const { submit } = await ready({ record: { blockedUntilUtc: '2026-10-23T09:30:00Z' } });
    expect(
      await screen.findByText(
        /^You can't book until .*23.*, 13:30, because of three missed bookings in three days\.$/u,
      ),
    ).toBeTruthy();
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submit);
    expect(create).not.toHaveBeenCalled();
  });

  it('says what the venue will see of the guest, near Confirm', async () => {
    await ready();
    expect(
      screen.getByText(
        'Venues you book with see how many of your bookings in the last 12 months, at all venues, you kept, missed or cancelled late, and how many were not marked. While booking is paused after three missed bookings in three days, they see that too. Just the numbers, never where.',
      ),
    ).toBeTruthy();
  });
});
