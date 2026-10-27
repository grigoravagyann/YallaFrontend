// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  ConversationClosedError,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffMockOptions,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import type { StaffConversationListItem } from '@yalla/api';
import { isNearBottom, messageKey } from './messages/MessageThread';
import { railConversations } from './messages/MessagesRailSection';
import { heldUntil, lastLine, shortName, statusText, templateDraft } from './messages/messageText';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * Guest messages on the floor tablet (2026-10-23, the Rail and Inbox
 * artboards).
 *
 * - The top bar's Messages tab, with the guest messages nobody has read on
 *   it; never on the kitchen's own screen.
 * - The Now rail's "Messages": the guests waiting for us, the one waited on
 *   past "remind after" first, in red, with a chime; "OK, we'll wait" in one
 *   tap on an answer, and "Reply".
 * - A table tile's message badge.
 * - `/staff/messages`: All / Unanswered / Takeaway, the conversation with who
 *   wrote each venue message, Call, "Ask: are you coming?" on a booking, the
 *   ready replies filling the field, the composer, and the closed and
 *   read-only states.
 *
 * The staff mock's `seedMessages`, in the design's words: Ani (table 5) said
 * she is 15 minutes late a minute ago, Karen (T-485) asked to come early four
 * minutes ago, Davit (table 8) was asked and has not answered, Mariam (table
 * 3) was answered an hour ago.
 */

const session = vi.hoisted(() => {
  let current: unknown = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: unknown) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const chime = vi.hoisted(() => ({ play: vi.fn(async () => true) }));

vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    roster: async () => [],
    signOut: async () => undefined,
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => useSyncExternalStore(session.subscribe, session.get),
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});
vi.mock('./chime', () => ({ primeChime: () => undefined, playChime: chime.play }));

