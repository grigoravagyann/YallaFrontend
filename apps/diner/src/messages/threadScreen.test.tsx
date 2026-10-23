import { ConversationClosedError, NetworkError, type DinerConversation } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReservationThreadScreen from '../../app/messages/reservation/[id]';
import TakeawayThreadScreen from '../../app/messages/takeaway/[id]';
import { useSession } from '../stores/session';

/**
 * The thread with the venue (the Thread board, 2026-10-23): the header, the
 * messages with "seen" under the guest's, the one-tap answers to the venue's
 * "are you coming?" through the existing endpoints, the composer and what it
 * says when a send is refused, the closed note, and a venue that takes no
 * guest texts. Copy is checked by key and values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const params = vi.hoisted(() => ({ value: { id: 'r1' } as Record<string, string> }));
const gateway = vi.hoisted(() => ({
  getConversation: vi.fn(),
  sendGuestMessage: vi.fn(),
  markConversationRead: vi.fn(async () => undefined),
  getUnreadMessages: vi.fn(async () => ({ total: 0, items: [] })),
  confirmOnMyWay: vi.fn(),
  reportRunningLate: vi.fn(),
  cancelBooking: vi.fn(),
  getBooking: vi.fn(async () => null),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    Stack: { Screen: () => null },
    useRouter: () => router,
    useLocalSearchParams: () => params.value,
    // In front: the screen polls and marks read.
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

const MINUTE = 60_000;
const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE).toISOString();

function thread(overrides: Partial<DinerConversation> = {}): DinerConversation {
  return {
    conversationId: 'c1',
    subject: {
      kind: 'reservation',
      id: 'r1',
      venueName: 'Lava',
      branchId: 'b1',
      startUtc: new Date(now + 60 * MINUTE).toISOString(),
      localDate: '2026-10-23',
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
    venuePhone: '+37410000000',
    pendingAsk: true,
    venueLastReadUtc: at(20),
    unreadCount: 1,
    messages: [
      {
        id: 'm1',
        author: 'guest',
        kind: 'text',
        text: 'We are four, one high chair please',
        answer: null,
        status: null,
        createdAtUtc: at(30),
        staffName: null,
      },
      {
        id: 'm2',
        author: 'venue',
        kind: 'text',
        text: 'Of course, by table 6',
        answer: null,
        status: null,
        createdAtUtc: at(15),
        staffName: null,
      },
      {
        id: 'm3',
        author: 'venue',
        kind: 'askComing',
        text: null,
        answer: null,
        status: null,
        createdAtUtc: at(2),
        staffName: null,
      },
    ],
    ...overrides,
  };
}

function renderScreen(node: React.ReactNode = <ReservationThreadScreen />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  };
}

beforeEach(() => {
  params.value = { id: 'r1' };
  useSession.setState({ signedIn: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a booking thread', () => {
  it('shows the venue, the subject, the messages and who has seen them', async () => {
    gateway.getConversation.mockResolvedValue(thread());
    renderScreen();

    expect(await screen.findByText('Of course, by table 6')).toBeTruthy();
    expect(screen.getByText('Lava')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
    expect(screen.getByText(/messages\.subject\.booking · messages\.subject\.today/)).toBeTruthy();
    expect(screen.getByText(/messages\.subject\.guests count=4/)).toBeTruthy();
    // The guest's message was read by the venue: "seen".
    expect(screen.getByText(/^messages\.meta\.seen time=/)).toBeTruthy();
    // The venue's question, from its fields.
    expect(screen.getByText(/^messages\.ask time=/)).toBeTruthy();
    expect(screen.getByLabelText('messages.thread.call')).toBeTruthy();
    // Seen, so read: the venue's message is no longer unread.
    await waitFor(() =>
      expect(gateway.markConversationRead).toHaveBeenCalledWith({ kind: 'reservation', id: 'r1' }),
    );
  });

  it('answers "I\'m coming" in one tap, through the on-my-way', async () => {
    gateway.getConversation.mockResolvedValue(thread());
    gateway.confirmOnMyWay.mockResolvedValue({ wasReplay: false });
    renderScreen();

    fireEvent.click(await screen.findByLabelText('messages.bar.coming'));
    await waitFor(() => expect(gateway.confirmOnMyWay).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(screen.queryByText('messages.bar.title')).toBeNull());
  });

  it('says how late, through the running-late', async () => {
    gateway.getConversation.mockResolvedValue(thread());
    gateway.reportRunningLate.mockResolvedValue({ wasReplay: false });
    renderScreen();

    fireEvent.click(await screen.findByLabelText('messages.bar.late'));
    fireEvent.click(screen.getByLabelText('messages.answer.late minutes=15'));
    await waitFor(() =>
      expect(gateway.reportRunningLate).toHaveBeenCalledWith({ reservationId: 'r1', minutes: 15 }),
    );
  });

  it('asks before "not coming" cancels the booking', async () => {
    gateway.getConversation.mockResolvedValue(thread());
    gateway.cancelBooking.mockResolvedValue({ id: 'r1', status: 'cancelledByDiner' });
    renderScreen();

    fireEvent.click(await screen.findByLabelText('messages.bar.notComing'));
    expect(screen.getByText('messages.bar.noBodyPlain')).toBeTruthy();
    expect(gateway.cancelBooking).not.toHaveBeenCalled();
    // "No, I'm coming" goes back.
    fireEvent.click(screen.getByLabelText('messages.bar.keep'));
    expect(screen.queryByText('messages.bar.noBodyPlain')).toBeNull();

    fireEvent.click(screen.getByLabelText('messages.bar.notComing'));
    fireEvent.click(screen.getByLabelText('messages.bar.confirm'));
    await waitFor(() => expect(gateway.cancelBooking).toHaveBeenCalledWith('r1'));
  });

  it('sends a text, trimmed, with a command id, and shows it at once', async () => {
    gateway.getConversation.mockResolvedValue(thread({ pendingAsk: false }));
    gateway.sendGuestMessage.mockImplementation(
      () => new Promise(() => undefined), // still in flight
    );
    renderScreen();

    const field = (await screen.findByLabelText(
      'messages.composer.label place=Lava',
    )) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: '  We will be ten minutes early  ' } });
    fireEvent.click(screen.getByLabelText('messages.composer.send'));

    await waitFor(() =>
      expect(gateway.sendGuestMessage).toHaveBeenCalledWith({
        subject: { kind: 'reservation', id: 'r1' },
        text: 'We will be ten minutes early',
        clientCommandId: expect.any(String),
      }),
    );
    expect(await screen.findByText('We will be ten minutes early')).toBeTruthy();
    expect(screen.getByText('messages.meta.sending')).toBeTruthy();
    expect(field.value).toBe('');
  });

  it('keeps the words and says why when a send does not go through, and retries as the same command', async () => {
    gateway.getConversation.mockResolvedValue(thread({ pendingAsk: false }));
    gateway.sendGuestMessage.mockRejectedValue(new NetworkError({ url: '/x' }));
    renderScreen();

    const field = (await screen.findByLabelText(
      'messages.composer.label place=Lava',
    )) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByLabelText('messages.composer.send'));

    expect(await screen.findByText('messages.failure.offline')).toBeTruthy();
    await waitFor(() => expect(field.value).toBe('Hello'));

    fireEvent.click(screen.getByLabelText('messages.composer.send'));
    await waitFor(() => expect(gateway.sendGuestMessage).toHaveBeenCalledTimes(2));
    const [first, second] = gateway.sendGuestMessage.mock.calls as unknown as [
      { clientCommandId: string },
    ][];
    expect(second![0].clientCommandId).toBe(first![0].clientCommandId);
  });

  it('turns the composer into the closed note when the thread closed under it', async () => {
    gateway.getConversation.mockResolvedValue(thread({ pendingAsk: false }));
    gateway.sendGuestMessage.mockRejectedValue(new ConversationClosedError({ url: '/x' }));
    renderScreen();

    const field = await screen.findByLabelText('messages.composer.label place=Lava');
    fireEvent.change(field, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByLabelText('messages.composer.send'));

    expect(await screen.findByText('messages.thread.closed')).toBeTruthy();
    expect(screen.queryByLabelText('messages.composer.label place=Lava')).toBeNull();
  });

  it('shows a closed thread with its note and the way to call, and no composer', async () => {
    gateway.getConversation.mockResolvedValue(
      thread({ open: false, pendingAsk: false, unreadCount: 0 }),
    );
    renderScreen();

    expect(await screen.findByText('messages.thread.closed')).toBeTruthy();
    expect(screen.getByText('messages.thread.callVenue')).toBeTruthy();
    expect(screen.queryByLabelText('messages.composer.label place=Lava')).toBeNull();
    expect(screen.queryByText('messages.bar.title')).toBeNull();
    expect(screen.getByText(/messages\.subject\.ended/)).toBeTruthy();
  });

  it('says to answer with the buttons or call at a venue that takes no guest texts', async () => {
    gateway.getConversation.mockResolvedValue(thread({ guestsCanWrite: false }));
    renderScreen();

    expect(await screen.findByText('messages.thread.noWrite place=Lava')).toBeTruthy();
    expect(screen.queryByLabelText('messages.composer.label place=Lava')).toBeNull();
    // The buttons still answer.
    expect(screen.getByLabelText('messages.bar.coming')).toBeTruthy();
  });

  it('says so when the thread is gone', async () => {
    gateway.getConversation.mockResolvedValue(null);
    renderScreen();

    expect(await screen.findByText('messages.thread.notFound.title')).toBeTruthy();
  });

  it('says a venue message aloud as it arrives, once, and not the thread it opened on', async () => {
    const announce = vi
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    gateway.getConversation.mockResolvedValue(thread({ pendingAsk: false }));
    const { client } = renderScreen();
    expect(await screen.findByText('Of course, by table 6')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();

    const arrived = thread({ pendingAsk: false });
    gateway.getConversation.mockResolvedValue({
      ...arrived,
      messages: [
        ...arrived.messages,
        {
          id: 'm4',
          author: 'venue',
          kind: 'text',
          text: 'Your table is ready',
          answer: null,
          status: null,
          createdAtUtc: at(0),
          staffName: null,
        },
      ],
    });
    await client.invalidateQueries();
    expect(await screen.findByText('Your table is ready')).toBeTruthy();
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    expect(announce.mock.calls[0]![0]).toMatch(
      /^messages\.a11y\.venue place=Lava text=Your table is ready time=/,
    );

    // Read again with nothing new: nothing more is said.
    await client.invalidateQueries();
    await waitFor(() => expect(gateway.getConversation).toHaveBeenCalledTimes(3));
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('brings the answer bar back when the venue asks again', async () => {
    gateway.getConversation.mockResolvedValue(thread());
    gateway.confirmOnMyWay.mockResolvedValue({ wasReplay: false });
    const { client } = renderScreen();

    fireEvent.click(await screen.findByLabelText('messages.bar.coming'));
    await waitFor(() => expect(screen.queryByText('messages.bar.title')).toBeNull());

    const asked = thread();
    gateway.getConversation.mockResolvedValue({
      ...asked,
      messages: [
        ...asked.messages,
        {
          id: 'm5',
          author: 'venue',
          kind: 'askComing',
          text: null,
          answer: null,
          status: null,
          createdAtUtc: at(0),
          staffName: null,
        },
      ],
    });
    await client.invalidateQueries();
    expect(await screen.findByText('messages.bar.title')).toBeTruthy();
  });

  it('asks a signed-out diner to log in, and reads nothing', async () => {
    useSession.setState({ signedIn: false });
    renderScreen();

    expect(await screen.findByText('messages.thread.signedOut.title')).toBeTruthy();
    fireEvent.click(screen.getByText('messages.thread.signedOut.action'));
    expect(router.push).toHaveBeenCalledWith('/auth');
    expect(gateway.getConversation).not.toHaveBeenCalled();
  });

  it('opens with the words a push reply could not send', async () => {
    params.value = { id: 'r1', draft: 'Running ten late' };
    gateway.getConversation.mockResolvedValue(thread({ pendingAsk: false }));
    renderScreen();

    const field = (await screen.findByLabelText(
      'messages.composer.label place=Lava',
    )) as HTMLTextAreaElement;
    expect(field.value).toBe('Running ten late');
  });
});

describe('a takeaway thread', () => {
  it('invites the first message, with no answer bar', async () => {
    params.value = { id: 't1' };
    gateway.getConversation.mockResolvedValue(
      thread({
        subject: {
          kind: 'takeaway',
          id: 't1',
          venueName: 'Lava',
          branchId: 'b1',
          startUtc: null,
          localDate: null,
          localTime: null,
          partySize: null,
          tableLabel: null,
          takeawayCode: 'T-482',
          readyAtLocal: '19:10',
          readyAtUtc: '2026-10-23T15:10:00Z',
        },
        pendingAsk: false,
        unreadCount: 0,
        messages: [],
      }),
    );
    renderScreen(<TakeawayThreadScreen />);

    expect(await screen.findByText('messages.thread.emptyTakeaway place=Lava')).toBeTruthy();
    expect(
      screen.getByText(/messages\.subject\.takeaway · T-482 · messages\.subject\.ready/),
    ).toBeTruthy();
    expect(gateway.getConversation).toHaveBeenCalledWith({ kind: 'takeaway', id: 't1' });
    expect(screen.queryByText('messages.bar.title')).toBeNull();
    expect(gateway.markConversationRead).not.toHaveBeenCalled();
  });
});
