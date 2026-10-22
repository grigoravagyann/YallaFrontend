import type { Booking, PreOrder } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../../app/booking/[bookingId]';
import SuccessScreen from '../../../app/reserve/success';
import { BookingHeroCard, BookingRow } from './BookingCard';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * Pre-orders on a booking, on the diner's screens (2026-10-21): offered while
 * the branch takes them and the window is open, shown with what has become of
 * them, and the "on your way" question 45 minutes before.
 *
 * Copy is checked by key and its values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const params = vi.hoisted(() => ({ value: { bookingId: 'booking-1' } as Record<string, string> }));
const gateway = vi.hoisted(() => ({
  getBooking: vi.fn(),
  clearPreOrder: vi.fn(),
  confirmOnMyWay: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => params.value,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values && Object.keys(values).length > 0
        ? `${key} ${Object.entries(values)
            .map(([name, value]) => `${name}=${value}`)
            .join(' ')}`
        : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
vi.mock('../../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));
vi.mock('../AtMyTableAction', () => ({ AtMyTableAction: () => null }));
vi.mock('../../push/ReservationActions', () => ({ KeepTableAction: () => null }));
vi.mock('../../push/ReminderOptIn', () => ({ ReminderOptIn: () => null }));
vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function bookingAt(startMs: number, extra: Partial<Booking> = {}): Booking {
  const slot = new Date(startMs).toISOString();
  return {
    id: 'booking-1',
    code: 'ABC123',
    status: 'confirmed',
    venueName: 'Lumen Coffee',
    branchId: 'branch-1',
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    tableId: 't1',
    tableLabel: '1',
    roomId: null,
    roomName: null,
    partySize: 2,
    slotUtc: slot,
    endUtc: new Date(startMs + 2 * HOUR_MS).toISOString(),
    freeCancellationUntilUtc: new Date(startMs - 2 * HOUR_MS).toISOString(),
    cancelledAtUtc: null,
    cancelledAfterDeadline: false,
    note: null,
    awaitingApprovalBecause: null,
    approvalExpiresAtUtc: null,
    declinedBecause: null,
    manageToken: null,
    promisedFreeByUtc: null,
    incomingTableRequest: null,
    ...extra,
  };
}

function preOrderFor(booking: Booking, extra: Partial<PreOrder> = {}): PreOrder {
  return {
    id: 'po-1',
    reservationId: booking.id,
    state: 'editable',
    lines: [
      {
        id: 'l-1',
        menuItemId: 'khachapuri',
        name: 'Khachapuri',
        unitPriceDram: 3200,
        quantity: 2,
        lineTotalDram: 6400,
        note: 'no egg',
        availableNow: true,
      },
    ],
    note: 'Salad first',
    totalDram: 6400,
    editableUntilUtc: new Date(Date.parse(booking.slotUtc) - 2 * HOUR_MS).toISOString(),
    dueAtUtc: new Date(Date.parse(booking.slotUtc) - 30 * MINUTE_MS).toISOString(),
    sentAtUtc: null,
    kitchenStatus: null,
    onTab: false,
    notComingAtUtc: null,
    updatedAtUtc: new Date().toISOString(),
    ...extra,
  };
}

/** A day ahead, at a branch that takes pre-orders. */
const TOMORROW = Date.now() + 26 * HOUR_MS;
const OFFERED = bookingAt(TOMORROW, {
  preOrderEditableUntilUtc: new Date(TOMORROW - 2 * HOUR_MS).toISOString(),
});
const WITH_PRE_ORDER: Booking = { ...OFFERED, preOrder: preOrderFor(OFFERED) };

/** Half an hour away: past the lock, inside the "on your way" window. */
const SOON = Date.now() + 30 * MINUTE_MS;
const ASKED = bookingAt(SOON, {
  preOrder: preOrderFor(bookingAt(SOON), { state: 'locked' }),
});

function withQueries(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  params.value = { bookingId: 'booking-1' };
  Object.values(gateway).forEach((fn) => fn.mockReset());
  router.push.mockReset();
});

describe('the booking offers a pre-order', () => {
  it('while the branch takes them, and opens the editor', async () => {
    gateway.getBooking.mockResolvedValue(OFFERED);
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.add' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/booking/[bookingId]/pre-order',
      params: { bookingId: 'booking-1' },
    });
  });

  it('not where the branch takes none', async () => {
    gateway.getBooking.mockResolvedValue(bookingAt(TOMORROW));
    render(withQueries(<BookingDetailScreen />));
    await screen.findByText('bookings.status.confirmed');
    expect(screen.queryByRole('button', { name: 'preOrder.add' })).toBeNull();
  });

  it('on the success screen too', async () => {
    gateway.getBooking.mockResolvedValue(OFFERED);
    render(withQueries(<SuccessScreen />));
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.add' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/booking/[bookingId]/pre-order',
      params: { bookingId: 'booking-1' },
    });
  });

  it('on the bookings list: the hero card offers it, a row says there is one', () => {
    const onPreOrder = vi.fn();
    render(
      withQueries(
        <BookingHeroCard
          booking={OFFERED}
          now={new Date()}
          onOpen={vi.fn()}
          onCancel={vi.fn()}
          onPreOrder={onPreOrder}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.add' }));
    expect(onPreOrder).toHaveBeenCalled();
    cleanup();

    render(withQueries(<BookingRow booking={WITH_PRE_ORDER} now={new Date()} onOpen={vi.fn()} />));
    expect(screen.getByText('preOrder.title · preOrder.dishes count=2')).toBeTruthy();
  });
});

describe('a pre-order on the booking', () => {
  it('lists its dishes, the note and the total, and may be changed', async () => {
    gateway.getBooking.mockResolvedValue(WITH_PRE_ORDER);
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('2 × Khachapuri')).toBeTruthy();
    expect(screen.getByText('no egg')).toBeTruthy();
    expect(screen.getByText('Salad first')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/booking/[bookingId]/pre-order',
      params: { bookingId: 'booking-1' },
    });
  });

  it('is removed only after asking, with one command id', async () => {
    gateway.getBooking.mockResolvedValue(WITH_PRE_ORDER);
    gateway.clearPreOrder.mockResolvedValue({
      reservationId: 'booking-1',
      preOrder: null,
      wasReplay: false,
    });
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.remove' }));
    expect(gateway.clearPreOrder).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.removeConfirm' }));
    await waitFor(() => expect(gateway.clearPreOrder).toHaveBeenCalledTimes(1));
    expect(gateway.clearPreOrder.mock.calls[0]?.[0]).toMatchObject({ reservationId: 'booking-1' });
    expect(gateway.clearPreOrder.mock.calls[0]?.[0].clientCommandId).toEqual(expect.any(String));
  });

  it('marks a dish sold out since, and asks to swap or remove it', async () => {
    gateway.getBooking.mockResolvedValue({
      ...OFFERED,
      preOrder: preOrderFor(OFFERED, {
        lines: [{ ...preOrderFor(OFFERED).lines[0]!, availableNow: false }],
      }),
    });
    render(withQueries(<BookingDetailScreen />));
    expect(await screen.findByText('preOrder.unavailableNow')).toBeTruthy();
    expect(screen.getByText('preOrder.unavailableSwap name=Khachapuri')).toBeTruthy();
  });

  it('is read-only after the lock: the table will be ready', async () => {
    gateway.getBooking.mockResolvedValue({
      ...OFFERED,
      preOrder: preOrderFor(OFFERED, { state: 'locked' }),
    });
    render(withQueries(<BookingDetailScreen />));
    expect(await screen.findByText('preOrder.state.lockedTitle')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'preOrder.edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'preOrder.remove' })).toBeNull();
  });

  it.each([
    ['sent', 'preOrder.state.sentTitle'],
    ['notComing', 'preOrder.state.notComingTitle'],
    ['cancelled', 'preOrder.state.cancelledBody'],
  ] as const)('says when it is %s', async (state, key) => {
    gateway.getBooking.mockResolvedValue({
      ...OFFERED,
      preOrder: preOrderFor(OFFERED, { state }),
    });
    render(withQueries(<BookingDetailScreen />));
    expect(await screen.findByText(key)).toBeTruthy();
  });

  it('keeps one read-only, still removable, when the branch stopped taking them', async () => {
    gateway.getBooking.mockResolvedValue({
      ...bookingAt(TOMORROW),
      preOrder: preOrderFor(OFFERED),
    });
    render(withQueries(<BookingDetailScreen />));
    expect(await screen.findByText('preOrder.state.notAcceptedBody')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'preOrder.edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'preOrder.remove' })).toBeTruthy();
  });
});

/**
 * The push's "Yes" and "Can't come" (2026-10-21) still land on the booking
 * screen; the "I'm coming" block's own states (2026-10-22) are in
 * `imComing.test.tsx`.
 */
describe('are you on your way?', () => {
  it(`the push's "yes" button sends it once on landing`, async () => {
    params.value = { bookingId: 'booking-1', onMyWay: 'yes' };
    gateway.getBooking.mockResolvedValue(ASKED);
    gateway.confirmOnMyWay.mockResolvedValue({
      reservationId: 'booking-1',
      guestConfirmedOnWayAtUtc: new Date().toISOString(),
      wasReplay: false,
    });
    render(withQueries(<BookingDetailScreen />));
    await waitFor(() => expect(gateway.confirmOnMyWay).toHaveBeenCalledTimes(1));
    // Settled — the answer's re-read landed and every render after it ran —
    // and still once: `waitFor` alone passes the moment the first call lands.
    await waitFor(() => expect(gateway.getBooking.mock.calls.length).toBeGreaterThan(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gateway.confirmOnMyWay).toHaveBeenCalledTimes(1);
  });

  it(`the push's "can't come" opens the cancel question`, async () => {
    params.value = { bookingId: 'booking-1', onMyWay: 'cantCome' };
    gateway.getBooking.mockResolvedValue(ASKED);
    render(withQueries(<BookingDetailScreen />));
    expect(await screen.findByText('bookings.detail.cancelTitle')).toBeTruthy();
  });
});