const { StaffRoute } = await import('./StaffRoute');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(role: 'waiter' | 'kitchen' | 'manager' = 'waiter'): void {
  session.set({
    state: 'signedIn',
    device,
    identity: {
      staffMemberId: 's1',
      fullName: 'Sona Vardanyan',
      role,
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

function gatewayWith(options: Partial<StaffMockOptions> = {}): StaffGateway {
  return createStaffMockGateway({
    latencyMs: 0,
    branchId: BRANCH,
    seedMessages: true,
    staffName: 'Sona Vardanyan',
    ...options,
  });
}

function renderAt(gateway: StaffGateway, path = '/staff'): QueryClient {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter initialEntries={[path]}>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return queryClient;
}

const setupUser = () => userEvent.setup({ delay: null });

async function views(): Promise<HTMLElement> {
  return screen.findByRole('navigation', { name: 'Screens' }, { timeout: 5000 });
}

async function railMessages(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: /^Messages/u }, { timeout: 5000 });
}

async function railCard(name: RegExp): Promise<HTMLElement> {
  return within(await railMessages()).findByRole('listitem', { name }, { timeout: 5000 });
}

async function openInbox(user: ReturnType<typeof setupUser>): Promise<void> {
  await user.click(await within(await views()).findByRole('button', { name: /^Messages/u }));
  await screen.findByRole('region', { name: 'Conversations' });
}

function conversations(): HTMLElement {
  return screen.getByRole('region', { name: 'Conversations' });
}

async function thread(name: RegExp): Promise<HTMLElement> {
  return screen.findByRole('region', { name }, { timeout: 5000 });
}

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

beforeEach(() => {
  // Five in the afternoon in Yerevan: every seed is today.
  vi.useFakeTimers({
    now: new Date('2026-10-23T13:00:00Z'),
    toFake: ['Date'],
    shouldAdvanceTime: true,
  });
  chime.play.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  resetCommandStore();
});

describe('the words', () => {
  it('shortens a name to the first and an initial, as the design does', () => {
    expect(shortName('Անի Մելքոնյան')).toBe('Անի Մ.');
    expect(shortName('Ani')).toBe('Ani');
  });

  it('turns a ready reply’s ellipsis into room to carry on typing', () => {
    expect(templateDraft('Something has run out…')).toBe('Something has run out ');
    expect(templateDraft('Your table is ready')).toBe('Your table is ready');
  });

  it('holds the table until the start plus the minutes late', () => {
    expect(heldUntil('19:30', 15)).toBe('19:45');
    expect(heldUntil('23:50', 30)).toBe('00:20');
    expect(heldUntil(null, 15)).toBeNull();
  });

  it('says the system line from the answer it names: "Booking updated · coming"', () => {
    const t = i18next.getFixedT('en', ['staff', 'common']);
    const line = (
      answer: 'coming' | 'late' | 'notComing',
      held: string | null,
      cancelled = false,
    ) => statusText(t, { answer, heldUntilLocal: held, cancelled });
    expect(line('coming', null)).toBe('Booking updated · coming');
    expect(line('late', '19:45')).toBe('Booking updated · table held until 19:45');
    expect(line('notComing', null, true)).toBe('Booking cancelled');
  });

  it("gives an inbox row the guest's answer and the held-until from the latest status", () => {
    const t = i18next.getFixedT('en', ['staff', 'common']);
    const row: StaffConversationListItem = {
      conversationId: 'c-1',
      subject: {
        kind: 'reservation',
        id: 'r-1',
        label: '5',
        guestName: 'Անի Մելքոնյան',
        localTime: '19:30',
        localDate: '2026-10-23',
        partySize: 4,
        itemCount: null,
        totalAmd: null,
      },
      lastMessage: {
        author: 'guest',
        kind: 'answer',
        text: null,
        createdAtUtc: '2026-10-23T15:20:00Z',
        staffName: null,
        answer: { kind: 'late', lateMinutes: 15 },
      },
      latestStatus: { answer: 'late', heldUntilLocal: '19:50', cancelled: false },
      unreadFromGuest: 1,
      awaitingGuestAnswer: false,
      oldestUnansweredGuestMessageUtc: '2026-10-23T15:20:00Z',
      open: true,
    };
    // The server's held-until wins over the start plus the minutes.
    expect(lastLine(t, row)).toBe('Running 15 minutes late · held until 19:50');
    expect(lastLine(t, { ...row, latestStatus: null })).toBe(
      'Running 15 minutes late · held until 19:45',
    );
    expect(
      lastLine(t, {
        ...row,
        lastMessage: { ...row.lastMessage!, answer: { kind: 'coming', lateMinutes: null } },
        latestStatus: { answer: 'coming', heldUntilLocal: null, cancelled: false },
      }),
    ).toBe('I’m coming');
  });
});

describe('the log and the rail, as rules', () => {
  it('follows the newest message only while the reader is at it', () => {
    // 1000 tall, 400 in view: at the end, and just above it.
    expect(isNearBottom(600, 400, 1000)).toBe(true);
    expect(isNearBottom(540, 400, 1000)).toBe(true);
    // Scrolled up to read back.
    expect(isNearBottom(200, 400, 1000)).toBe(false);
  });

  it('keys a sent message by its send, pending or settled', () => {
    expect(messageKey({ id: 'pending:cmd-1', clientCommandId: 'cmd-1' })).toBe('cmd:cmd-1');
    expect(messageKey({ id: 'm-9', clientCommandId: 'cmd-1' })).toBe('cmd:cmd-1');
    expect(messageKey({ id: 'm-1' })).toBe('m-1');
  });

  it('keeps an answer on the rail while unread, and never makes it wait', () => {
    const row = (
      id: string,
      overrides: Partial<StaffConversationListItem>,
    ): StaffConversationListItem => ({
      conversationId: `c-${id}`,
      subject: {
        kind: 'reservation',
        id,
        label: id,
        guestName: 'Անի Մելքոնյան',
        localTime: '19:30',
        localDate: '2026-10-23',
        partySize: 4,
        itemCount: null,
        totalAmd: null,
      },
      lastMessage: {
        author: 'guest',
        kind: 'answer',
        text: null,
        createdAtUtc: '2026-10-23T12:59:00Z',
        staffName: null,
        answer: { kind: 'late', lateMinutes: 15 },
      },
      latestStatus: null,
      unreadFromGuest: 1,
      awaitingGuestAnswer: false,
      oldestUnansweredGuestMessageUtc: null,
      open: true,
      ...overrides,
    });
    const now = new Date('2026-10-23T13:00:00Z');
    const unread = row('5', {});
    const read = row('6', { unreadFromGuest: 0 });
    const closed = row('7', { open: false });
    const typed = row('8', {
      lastMessage: { ...unread.lastMessage!, kind: 'text', text: 'Hi', answer: null },
      oldestUnansweredGuestMessageUtc: '2026-10-23T12:50:00Z',
      unreadFromGuest: 0,
    });
    expect(
      railConversations([unread, read, closed, typed], 3, now).map((item) => item.subject.id),
    ).toEqual(['8', '5']);
  });
});

describe('the top bar', () => {
  it('has a Messages tab counting the guest messages nobody has read', async () => {
    signIn();
    renderAt(gatewayWith());
    const tab = await within(await views()).findByRole(
      'button',
      { name: 'Messages, 2 new messages' },
      { timeout: 5000 },
    );
    expect(tab.textContent).toBe('Messages2');
  });

  it('is not on the kitchen’s own screen', async () => {
    signIn('kitchen');
    renderAt(gatewayWith());
    const bar = await views();
    await within(bar).findByText('Kitchen');
    expect(within(bar).queryByRole('button', { name: /^Messages/u })).toBeNull();
    expect(within(bar).queryByText('Messages')).toBeNull();
  });
});

describe('the Now rail', () => {
  it('lists the guests waiting for us, the one past "remind after" first, with a chime', async () => {
    signIn();
    renderAt(gatewayWith());

    const section = await railMessages();
    const cards = await within(section).findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    // Karen waited four minutes, past the default three: first, in red, and chimed.
    expect(cards[0]!.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(cards[0]!).getByText('Takeaway T-485 · Կարեն Ս.')).toBeTruthy();
    expect(within(cards[0]!).getByText(/^[45] min ago$/u)).toBeTruthy();
    expect(within(cards[0]!).getByText('“Կարո՞ղ եմ 10 րոպե շուտ գալ վերցնելու”')).toBeTruthy();
    // A question, not an answer: Reply alone.
    expect(within(cards[0]!).queryByRole('button', { name: '“OK, we’ll wait”' })).toBeNull();
    expect(within(cards[0]!).getByRole('button', { name: 'Reply' })).toBeTruthy();
    await waitFor(() => expect(chime.play).toHaveBeenCalled());

    // A reminder lifts the section to the top of the rail.
    const rail = screen.getByRole('complementary', { name: 'Needs attention' });
    expect(within(rail).getAllByRole('region')[0]).toBe(section);
    expect(screen.getByTestId('message-reminder-announcer').textContent).toMatch(
      /Takeaway T-485 · Կարեն Ս\. · a guest has waited \d+ minutes for an answer/u,
    );
  });

  it('answers a guest running late with "OK, we’ll wait" in one tap', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const send = vi.spyOn(gateway, 'sendStaffMessage');
    renderAt(gateway);

    const card = await railCard(/^Table 5 · Անի Մ\./u);
    expect(within(card).getByText('“Running 15 minutes late”')).toBeTruthy();
    expect(within(card).getByText(/^Table held until \d\d:\d\d$/u)).toBeTruthy();

    await user.click(within(card).getByRole('button', { name: '“OK, we’ll wait”' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0]).toMatchObject({
      subject: { kind: 'reservation', id: 'res-msg-ani' },
      text: 'OK, we’ll wait',
    });
    expect(
      await within(card).findByText(/^Answered: “OK, we’ll wait” · Sona, \d\d:\d\d$/u),
    ).toBeTruthy();
  });

  it('reads no thread of its own: every card is the inbox row', async () => {
    signIn();
    const gateway = gatewayWith();
    const threads = vi.spyOn(gateway, 'getStaffConversation');
    renderAt(gateway);

    const card = await railCard(/^Table 5 · Անի Մ\./u);
    // The answer and the held-until line from the row's lastMessage and latestStatus.
    expect(within(card).getByText('“Running 15 minutes late”')).toBeTruthy();
    expect(within(card).getByText(/^Table held until \d\d:\d\d$/u)).toBeTruthy();
    expect(within(await railMessages()).getAllByRole('listitem')).toHaveLength(2);
    expect(threads).not.toHaveBeenCalled();
  });

  it('opens the Messages tab on the conversation from "Reply"', async () => {
    const user = setupUser();
    signIn();
    renderAt(gatewayWith());

    const card = await railCard(/^Table 5 · Անի Մ\./u);
    await user.click(within(card).getByRole('button', { name: 'Reply' }));

    const pane = await thread(/^Անի Մ\.$/u);
    expect(within(conversations()).getByRole('button', { current: true }).textContent).toMatch(
      /Անի Մ\./u,
    );
    expect(within(pane).getByRole('log', { name: 'Messages' })).toBeTruthy();
  });

  it('badges a table whose booking has a guest message nobody has read', async () => {
    signIn();
    renderAt(gatewayWith());
    const tables = await screen.findByRole('list', { name: 'Tables' }, { timeout: 5000 });
    const five = await within(tables).findByRole('button', { name: /^Table 5,.*1 new message/u });
    expect(five.querySelector('.ft-table-msg')).not.toBeNull();
    const nine = within(tables).getByRole('button', { name: /^Table 9,/u });
    expect(nine.getAttribute('aria-label')).not.toMatch(/new message/u);
  });

  it('badges a table whose sitting party wrote, as well as its next booking', async () => {
    signIn();
    const gateway = gatewayWith();
    const read = gateway.getFloor.bind(gateway);
    vi.spyOn(gateway, 'getFloor').mockImplementation(async (branchId) => {
      const floor = await read(branchId);
      if (!floor) return floor;
      return {
        ...floor,
        details: floor.details.map((detail) =>
          detail.label === '9' ? { ...detail, sittingUnreadMessages: 2 } : detail,
        ),
      };
    });
    renderAt(gateway);
    const tables = await screen.findByRole('list', { name: 'Tables' }, { timeout: 5000 });
    const nine = await within(tables).findByRole('button', { name: /^Table 9,.*2 new messages/u });
    expect(nine.querySelector('.ft-table-msg')).not.toBeNull();
  });
});

describe('the Messages tab', () => {
  it('lists the conversations with the three filters, the longest waiting first', async () => {
    const user = setupUser();
    signIn();
    renderAt(gatewayWith());
    await openInbox(user);

    const list = conversations();
    const filters = within(list).getByRole('group', { name: 'Filter' });
    expect(within(filters).getByRole('button', { name: 'All · 4' })).toBeTruthy();
    // Only a typed message waits: Ani's late answer is new, not unanswered.
    expect(within(filters).getByRole('button', { name: 'Unanswered · 1' })).toBeTruthy();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toMatch(/Կարեն Ս\. · T-485/u);
    expect(rows[0]!.textContent).toMatch(/Waiting \d+ min/u);
    expect(
      within(list).getByRole('button', { name: /^Table 5, Անի Մ\..*Guest answered$/u }),
    ).toBeTruthy();
    expect(within(list).getByText('Waiting for their answer')).toBeTruthy();
    expect(within(list).getByText(/^You: Այո, սեղան 3-ը/u)).toBeTruthy();
    // Ani's late answer, with the time the table is held until — not "Booking updated".
    expect(
      within(list).getByText(/^Running 15 minutes late · held until \d\d:\d\d$/u),
    ).toBeTruthy();
    expect(within(list).queryByText(/Booking updated/u)).toBeNull();

    await user.click(within(filters).getByRole('button', { name: 'Takeaway' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(filters).getByRole('button', { name: 'Unanswered · 1' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('opens at /staff/messages on the first conversation, a takeaway order with no ask', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const send = vi.spyOn(gateway, 'sendStaffMessage');
    renderAt(gateway, '/staff/messages');

    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    expect(await within(pane).findByText(/^Takeaway · ready \d\d:\d\d$/u)).toBeTruthy();
    expect(within(pane).queryByRole('button', { name: 'Ask: are you coming?' })).toBeNull();
    // The number is only behind Call, never printed.
    const call = within(pane).getByRole('link', { name: 'Call Կարեն Ս.' });
    expect(call.getAttribute('href')).toBe('tel:+37493884411');
    expect(pane.textContent).not.toMatch(/93884411|93 88 44 11/u);

    // The takeaway set of ready replies fills the field; the text can be changed.
    const chips = within(pane).getByRole('group', { name: 'Ready replies' });
    await user.click(within(chips).getByRole('button', { name: 'Yes, you can' }));
    const field = within(pane).getByRole('textbox', { name: 'Message to the guest' });
    expect((field as HTMLInputElement).value).toBe('Yes, you can');
    expect(field.getAttribute('maxlength')).toBe('500');
    await user.type(field, ', see you at 19:00');
    await user.click(within(pane).getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0]).toMatchObject({
      subject: { kind: 'takeaway', id: 'tk-msg-karen' },
      text: 'Yes, you can, see you at 19:00',
    });
    const log = within(pane).getByRole('log', { name: 'Messages' });
    expect(await within(log).findByText('Yes, you can, see you at 19:00')).toBeTruthy();
    expect(await within(log).findByText(/^Sona · \d\d:\d\d$/u)).toBeTruthy();
    expect((field as HTMLInputElement).value).toBe('');
  });

  it('keeps the conversation it opened on when an answer moves it down the list', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const list = gateway.listConversations.bind(gateway);
    let answered = false;
    // Once Karen is answered, another guest's typed message waits longer: hers moves down.
    vi.spyOn(gateway, 'listConversations').mockImplementation(async (branchId) => {
      const inbox = await list(branchId);
      return answered ? { ...inbox, items: [...inbox.items].reverse() } : inbox;
    });
    renderAt(gateway, '/staff/messages');

    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    const field = await within(pane).findByRole('textbox', { name: 'Message to the guest' });
    await user.type(field, 'Yes, come at 18:40');
    answered = true;
    await user.click(within(pane).getByRole('button', { name: 'Send' }));

    // Answered, Karen's row leaves the top of the list…
    await waitFor(
      () =>
        expect(within(conversations()).getAllByRole('listitem')[0]!.textContent).not.toMatch(
          /T-485/u,
        ),
      { timeout: 5000 },
    );
    // …and hers is still the conversation open, not the new top row's.
    expect(screen.getByRole('region', { name: /^Կարեն Ս\. · T-485$/u })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Անի Մ\.$/u })).toBeNull();
  });

  it('shows a booking’s conversation with who wrote what, the ask and the system line', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const ask = vi.spyOn(gateway, 'askOnMyWay');
    signIn();
    renderAt(gateway, '/staff/messages');

    const list = await screen.findByRole('region', { name: 'Conversations' });
    await within(list).findAllByRole('listitem');
    await user.click(within(list).getByRole('button', { name: /^Table 8, Դավիթ Հ\./u }));
    const pane = await thread(/^Դավիթ Հ\.$/u);
    const log = within(pane).getByRole('log', { name: 'Messages' });
    expect(await within(log).findByText(/^Are you coming at \d\d:\d\d\?$/u)).toBeTruthy();
    expect(
      within(log).getByText(/^Արամ · \d\d:\d\d · a question with answer buttons$/u),
    ).toBeTruthy();
    // Already asked and not answered: the ask waits for the answer.
    expect(within(pane).getByText('Asked · waiting for the answer')).toBeTruthy();
    expect(
      (within(pane).getByRole('button', { name: 'Ask: are you coming?' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // The booking set of ready replies.
    expect(within(pane).getByRole('button', { name: 'Your table is ready' })).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();

    // Ani's: her late answer and the line the system added.
    await user.click(within(conversations()).getByRole('button', { name: /^Table 5, Անի Մ\./u }));
    const ani = await thread(/^Անի Մ\.$/u);
    const aniLog = within(ani).getByRole('log', { name: 'Messages' });
    expect(await within(aniLog).findByText('Running 15 minutes late')).toBeTruthy();
    expect(
      within(aniLog).getByText(/^Booking updated · table held until \d\d:\d\d$/u),
    ).toBeTruthy();
    expect(within(aniLog).getByText(/^Լիլիթ · \d\d:\d\d$/u)).toBeTruthy();
    expect(within(ani).getByText(/^Table 5 · today \d\d:\d\d · 4 guests$/u)).toBeTruthy();
    // Call dials the thread's own `guestPhone`.
    expect(within(ani).getByRole('link', { name: 'Call Անի Մ.' }).getAttribute('href')).toBe(
      'tel:+37491556677',
    );
  });

  it('marks a conversation read when it is open', async () => {
    signIn();
    const gateway = gatewayWith();
    const read = vi.spyOn(gateway, 'markStaffConversationRead');
    renderAt(gateway, '/staff/messages');
    await thread(/^Կարեն Ս\. · T-485$/u);
    // Up to the newest message the pane shows, so one arriving meanwhile stays unread.
    await waitFor(() =>
      expect(read).toHaveBeenCalledWith({
        kind: 'takeaway',
        id: 'tk-msg-karen',
        upToUtc: expect.stringMatching(/^\d{4}-\d\d-\d\dT/u),
      }),
    );
    // The badge loses Karen's.
    expect(
      await within(await views()).findByRole('button', { name: 'Messages, 1 new message' }),
    ).toBeTruthy();
  });

  it('stays where the reader scrolled up to, and says "New message ↓" when one comes', async () => {
    signIn();
    const gateway = gatewayWith();
    const queryClient = renderAt(gateway, '/staff/messages');
    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    const log = within(pane).getByRole('log', { name: 'Messages' });
    await within(log).findByText('Կարո՞ղ եմ 10 րոպե շուտ գալ վերցնելու');

    // Scrolled up to read back: 1000 tall, 400 in view, at the top.
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 });
    log.scrollTop = 0;
    fireEvent.scroll(log);

    const read = gateway.getStaffConversation.bind(gateway);
    vi.spyOn(gateway, 'getStaffConversation').mockImplementation(async (subject) => {
      const found = await read(subject);
      return found
        ? {
            ...found,
            messages: [
              ...found.messages,
              {
                id: 'm-new',
                author: 'guest',
                kind: 'text',
                text: 'I am outside',
                answer: null,
                status: null,
                createdAtUtc: new Date().toISOString(),
                staffName: null,
              },
            ],
          }
        : found;
    });
    await act(() => queryClient.invalidateQueries());
    expect(await within(log).findByText('I am outside')).toBeTruthy();

    const pill = await within(pane).findByRole('button', {
      name: 'New message. Show the newest',
    });
    expect(pill.textContent).toBe('New message ↓');
    expect(pill.className).toMatch(/msg-new-below/u);
    fireEvent.click(pill);
    expect(within(pane).queryByRole('button', { name: 'New message. Show the newest' })).toBeNull();
  });

  it('keeps the bubble of a sent message the same element from pending to sent', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    const send = gateway.sendStaffMessage.bind(gateway);
    let release: () => void = () => undefined;
    vi.spyOn(gateway, 'sendStaffMessage').mockImplementation(
      (command) =>
        new Promise((resolve, reject) => {
          release = () => void send(command).then(resolve, reject);
        }),
    );
    const queryClient = renderAt(gateway, '/staff/messages');
    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    const log = within(pane).getByRole('log', { name: 'Messages' });
    const field = await within(pane).findByRole('textbox', { name: 'Message to the guest' });
    await user.type(field, 'Yes, come at 18:40');
    await user.click(within(pane).getByRole('button', { name: 'Send' }));

    // Pending: the live region gets the bubble once…
    const bubble = await within(log).findByText('Yes, come at 18:40');
    expect(within(log).getByText(/Sending…/u)).toBeTruthy();
    release();
    await waitFor(() => expect(within(log).queryByText(/Sending…/u)).toBeNull());
    // …and the server's message is the same element, not a new one to announce.
    expect(within(log).getByText('Yes, come at 18:40')).toBe(bubble);
    // Still the same after the next read, which no longer carries the command id.
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(within(log).getByText('Yes, come at 18:40')).toBe(bubble));
  });

  it('gives the text back and says why when a send is refused', async () => {
    const user = setupUser();
    signIn();
    const gateway = gatewayWith();
    vi.spyOn(gateway, 'sendStaffMessage').mockRejectedValue(
      new ConversationClosedError({ url: '/api/takeaway-orders/tk-msg-karen/conversation' }),
    );
    renderAt(gateway, '/staff/messages');

    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    const field = await within(pane).findByRole('textbox', { name: 'Message to the guest' });
    await user.type(field, 'On its way');
    await user.click(within(pane).getByRole('button', { name: 'Send' }));
    expect((await within(pane).findByRole('alert')).textContent).toBe(
      'The conversation has closed: nothing more can be sent.',
    );
    expect((field as HTMLInputElement).value).toBe('On its way');
  });

  it('shows a closed conversation without the composer', async () => {
    signIn();
    const gateway = gatewayWith();
    const original = gateway.getStaffConversation.bind(gateway);
    vi.spyOn(gateway, 'getStaffConversation').mockImplementation(async (subject) => {
      const found = await original(subject);
      return found ? { ...found, open: false, canWrite: false } : found;
    });
    renderAt(gateway, '/staff/messages');

    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    expect(await within(pane).findByText(/^This conversation is closed/u)).toBeTruthy();
    expect(within(pane).queryByRole('textbox')).toBeNull();
    expect(within(pane).queryByRole('group', { name: 'Ready replies' })).toBeNull();
  });

  it('lets a waiter read only, where the venue lets managers alone write', async () => {
    signIn();
    renderAt(gatewayWith({ messageSettings: { waitersCanWrite: false } }));

    // The rail offers no quick answer, and "Open" rather than "Reply".
    const card = await railCard(/^Table 5 · Անի Մ\./u);
    expect(within(card).queryByRole('button', { name: '“OK, we’ll wait”' })).toBeNull();
    const user = setupUser();
    await user.click(within(card).getByRole('button', { name: 'Open' }));

    const pane = await thread(/^Անի Մ\.$/u);
    expect(
      await within(pane).findByText(
        'At this venue only managers write to guests. You can read the conversation.',
      ),
    ).toBeTruthy();
    expect(within(pane).queryByRole('textbox')).toBeNull();
  });

  it('lets a manager write where waiters may not', async () => {
    signIn('manager');
    renderAt(
      gatewayWith({ messageSettings: { waitersCanWrite: false }, staffRole: 'manager' }),
      '/staff/messages',
    );
    const pane = await thread(/^Կարեն Ս\. · T-485$/u);
    expect(await within(pane).findByRole('textbox', { name: 'Message to the guest' })).toBeTruthy();
  });

  it('goes back to the floor from the Floor tab', async () => {
    const user = setupUser();
    signIn();
    renderAt(gatewayWith(), '/staff/messages');
    await screen.findByRole('region', { name: 'Conversations' }, { timeout: 5000 });
    await user.click(within(await views()).getByRole('button', { name: /^Floor/u }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Conversations' })).toBeNull());
    expect(await railMessages()).toBeTruthy();
    act(() => undefined);
  });
});
