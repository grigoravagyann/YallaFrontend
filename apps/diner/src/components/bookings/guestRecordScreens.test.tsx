import { NEW_GUEST_RECORD, type Booking, type GuestRecord, type MyBookings } from '@yalla/api';
import type * as ApiReactModule from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingsScreen from '../../../app/(tabs)/bookings';
import BookingDetailScreen from '../../../app/booking/[bookingId]';
import { useSession } from '../../stores/session';

/**
 * The guest's own record on the bookings tab (guest record, 2026-10-20): how
 * they kept their bookings over twelve months — what every venue they book
 * with sees, said so — the week's pause after three no-shows in three days,
 * and the bookings that pause cancelled.
 *
 * Copy is checked by key and its values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({ listBookings: vi.fn(), getBooking: vi.fn() }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ bookingId: 'blocked-1' }),
  useFocusEffect: () => undefined,
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
vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const HOUR_MS = 3_600_000;
const slot = new Date(Date.now() + 26 * HOUR_MS).toISOString();

const BLOCKED_BOOKING: Booking = {
  id: 'blocked-1',
  code: 'ABC123',
  status: 'cancelledByVenue',
  venueName: 'Yalla Demo Cafe',
  branchId: 'branch-1',
  branchName: 'Yerevan Centre',
  timeZoneId: 'Asia/Yerevan',
  tableId: 't1',
  tableLabel: '1',
  roomId: null,
  roomName: null,
  partySize: 2,
  slotUtc: slot,
  endUtc: new Date(Date.parse(slot) + 2 * HOUR_MS).toISOString(),
  freeCancellationUntilUtc: new Date(Date.now() + 20 * HOUR_MS).toISOString(),
  cancelledAtUtc: new Date().toISOString(),
  cancelledAfterDeadline: false,
  note: null,
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: null,
  cancelledBecause: 'noShowBlock',
  manageToken: null,
  promisedFreeByUtc: null,
  incomingTableRequest: null,
};

const record = (overrides: Partial<GuestRecord> = {}): GuestRecord => ({
  ...NEW_GUEST_RECORD,
  ...overrides,
});

function renderList(list: MyBookings) {
  gateway.listBookings.mockResolvedValue(list);
  useSession.setState({ signedIn: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BookingsScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useSession.setState({ signedIn: false });
});

describe('the guest’s own record on the bookings tab', () => {
  it('says how often they came out of how many, and what venues see', async () => {
    renderList({
      upcoming: [],
      past: [],
      guestRecord: record({ booked: 12, came: 11, isNewGuest: false, unmarked: 1 }),
    });

    expect(await screen.findByText('bookings.record.came came=11 count=12')).toBeTruthy();
    expect(screen.getByText('bookings.record.title')).toBeTruthy();
    expect(screen.getByText('bookings.record.unmarked count=1')).toBeTruthy();
    expect(screen.queryByText(/^bookings\.record\.noShows/u)).toBeNull();
    expect(screen.queryByText(/^bookings\.record\.lateCancellations/u)).toBeNull();
    expect(screen.getByText('privacy.guestRecord')).toBeTruthy();
    // Under Past as well: it is the guest's history.
    fireEvent.click(screen.getByRole('tab', { name: 'bookings.past' }));
    expect(await screen.findByText('bookings.record.came came=11 count=12')).toBeTruthy();
  });

  it('adds missed bookings and late cancellations when there are any', async () => {
    renderList({
      upcoming: [],
      past: [],
      guestRecord: record({
        booked: 9,
        came: 6,
        noShows: 1,
        lateCancellations: 2,
        isNewGuest: false,
      }),
    });

    expect(await screen.findByText('bookings.record.came came=6 count=9')).toBeTruthy();
    expect(screen.getByText('bookings.record.noShows count=1')).toBeTruthy();
    expect(screen.getByText('bookings.record.lateCancellations count=2')).toBeTruthy();
  });

  it('is a neutral line for a new guest', async () => {
    renderList({ upcoming: [], past: [], guestRecord: record() });

    expect(await screen.findByText('bookings.record.new')).toBeTruthy();
    expect(screen.queryByText(/^bookings\.record\.came/u)).toBeNull();
    expect(screen.queryByText('bookings.blocked.title')).toBeNull();
  });

  it('says nothing of a record the server did not send', async () => {
    renderList({ upcoming: [], past: [] });

    expect(await screen.findByText('bookings.empty.title')).toBeTruthy();
    expect(screen.queryByText('bookings.record.title')).toBeNull();
  });
});

describe('the pause on booking after three no-shows in three days', () => {
  it('says until when, day and time, at the top of the bookings tab', async () => {
    renderList({
      upcoming: [],
      past: [BLOCKED_BOOKING],
      guestRecord: record({
        booked: 3,
        noShows: 3,
        isNewGuest: false,
        blockedUntilUtc: new Date(Date.now() + 5 * 24 * HOUR_MS).toISOString(),
      }),
    });

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toMatch(/bookings\.blocked\.title date=.+ time=\d{2}:\d{2}/u);
    expect(banner.textContent).toContain('bookings.blocked.body');
  });

  it('is gone once its end has passed', async () => {
    renderList({
      upcoming: [],
      past: [],
      guestRecord: record({
        booked: 3,
        noShows: 3,
        isNewGuest: false,
        blockedUntilUtc: new Date(Date.now() - HOUR_MS).toISOString(),
      }),
    });

    expect(await screen.findByText('bookings.record.came came=0 count=3')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('words a booking the pause cancelled as such in the list, not as the venue’s cancel', async () => {
    renderList({ upcoming: [], past: [BLOCKED_BOOKING], guestRecord: record() });
    fireEvent.click(await screen.findByRole('tab', { name: 'bookings.past' }));

    expect(await screen.findByText('bookings.status.cancelledAutomatically')).toBeTruthy();
    expect(screen.getByText('bookings.noShowBlockReason')).toBeTruthy();
    expect(screen.queryByText('bookings.status.cancelledByVenue')).toBeNull();
  });

  it('words it so on the booking’s own screen too', async () => {
    gateway.getBooking.mockResolvedValue(BLOCKED_BOOKING);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <BookingDetailScreen />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('bookings.status.cancelledAutomatically')).toBeTruthy();
    expect(screen.getByText('bookings.noShowBlockReason')).toBeTruthy();
    expect(screen.queryByText('bookings.status.cancelledByVenue')).toBeNull();
  });
});
