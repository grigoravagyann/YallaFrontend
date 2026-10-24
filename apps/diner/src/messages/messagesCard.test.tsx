import type { Booking, DinerConversation } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../app/booking/[bookingId]';
import { useSession } from '../stores/session';
import { BookingMessagesRow } from './BookingMessagesRow';

/**
 * "Messages with the venue" on the booking (the Booking board, 2026-10-23):
 * the newest message, "1 new", "I'm coming" in one tap while the venue's ask
 * stands, and the way into the thread — and the Bookings card's row (the Main
 * board).
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getConversation: vi.fn(),
  confirmOnMyWay: vi.fn(),
  reportRunningLate: vi.fn(),
  cancelBooking: vi.fn(),
  markConversationRead: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    Stack: { Screen: () => null },
    useRouter: () => router,
    useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
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
vi.mock('../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));
vi.mock('../components/AtMyTableAction', () => ({ AtMyTableAction: () => null }));
vi.mock('../push/ReservationActions', () => ({ KeepTableAction: () => null }));
vi.mock('../push/ReminderOptIn', () => ({ ReminderOptIn: () => null }));
vi.mock('../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const HOUR = 3_600_000;
const MINUTE = 60_000;
const START = Date.now() + HOUR;

const BOOKING: Booking = {
  id: 'booking-1',
  code: 'ABC123',
  status: 'confirmed',
  venueName: 'Lava',
  branchId: 'branch-1',
  branchName: 'Abovyan',
  timeZoneId: 'Asia/Yerevan',
  tableId: 't6',
  tableLabel: '6',
  roomId: null,
  roomName: null,
  partySize: 4,
  slotUtc: new Date(START).toISOString(),
  endUtc: new Date(START + 2 * HOUR).toISOString(),
  freeCancellationUntilUtc: new Date(START - 2 * HOUR).toISOString(),
  cancelledAtUtc: null,
  cancelledAfterDeadline: false,
  note: null,
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: null,
  manageToken: null,
  promisedFreeByUtc: null,
  incomingTableRequest: null,
  staffAskedOnMyWayAtUtc: new Date(Date.now() - 2 * MINUTE).toISOString(),
  messages: {
    unread: 1,
    lastAuthor: 'venue',
    lastKind: 'askComing',
    lastText: null,
    lastAtUtc: new Date(Date.now() - 2 * MINUTE).toISOString(),
    open: true,
  },
};

function thread(overrides: Partial<DinerConversation> = {}): DinerConversation {
  return {
    conversationId: 'c1',
    subject: {
      kind: 'reservation',
      id: 'booking-1',
      venueName: 'Lava',
      branchId: 'branch-1',
      startUtc: BOOKING.slotUtc,
      localDate: null,
      localTime: '19:30',
      partySize: 4,
      tableLabel: '6',
      takeawayCode: null,
      readyAtLocal: null,
      readyAtUtc: null,
    },
    open: true,
    closesAtUtc: null,
    guestsCanWrite: true,
    venuePhone: null,
    pendingAsk: true,
    venueLastReadUtc: null,
    unreadCount: 1,
    messages: [
      {
        id: 'm1',
        author: 'venue',
        kind: 'askComing',
        text: null,
        answer: null,
        status: null,
        createdAtUtc: new Date(Date.now() - 2 * MINUTE).toISOString(),
        staffName: null,
      },
    ],
    ...overrides,
  };
}

function withQueries(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => useSession.setState({ signedIn: true }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the booking\'s "Messages with the venue" card', () => {
  it('shows the ask, "1 new", and "I\'m coming" beside "Reply" — the ask said once', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getConversation.mockResolvedValue(thread());
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('messages.card.new count=1')).toBeTruthy();
    expect(screen.getByText(/^messages\.ask time=/)).toBeTruthy();
    expect(screen.getByText('messages.card.privacy place=Lava')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'messages.bar.coming' })).toBeTruthy();
    // The "I'm coming" block no longer repeats the venue's question above it.
    expect(screen.queryByText(/^coming\.askedTitle/)).toBeNull();
    // The card shows the thread; reading it is the thread's.
    expect(gateway.markConversationRead).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'messages.card.reply' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/messages/reservation/[id]',
      params: { id: 'booking-1' },
    });
  });

  it('answers "I\'m coming" in one tap, through the on-my-way', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getConversation.mockResolvedValue(thread());
    gateway.confirmOnMyWay.mockResolvedValue({ wasReplay: false });
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'messages.bar.coming' }));
    await waitFor(() => expect(gateway.confirmOnMyWay).toHaveBeenCalledWith('booking-1'));
    expect(await screen.findByRole('button', { name: 'messages.card.open' })).toBeTruthy();
  });

  it('offers to write before anybody has', async () => {
    gateway.getBooking.mockResolvedValue({
      ...BOOKING,
      staffAskedOnMyWayAtUtc: null,
      messages: { ...BOOKING.messages!, unread: 0, lastKind: null, lastAtUtc: null },
    });
    gateway.getConversation.mockResolvedValue(
      thread({ conversationId: null, messages: [], pendingAsk: false, unreadCount: 0 }),
    );
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByRole('button', { name: 'messages.card.write' })).toBeTruthy();
    expect(screen.getByText('messages.card.none')).toBeTruthy();
    expect(screen.queryByText(/^messages\.card\.new/)).toBeNull();
  });

  it('is not there for a booking with no thread and none to open', async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, messages: null });
    render(withQueries(<BookingDetailScreen />));

    await screen.findByText('bookings.detail.title');
    await waitFor(() => expect(gateway.getBooking).toHaveBeenCalled());
    expect(screen.queryByText('messages.card.title')).toBeNull();
    expect(gateway.getConversation).not.toHaveBeenCalled();
  });
});

describe("the Bookings card's message row", () => {
  it('says "New message" with the time, the last line and the count, and opens the thread', () => {
    const onPress = vi.fn();
    render(
      <BookingMessagesRow
        row={{
          kind: 'unread',
          unread: 2,
          atUtc: '2026-10-23T14:31:00Z',
          line: { text: 'Are you coming at 19:30?' },
        }}
        place="Lava"
        timeZoneId="Asia/Yerevan"
        onPress={onPress}
      />,
    );

    expect(screen.getByText('messages.row.newAt time=18:31')).toBeTruthy();
    expect(screen.getByText('Are you coming at 19:30?')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'messages.row.unreadLabel place=Lava count=2, Are you coming at 19:30?',
      }),
    );
    expect(onPress).toHaveBeenCalled();
  });

  it('offers to write, and says when the conversation has closed', () => {
    const { rerender } = render(
      <BookingMessagesRow
        row={{ kind: 'write' }}
        place="Lava"
        timeZoneId={null}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText('messages.row.write')).toBeTruthy();
    expect(screen.getByText('messages.row.none')).toBeTruthy();

    rerender(
      <BookingMessagesRow
        row={{ kind: 'closed' }}
        place="Lava"
        timeZoneId={null}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText('messages.row.closed')).toBeTruthy();
  });
});
