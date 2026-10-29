import type { Booking } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../../app/booking/[bookingId]';
import SuccessScreen from '../../../app/reserve/success';
import { BookingHeroCard, BookingRow } from './BookingCard';
import { anotherTimeRoute } from './changeBooking';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * What a booking says once it is not simply confirmed (QA round 2,
 * 2026-10-18): a declined booking offers a way forward, a request still
 * waiting never reads as a held table, and the earlier guest's promise stays
 * on their booking for good.
 *
 * Copy is checked by key and its values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({ getBooking: vi.fn(), answerTableRequest: vi.fn() }));

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
    t: (key: string, params?: Record<string, string | number>) =>
      params && Object.keys(params).length > 0
        ? `${key} ${Object.entries(params)
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
vi.mock('../../push/ReminderOptIn', () => ({
  ReminderOptIn: ({ pending }: { pending?: boolean }) =>
    pending ? 'reminder-opt-in pending' : 'reminder-opt-in',
}));
vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const HOUR_MS = 3_600_000;
const slot = new Date(Date.now() + 26 * HOUR_MS).toISOString();

const CONFIRMED: Booking = {
  id: 'booking-1',
  code: 'ABC123',
  status: 'confirmed',
  venueName: 'Yalla Demo Cafe',
  branchId: 'branch-1',
  branchName: 'Yerevan Centre',
  timeZoneId: 'Asia/Yerevan',
  tableId: 't1',
  tableLabel: '1',
  bookedWithoutTable: false,
  roomId: null,
  roomName: null,
  partySize: 3,
  slotUtc: slot,
  endUtc: new Date(Date.parse(slot) + 2 * HOUR_MS).toISOString(),
  freeCancellationUntilUtc: new Date(Date.now() + 20 * HOUR_MS).toISOString(),
  cancelledAtUtc: null,
  cancelledAfterDeadline: false,
  note: null,
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: null,
  manageToken: null,
  promisedFreeByUtc: null,
  incomingTableRequest: null,
};

const PENDING: Booking = {
  ...CONFIRMED,
  status: 'pendingApproval',
  awaitingApprovalBecause: 'earlierGuestConsent',
  approvalExpiresAtUtc: new Date(Date.now() + HOUR_MS).toISOString(),
};

const declined = (declinedBecause: NonNullable<Booking['declinedBecause']>): Booking => ({
  ...CONFIRMED,
  status: 'cancelledByVenue',
  declinedBecause,
  cancelledAtUtc: new Date().toISOString(),
});

function withQueries(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  gateway.getBooking.mockReset();
  router.push.mockReset();
});

describe('a declined booking offers another time', () => {
  it.each(['earlierGuestDeclined', 'earlierGuestNoAnswer', 'noAnswer', 'staffDeclined'] as const)(
    'on its detail, declined for %s: the same place, day and party',
    async (reason) => {
      const booking = declined(reason);
      gateway.getBooking.mockResolvedValue(booking);
      render(withQueries(<BookingDetailScreen />));

      fireEvent.click(
        await screen.findByRole('button', { name: 'bookings.detail.chooseAnotherTime' }),
      );
      expect(router.push).toHaveBeenCalledWith(anotherTimeRoute(booking));
    },
  );

  it('on the success screen, when the answer arrives there', async () => {
    gateway.getBooking.mockResolvedValue(declined('earlierGuestDeclined'));
    render(withQueries(<SuccessScreen />));

    fireEvent.click(
      await screen.findByRole('button', { name: 'bookings.detail.chooseAnotherTime' }),
    );
    expect(router.push).toHaveBeenCalledWith(anotherTimeRoute(declined('earlierGuestDeclined')));
  });

  it('not for a confirmed booking, or one the diner cancelled', async () => {
    gateway.getBooking.mockResolvedValue(CONFIRMED);
    render(withQueries(<BookingDetailScreen />));
    await screen.findByText('bookings.status.confirmed');
    expect(screen.queryByRole('button', { name: 'bookings.detail.chooseAnotherTime' })).toBeNull();
    cleanup();

    gateway.getBooking.mockResolvedValue({ ...CONFIRMED, status: 'cancelledByDiner' });
    render(withQueries(<BookingDetailScreen />));
    await screen.findByText('bookings.status.cancelledByDiner');
    expect(screen.queryByRole('button', { name: 'bookings.detail.chooseAnotherTime' })).toBeNull();
  });

  it('says its code was never confirmed, not that it was cancelled', async () => {
    gateway.getBooking.mockResolvedValue(declined('earlierGuestDeclined'));
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('bookings.detail.codeDeclined')).toBeTruthy();
    expect(screen.queryByText('bookings.detail.codeCancelled')).toBeNull();
  });
});

describe('a request still waiting, on the success screen', () => {
  it('never reads as a held table, or tells the diner to tap in at it', async () => {
    gateway.getBooking.mockResolvedValue(PENDING);
    render(withQueries(<SuccessScreen />));

    expect(await screen.findByText('success.pendingTitle')).toBeTruthy();
    expect(screen.queryByText('success.atTableHint')).toBeNull();
    expect(screen.getByText('reminder-opt-in pending')).toBeTruthy();
  });

  it('a confirmed booking still has both', async () => {
    gateway.getBooking.mockResolvedValue(CONFIRMED);
    render(withQueries(<SuccessScreen />));

    expect(await screen.findByText('success.confirmedTitle')).toBeTruthy();
    expect(screen.getByText('success.atTableHint')).toBeTruthy();
    expect(screen.getByText('reminder-opt-in')).toBeTruthy();
  });
});

describe('the earlier guest’s promise', () => {
  // 19:40 in Yerevan, before the 20:xx end: the promise cut the sitting to it.
  const promised: Booking = {
    ...CONFIRMED,
    slotUtc: '2099-10-20T14:00:00.000Z',
    endUtc: '2099-10-20T15:40:00.000Z',
    promisedFreeByUtc: '2099-10-20T15:40:00.000Z',
  };

  it('is said plainly on the booking detail, from the booking itself', async () => {
    gateway.getBooking.mockResolvedValue(promised);
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('booking.freeBy.promisedNote time=19:40')).toBeTruthy();
  });

  it('is said on the bookings hero card', () => {
    render(
      withQueries(
        <BookingHeroCard
          booking={promised}
          now={new Date()}
          onOpen={() => undefined}
          onCancel={() => undefined}
        />,
      ),
    );
    expect(screen.getByText('booking.freeBy.promisedNote time=19:40')).toBeTruthy();
  });

  it('is in the hero’s name, which a screen reader reads in place of what it holds', () => {
    render(
      withQueries(
        <BookingHeroCard
          booking={promised}
          now={new Date()}
          onOpen={() => undefined}
          onCancel={() => undefined}
        />,
      ),
    );
    expect(
      screen.getByRole('button', { name: /booking\.freeBy\.promisedNote time=19:40/u }),
    ).toBeTruthy();
  });

  it('is not said where there is no promise', () => {
    render(
      withQueries(
        <BookingHeroCard
          booking={CONFIRMED}
          now={new Date()}
          onOpen={() => undefined}
          onCancel={() => undefined}
        />,
      ),
    );
    expect(screen.queryByText(/booking\.freeBy\.promisedNote/u)).toBeNull();
  });
});

describe('the bookings hero card, to a screen reader', () => {
  it('says the venue’s answer it shows while the booking waits', () => {
    const waiting: Booking = {
      ...PENDING,
      awaitingApprovalBecause: 'shortNotice',
      approvalExpiresAtUtc: new Date(Date.now() + 12 * 60_000 + 30_000).toISOString(),
    };
    render(
      withQueries(
        <BookingHeroCard
          booking={waiting}
          now={new Date()}
          onOpen={() => undefined}
          onCancel={() => undefined}
        />,
      ),
    );
    expect(
      screen.getByRole('button', { name: /booking\.approval\.waiting time=12:\d\d/u }),
    ).toBeTruthy();
  });
});

describe('the bookings list row, to a screen reader', () => {
  it('says there is a request for the table when the card shows one', () => {
    const asked: Booking = {
      ...CONFIRMED,
      incomingTableRequest: {
        requestId: 'request-1',
        requestedStartUtc: CONFIRMED.endUtc,
        freeByUtc: CONFIRMED.endUtc,
        expiresAtUtc: new Date(Date.now() + HOUR_MS).toISOString(),
      },
    };
    render(withQueries(<BookingRow booking={asked} now={new Date()} onOpen={() => undefined} />));
    expect(screen.getByRole('button', { name: /booking\.tableRequest\.title/u })).toBeTruthy();
    cleanup();

    render(
      withQueries(<BookingRow booking={CONFIRMED} now={new Date()} onOpen={() => undefined} />),
    );
    expect(screen.queryByRole('button', { name: /booking\.tableRequest\.title/u })).toBeNull();
  });
});

describe('a booking made by time only (2026-10-29)', () => {
  // Pre-orders open for it, as the server might still say: it never offers one.
  const byTime: Booking = {
    ...CONFIRMED,
    tableId: null,
    tableLabel: null,
    bookedWithoutTable: true,
    note: 'By the window',
    preOrderEditableUntilUtc: new Date(Date.parse(slot) - 2 * HOUR_MS).toISOString(),
  };

  it('says the venue chooses the table, offers no change or pre-order, and keeps cancel', async () => {
    gateway.getBooking.mockResolvedValue(byTime);
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('booking.byTime.table')).toBeTruthy();
    expect(screen.queryByText(/^tables\.table/u)).toBeNull();
    expect(screen.getByText('booking.byTime.noChange')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'bookings.change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'preOrder.add' })).toBeNull();
    expect(screen.getByRole('button', { name: 'bookings.detail.cancel' })).toBeTruthy();
    // The wish went to the venue as the note, and is shown as the wish.
    expect(screen.getByText('book.byTime.wishTitle')).toBeTruthy();
    expect(screen.getByText('By the window')).toBeTruthy();
  });

  it('on the hero card: "On arrival" for the table, no pre-order, cancel kept', () => {
    render(
      withQueries(
        <BookingHeroCard
          booking={byTime}
          now={new Date()}
          onOpen={() => undefined}
          onCancel={() => undefined}
          onPreOrder={() => undefined}
        />,
      ),
    );
    expect(screen.getByText('booking.byTime.tableShort')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'preOrder.add' })).toBeNull();
    expect(screen.getByRole('button', { name: 'booking.cancel' })).toBeTruthy();
  });

  it('a table booking still offers its pre-order', () => {
    render(
      withQueries(
        <BookingHeroCard
          booking={{ ...byTime, tableId: 't1', tableLabel: '1', bookedWithoutTable: false }}
          now={new Date()}
          onOpen={() => undefined}
          onCancel={() => undefined}
          onPreOrder={() => undefined}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: 'preOrder.add' })).toBeTruthy();
  });

  it('on the success screen, the table is left to the venue', async () => {
    gateway.getBooking.mockResolvedValue(byTime);
    render(withQueries(<SuccessScreen />));

    expect(await screen.findByText('booking.byTime.table')).toBeTruthy();
    expect(screen.queryByText('preOrder.add')).toBeNull();
  });
});
