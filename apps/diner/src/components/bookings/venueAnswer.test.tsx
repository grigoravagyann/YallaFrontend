import type { Booking } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../../app/booking/[bookingId]';
import SuccessScreen from '../../../app/reserve/success';
import { VenueAnswerNote } from './VenueAnswer';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * A booking for tonight, waiting for the venue's floor: the diner sees the
 * minutes the venue has left to answer on the success screen, the booking
 * card and its detail, and once it is decided, which way — sorry, when nobody
 * answered in time; that the venue could not, when somebody said no.
 *
 * Copy is checked by key and its values: the sentences are pinned in the
 * shared helper's tests, and this is about which one each screen shows.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({ getBooking: vi.fn() }));

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
    t: (key: string, params?: { time?: string }) => (params?.time ? `${key} ${params.time}` : key),
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
vi.mock('../../push/ReminderOptIn', () => ({ ReminderOptIn: () => 'reminder-opt-in' }));

const HOUR_MS = 3_600_000;
const slot = new Date(Date.now() + 3 * HOUR_MS).toISOString();

const BOOKING: Booking = {
  id: 'booking-1',
  code: 'ABC123',
  status: 'pendingApproval',
  venueName: 'Yalla Demo Cafe',
  branchId: 'branch-1',
  branchName: 'Yerevan Centre',
  timeZoneId: 'Asia/Yerevan',
  tableId: 't1',
  tableLabel: '1',
  bookedWithoutTable: false,
  roomId: null,
  roomName: null,
  partySize: 2,
  slotUtc: slot,
  endUtc: new Date(Date.now() + 5 * HOUR_MS).toISOString(),
  freeCancellationUntilUtc: new Date(Date.now() + HOUR_MS).toISOString(),
  cancelledAtUtc: null,
  cancelledAfterDeadline: false,
  note: null,
  awaitingApprovalBecause: 'shortNotice',
  // Twelve minutes and change: the countdown reads 12:xx.
  approvalExpiresAtUtc: new Date(Date.now() + 12 * 60_000 + 30_000).toISOString(),
  declinedBecause: null,
  manageToken: null,
};

const DECLINED: Booking = {
  ...BOOKING,
  status: 'cancelledByVenue',
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: 'noAnswer',
  cancelledAtUtc: new Date().toISOString(),
};

function withQueries(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  gateway.getBooking.mockReset();
});

describe('the note on a booking', () => {
  it('counts the venue’s answer down while it decides', () => {
    render(<VenueAnswerNote booking={BOOKING} />);
    expect(screen.getByText(/^booking\.approval\.waiting 12:\d\d$/u)).toBeTruthy();
  });

  it('says only that it is waiting once the clock here runs out', () => {
    const late = { ...BOOKING, approvalExpiresAtUtc: new Date(Date.now() - 1000).toISOString() };
    render(<VenueAnswerNote booking={late} />);
    expect(screen.getByText('booking.approval.checking')).toBeTruthy();
  });

  it('apologises when nobody answered, and says the venue could not when somebody said no', () => {
    render(<VenueAnswerNote booking={DECLINED} />);
    expect(screen.getByText('booking.declined.noAnswer')).toBeTruthy();
    cleanup();
    render(<VenueAnswerNote booking={{ ...DECLINED, declinedBecause: 'staffDeclined' }} />);
    expect(screen.getByText('booking.declined.byVenue')).toBeTruthy();
  });

  it('says nothing for a confirmed booking, or one that waits without a clock', () => {
    const largeParty: Booking = {
      ...BOOKING,
      awaitingApprovalBecause: 'largeParty',
      approvalExpiresAtUtc: null,
    };
    const { container } = render(
      <>
        <VenueAnswerNote
          booking={{ ...BOOKING, status: 'confirmed', approvalExpiresAtUtc: null }}
        />
        <VenueAnswerNote booking={largeParty} />
      </>,
    );
    expect(container.textContent).toBe('');
  });
});

/*
 * Waiting on the guest before: in the app, they answer themselves; for a guest
 * the floor has to ring, the venue checks with them. Both now run the same
 * two-hour clock, so the clock no longer says whose answer it is — the
 * server's `awaitsEarlierGuestAnswer` does (QA round 2).
 */
