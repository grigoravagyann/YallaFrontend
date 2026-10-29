import type { Booking, PreOrder } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../../app/booking/[bookingId]';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * "I'm coming" on the booking (2026-10-22): from two hours before the start
 * until it ends, the guest says they are coming, running late 10 / 15 / 30, or
 * not coming (the ordinary cancel, asked first in place); the venue's "are you
 * coming?" shows as a banner until they answer; an answer turns green.
 *
 * Copy is checked by key and its values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({
  getBooking: vi.fn(),
  confirmOnMyWay: vi.fn(),
  reportRunningLate: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
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
  return {
    id: 'booking-1',
    code: 'ABC123',
    status: 'confirmed',
    venueName: 'Lava',
    branchId: 'branch-1',
    branchName: 'Abovyan',
    timeZoneId: 'Asia/Yerevan',
    tableId: 't6',
    tableLabel: '6',
    bookedWithoutTable: false,
    roomId: null,
    roomName: null,
    partySize: 4,
    slotUtc: new Date(startMs).toISOString(),
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

function preOrderFor(booking: Booking): PreOrder {
  return {
    id: 'po-1',
    reservationId: booking.id,
    state: 'locked',
    lines: [
      {
        id: 'l-1',
        menuItemId: 'khorovats',
        name: 'Khorovats',
        unitPriceDram: 4500,
        quantity: 2,
        lineTotalDram: 9000,
        note: null,
        availableNow: true,
      },
    ],
    note: null,
    totalDram: 9000,
    editableUntilUtc: new Date(Date.parse(booking.slotUtc) - 2 * HOUR_MS).toISOString(),
    dueAtUtc: new Date(Date.parse(booking.slotUtc) - 30 * MINUTE_MS).toISOString(),
    sentAtUtc: null,
    kitchenStatus: null,
    onTab: false,
    notComingAtUtc: null,
    updatedAtUtc: new Date().toISOString(),
  };
}

/** An hour away: inside the window, before the "are you on your way?" push. */
const IN_AN_HOUR = Date.now() + HOUR_MS;
const PLAIN = bookingAt(IN_AN_HOUR);
const WITH_PRE_ORDER = { ...PLAIN, preOrder: preOrderFor(PLAIN) };

function withQueries(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  Object.values(gateway).forEach((fn) => fn.mockReset());
});

describe('the "I\'m coming" block', () => {
  it('offers the three answers from two hours before, with the pre-order helper', async () => {
    gateway.getBooking.mockResolvedValue(WITH_PRE_ORDER);
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByRole('button', { name: 'coming.imComing' })).toBeTruthy();
    expect(screen.getByText('coming.helper')).toBeTruthy();
    for (const minutes of [10, 15, 30]) {
      expect(screen.getByRole('button', { name: `coming.late minutes=${minutes}` })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'coming.notComing' })).toBeTruthy();
    expect(screen.getByText('coming.preOrderWaiting')).toBeTruthy();
    // The older 30-minute question is not asked beside it.
    expect(screen.queryByText('preOrder.onYourWay.title')).toBeNull();
  });

  it('says nothing about the kitchen for a booking without a pre-order', async () => {
    gateway.getBooking.mockResolvedValue(PLAIN);
    render(withQueries(<BookingDetailScreen />));
    expect(await screen.findByText('coming.helperPlain')).toBeTruthy();
    expect(screen.queryByText('coming.preOrderWaiting')).toBeNull();
  });

  it('is not there more than two hours before', async () => {
    gateway.getBooking.mockResolvedValue(bookingAt(Date.now() + 3 * HOUR_MS));
    render(withQueries(<BookingDetailScreen />));
    await screen.findByRole('button', { name: 'bookings.detail.cancel' });
    expect(screen.queryByRole('button', { name: 'coming.imComing' })).toBeNull();
  });

  it('nor for a booking still waiting for the venue', async () => {
    gateway.getBooking.mockResolvedValue({ ...PLAIN, status: 'pendingApproval' });
    render(withQueries(<BookingDetailScreen />));
    await screen.findByText('bookings.detail.title');
    await waitFor(() => expect(gateway.getBooking).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'coming.imComing' })).toBeNull();
  });

  it('"I\'m coming" tells the venue, and turns green', async () => {
    gateway.getBooking.mockResolvedValue(WITH_PRE_ORDER);
    gateway.confirmOnMyWay.mockImplementation(async () => {
      const at = new Date().toISOString();
      gateway.getBooking.mockResolvedValue({ ...WITH_PRE_ORDER, guestConfirmedOnWayAtUtc: at });
      return { reservationId: 'booking-1', guestConfirmedOnWayAtUtc: at, wasReplay: false };
    });
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'coming.imComing' }));
    await waitFor(() => expect(gateway.confirmOnMyWay).toHaveBeenCalledWith('booking-1'));
    expect(await screen.findByText('coming.comingTitle')).toBeTruthy();
    expect(screen.getByText(/^coming\.comingBody time=/)).toBeTruthy();
    expect(screen.getByText('coming.preOrderGoing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'coming.imComing' })).toBeNull();
  });

  it('"Late 15" says so, and how long the table is held', async () => {
    gateway.getBooking.mockResolvedValue(PLAIN);
    gateway.reportRunningLate.mockImplementation(async ({ minutes }: { minutes: number }) => {
      const at = new Date().toISOString();
      gateway.getBooking.mockResolvedValue({
        ...PLAIN,
        guestRunningLateMinutes: minutes,
        guestRunningLateAtUtc: at,
      });
      return {
        reservationId: 'booking-1',
        guestRunningLateMinutes: minutes,
        guestRunningLateAtUtc: at,
        expectedArrivalUtc: new Date(IN_AN_HOUR + minutes * MINUTE_MS).toISOString(),
      };
    });
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'coming.late minutes=15' }));
    await waitFor(() =>
      expect(gateway.reportRunningLate).toHaveBeenCalledWith({
        reservationId: 'booking-1',
        minutes: 15,
      }),
    );
    expect(await screen.findByText('coming.lateTitle minutes=15')).toBeTruthy();
    expect(screen.getByText(/^coming\.lateBody time=/)).toBeTruthy();
  });

  it('an answer may be changed', async () => {
    gateway.getBooking.mockResolvedValue({
      ...PLAIN,
      guestConfirmedOnWayAtUtc: new Date().toISOString(),
    });
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'coming.change' }));
    expect(screen.getByRole('button', { name: 'coming.late minutes=30' })).toBeTruthy();
  });

  it('"Not coming" asks first, then cancels the booking', async () => {
    gateway.getBooking.mockResolvedValue(WITH_PRE_ORDER);
    gateway.cancelBooking.mockResolvedValue({ ...WITH_PRE_ORDER, status: 'cancelledByDiner' });
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'coming.notComing' }));
    expect(screen.getByText('coming.confirmTitle')).toBeTruthy();
    expect(screen.getByText('coming.confirmBody')).toBeTruthy();
    expect(gateway.cancelBooking).not.toHaveBeenCalled();

    // "No, keep the booking" goes back to the answers.
    fireEvent.click(screen.getByRole('button', { name: 'coming.confirmKeep' }));
    fireEvent.click(screen.getByRole('button', { name: 'coming.notComing' }));
    fireEvent.click(screen.getByRole('button', { name: 'coming.confirmYes' }));
    await waitFor(() => expect(gateway.cancelBooking).toHaveBeenCalledWith('booking-1'));
    expect(await screen.findByText('coming.notComingTitle')).toBeTruthy();
  });

  it('a failed cancel stays open, saying so', async () => {
    gateway.getBooking.mockResolvedValue(PLAIN);
    gateway.cancelBooking.mockRejectedValue(new Error('boom'));
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'coming.notComing' }));
    fireEvent.click(screen.getByRole('button', { name: 'coming.confirmYes' }));
    expect(await screen.findByText('bookings.detail.cancelFailed')).toBeTruthy();
    expect(screen.getByText('coming.confirmTitle')).toBeTruthy();
  });
});

describe('the venue asking', () => {
  it('shows "{venue} is asking: are you coming?" until the guest answers', async () => {
    const askedAt = new Date(Date.now() - 5 * MINUTE_MS).toISOString();
    gateway.getBooking.mockResolvedValue({ ...WITH_PRE_ORDER, staffAskedOnMyWayAtUtc: askedAt });
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('coming.askedTitle place=Lava')).toBeTruthy();
    expect(screen.getByText(/^coming\.askedBody time=/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'coming.imComing' })).toBeTruthy();
  });

  it('says nothing more once the guest has answered', async () => {
    gateway.getBooking.mockResolvedValue({
      ...PLAIN,
      staffAskedOnMyWayAtUtc: new Date(Date.now() - 5 * MINUTE_MS).toISOString(),
      guestRunningLateMinutes: 10,
      guestRunningLateAtUtc: new Date().toISOString(),
    });
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('coming.lateTitle minutes=10')).toBeTruthy();
    expect(screen.queryByText(/^coming\.askedTitle/)).toBeNull();
  });
});