describe('a booking waiting on the guest before', () => {
  const asking: Booking = {
    ...BOOKING,
    awaitingApprovalBecause: 'earlierGuestConsent',
    approvalExpiresAtUtc: new Date(Date.now() + 30 * 60_000).toISOString(),
  };

  it('says the guest before is asked when they answer in the app', () => {
    render(<VenueAnswerNote booking={{ ...asking, awaitsEarlierGuestAnswer: true }} />);
    expect(screen.getByText(/^booking\.approval\.waitingEarlierGuest /u)).toBeTruthy();
  });

  it('says the venue is checking with them when the floor decides, clock and all', () => {
    render(<VenueAnswerNote booking={{ ...asking, awaitsEarlierGuestAnswer: false }} />);
    expect(screen.getByText(/^booking\.approval\.waitingVenueEarlierGuest /u)).toBeTruthy();
    expect(screen.queryByText(/^booking\.approval\.waitingEarlierGuest /u)).toBeNull();
  });

  it('keeps the neutral sentence when the server does not say whose answer it is', () => {
    render(<VenueAnswerNote booking={asking} />);
    expect(screen.getByText(/^booking\.approval\.waitingEarlierGuest /u)).toBeTruthy();
  });

  it('says the same once the clock here runs out', () => {
    const late = { ...asking, approvalExpiresAtUtc: new Date(Date.now() - 1000).toISOString() };
    render(<VenueAnswerNote booking={{ ...late, awaitsEarlierGuestAnswer: true }} />);
    expect(screen.getByText('booking.approval.checkingEarlierGuest')).toBeTruthy();
    cleanup();
    render(<VenueAnswerNote booking={{ ...late, awaitsEarlierGuestAnswer: false }} />);
    expect(screen.getByText('booking.approval.checkingVenueEarlierGuest')).toBeTruthy();
  });

  it('on the success screen, says who will be asked', async () => {
    gateway.getBooking.mockResolvedValue({ ...asking, awaitsEarlierGuestAnswer: true });
    render(withQueries(<SuccessScreen />));
    expect(await screen.findByText('table.requestable.earlierGuest')).toBeTruthy();
    cleanup();

    gateway.getBooking.mockResolvedValue({ ...asking, awaitsEarlierGuestAnswer: false });
    render(withQueries(<SuccessScreen />));
    expect(await screen.findByText('booking.approval.venueAsksEarlierGuest')).toBeTruthy();
    expect(screen.queryByText('table.requestable.earlierGuest')).toBeNull();
    // And the floor's countdown under it names the venue.
    expect(screen.getByText(/^booking\.approval\.waitingVenueEarlierGuest /u)).toBeTruthy();
  });
});

describe('the success screen', () => {
  it('says the request is in, why the venue checks first, and how long it has', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    render(withQueries(<SuccessScreen />));

    expect(await screen.findByText('success.pendingTitle')).toBeTruthy();
    expect(screen.getByText('booking.approval.why')).toBeTruthy();
    expect(screen.getByText(/^booking\.approval\.waiting 12:\d\d$/u)).toBeTruthy();
  });

  it('says sorry when nobody answered, and offers no reminder', async () => {
    gateway.getBooking.mockResolvedValue(DECLINED);
    render(withQueries(<SuccessScreen />));

    expect(await screen.findByText('booking.declined.noAnswerTitle')).toBeTruthy();
    expect(screen.getByText('booking.declined.noAnswer')).toBeTruthy();
    expect(screen.queryByText('success.pendingTitle')).toBeNull();
    expect(screen.queryByText('reminder-opt-in')).toBeNull();
    // A code that opens no table is not one to read out at a door, or share.
    expect(screen.queryByText('success.codeLabel')).toBeNull();
    expect(screen.queryByText('success.share')).toBeNull();
  });
});

describe('the booking detail', () => {
  it('names a declined booking "not confirmed" and says why, not when it was cancelled', async () => {
    gateway.getBooking.mockResolvedValue(DECLINED);
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('bookings.status.declined')).toBeTruthy();
    // The note, once in the card; not a cancellation date.
    expect(screen.getAllByText('booking.declined.noAnswer').length).toBeGreaterThan(0);
    expect(screen.queryByText('bookings.detail.cancelledOn')).toBeNull();
    expect(screen.queryByText('bookings.status.cancelledByVenue')).toBeNull();
  });

  it('counts down on a booking still waiting for the venue', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText(/^booking\.approval\.waiting 12:\d\d$/u)).toBeTruthy();
    expect(screen.getByText('bookings.status.pendingApproval')).toBeTruthy();
  });
});
