import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { Booking } from '../contracts/booking';
import { ConversationClosedError } from '../contracts/errors';
import type {
  BranchConversations,
  ConversationSubjectRef,
  DinerConversation,
  DinerUnreadMessages,
  SendMessageCommand,
  SentMessage,
  StaffConversation,
  StaffConversationListItem,
} from '../contracts/messages';
import type { YallaGateway } from '../gateway';
import { queryKeys } from './index';
import {
  CONVERSATION_POLL_MS,
  afterGuestAnswered,
  afterGuestConversationRead,
  afterStaffConversationRead,
  afterVenueAsked,
  appendPendingMessage,
  carryClientCommandIds,
  conversationPollMs,
  dropPendingMessage,
  markConversationReadOptions,
  pendingMessage,
  sendGuestMessageOptions,
  sendStaffMessageOptions,
  settleSentMessage,
} from './messages';
import { afterOnMyWay, afterPreOrderAction, afterRunningLate } from './preOrders';

/**
 * What every guest-messages mutation does to the cache (2026-10-23): the
 * optimistic append and its two endings, the reads that clear unread counts at
 * once, the poll's pauses, and the on-my-way answers and the floor's ask
 * reading the threads again. On a real `QueryClient` against the exported keys.
 */

const BRANCH = 'b-1';
const BOOKING: ConversationSubjectRef = { kind: 'reservation', id: 'r-1' };
const ORDER: ConversationSubjectRef = { kind: 'takeaway', id: 'tk-1' };
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';

const THREAD: DinerConversation = {
  conversationId: 'c-1',
  subject: {
    kind: 'reservation',
    id: 'r-1',
    venueName: 'Լավա ռեստորան',
    branchId: BRANCH,
    startUtc: '2026-10-23T15:30:00Z',
    localDate: '2026-10-23',
    localTime: '19:30',
    partySize: 4,
    tableLabel: '6',
    takeawayCode: null,
    readyAtLocal: null,
    readyAtUtc: null,
  },
  open: true,
  closesAtUtc: '2026-10-23T19:00:00Z',
  guestsCanWrite: true,
  venuePhone: null,
  pendingAsk: true,
  venueLastReadUtc: null,
  unreadCount: 2,
  messages: [
    {
      id: 'm-1',
      author: 'venue',
      kind: 'askComing',
      text: null,
      answer: null,
      status: null,
      createdAtUtc: '2026-10-23T14:31:00Z',
      staffName: null,
    },
  ],
};

const STAFF_THREAD: StaffConversation = {
  ...THREAD,
  subject: { ...THREAD.subject, outcome: 'upcoming' },
  unreadCount: 1,
  guestName: 'Անի Մ.',
  guestPhone: '+37491556677',
  guestLastReadUtc: null,
  canWrite: true,
};

const SENT: SentMessage = {
  id: 'm-2',
  author: 'guest',
  kind: 'text',
  text: 'Ուշանում եմ',
  answer: null,
  status: null,
  createdAtUtc: '2026-10-23T14:33:00Z',
  staffName: null,
  conversationId: 'c-1',
  wasReplay: false,
};

const COMMAND_SEND: SendMessageCommand = {
  subject: BOOKING,
  text: '  Ուշանում եմ  ',
  clientCommandId: COMMAND,
};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

const invalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

function gatewayWith(send: (command: SendMessageCommand) => Promise<SentMessage>) {
  return {
    sendGuestMessage: send,
    markConversationRead: () => Promise.resolve(),
  } as unknown as YallaGateway;
}

describe('the optimistic append', () => {
  it('shows a pending message at once, trimmed, under its command id', () => {
    const pending = pendingMessage(COMMAND_SEND, 'guest', new Date('2026-10-23T14:33:00Z'));
    expect(pending).toMatchObject({
      id: `pending:${COMMAND}`,
      author: 'guest',
      text: 'Ուշանում եմ',
      pending: true,
      clientCommandId: COMMAND,
      staffName: null,
    });
    const once = appendPendingMessage(THREAD, pending);
    expect(once?.messages.at(-1)).toBe(pending);
    expect(appendPendingMessage(once, pending)?.messages.length).toBe(2);
  });

  it("swaps in the server's message, or drops the pending one when a read brought it", () => {
    const pending = pendingMessage(COMMAND_SEND, 'guest');
    const shown = appendPendingMessage(THREAD, pending)!;
    const settled = settleSentMessage(shown, COMMAND, SENT)!;
    expect(settled.messages.map((message) => message.id)).toEqual(['m-1', 'm-2']);
    expect(settled.messages[1]).not.toHaveProperty('wasReplay');
    const raced = { ...shown, messages: [...THREAD.messages, SENT, pending] };
    expect(settleSentMessage(raced, COMMAND, SENT)!.messages.map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
    ]);
    expect(dropPendingMessage(shown, COMMAND)?.messages).toEqual(THREAD.messages);
    // The first message makes the thread: the answer names it.
    const unborn = { ...THREAD, conversationId: null, messages: [pending] };
    expect(settleSentMessage(unborn, COMMAND, SENT)?.conversationId).toBe('c-1');
  });

  it("keeps the send's command id on the server's message, so a screen keys it as before", () => {
    const pending = pendingMessage(COMMAND_SEND, 'venue');
    const settled = settleSentMessage(appendPendingMessage(THREAD, pending), COMMAND, SENT)!;
    expect(settled.messages.at(-1)).toMatchObject({ id: 'm-2', clientCommandId: COMMAND });
    expect(settled.messages.at(-1)?.pending).toBeUndefined();
    // A read brought it first: that one carries the id now.
    const raced = { ...THREAD, messages: [...THREAD.messages, SENT, pending] };
    expect(settleSentMessage(raced, COMMAND, SENT)!.messages.at(-1)).toMatchObject({
      id: 'm-2',
      clientCommandId: COMMAND,
    });
  });

  it('keeps the command id on that message through the reads after, which never send it', () => {
    const settled = {
      ...THREAD,
      messages: [...THREAD.messages, { ...SENT, clientCommandId: COMMAND }],
    };
    const polled = { ...THREAD, messages: [...THREAD.messages, SENT] };
    expect(carryClientCommandIds(settled, polled)?.messages.at(-1)?.clientCommandId).toBe(COMMAND);
    expect(carryClientCommandIds(settled, polled)?.messages[0]).toBe(THREAD.messages[0]);
    // Nothing to carry: the read as it came.
    expect(carryClientCommandIds(THREAD, polled)).toBe(polled);
    expect(carryClientCommandIds(undefined, polled)).toBe(polled);
  });

  it('pauses the poll while a send is in flight, and when the thread is not in front', () => {
    expect(conversationPollMs(THREAD, true)).toBe(CONVERSATION_POLL_MS);
    expect(conversationPollMs(THREAD, false)).toBe(false);
    const sending = appendPendingMessage(THREAD, pendingMessage(COMMAND_SEND, 'guest'));
    expect(conversationPollMs(sending, true)).toBe(false);
  });

  it("goes through the guest's send: pending, then the server's, then the rows read again", async () => {
    const queryClient = client();
    const key = queryKeys.dinerConversation('reservation', 'r-1');
    queryClient.setQueryData(key, THREAD);
    queryClient.setQueryData(queryKeys.unreadMessages, { total: 0, items: [] });
    queryClient.setQueryData(queryKeys.bookings, { upcoming: [], past: [] });
    let release: (value: SentMessage) => void = () => {};
    const observer = new MutationObserver(
      queryClient,
      sendGuestMessageOptions(
        queryClient,
        gatewayWith(() => new Promise<SentMessage>((resolve) => (release = resolve))),
      ),
    );
    const done = observer.mutate(COMMAND_SEND);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryClient.getQueryData<DinerConversation>(key)?.messages.at(-1)).toMatchObject({
      pending: true,
      text: 'Ուշանում եմ',
    });
    release(SENT);
    await done;
    const after = queryClient.getQueryData<DinerConversation>(key)!;
    expect(after.messages.map((message) => message.id)).toEqual(['m-1', 'm-2']);
    expect(invalidated(queryClient, key)).toBe(true);
    expect(invalidated(queryClient, queryKeys.unreadMessages)).toBe(true);
    expect(invalidated(queryClient, queryKeys.bookings)).toBe(true);
  });

  it('takes the pending message out again on a refusal', async () => {
    const queryClient = client();
    const key = queryKeys.dinerConversation('takeaway', 'tk-1');
    queryClient.setQueryData(key, { ...THREAD, subject: { ...THREAD.subject, ...ORDER } });
    const observer = new MutationObserver(
      queryClient,
      sendGuestMessageOptions(
        queryClient,
        gatewayWith(() => Promise.reject(new ConversationClosedError({ url: 'x' }))),
      ),
    );
    await observer.mutate({ ...COMMAND_SEND, subject: ORDER }).catch(() => undefined);
    expect(queryClient.getQueryData<DinerConversation>(key)?.messages).toEqual(THREAD.messages);
    expect(observer.getCurrentResult().error).toBeInstanceOf(ConversationClosedError);
  });

  describe('online only', () => {
    afterEach(() => onlineManager.setOnline(true));

    it('fails a send at once offline, never pausing it to send later', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { mutations: { networkMode: 'online', retry: false } },
      });
      onlineManager.setOnline(false);
      let attempts = 0;
      const observer = new MutationObserver(
        queryClient,
        sendStaffMessageOptions(queryClient, BRANCH, () => {
          attempts += 1;
          return Promise.reject(new Error('Network request failed'));
        }),
      );
      const settled = observer.mutate(COMMAND_SEND).catch(() => undefined);
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 50))]);
      expect(observer.getCurrentResult().isPaused).toBe(false);
      expect(attempts).toBe(1);
    });
  });
});

describe("the floor's send", () => {
  it('signs the pending message, and reads the inbox and the floor again', async () => {
    const queryClient = client();
    const key = queryKeys.staffConversation('reservation', 'r-1');
    queryClient.setQueryData(key, STAFF_THREAD);
    queryClient.setQueryData(queryKeys.staffConversations(BRANCH), { items: [] });
    queryClient.setQueryData(queryKeys.staffFloor(BRANCH), { details: [] });
    let release: (value: SentMessage) => void = () => {};
    const observer = new MutationObserver(
      queryClient,
      sendStaffMessageOptions(
        queryClient,
        BRANCH,
        () => new Promise<SentMessage>((resolve) => (release = resolve)),
        'Արամ',
      ),
    );
    const done = observer.mutate(COMMAND_SEND);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryClient.getQueryData<StaffConversation>(key)?.messages.at(-1)).toMatchObject({
      author: 'venue',
      staffName: 'Արամ',
      pending: true,
    });
    release({ ...SENT, author: 'venue', staffName: 'Արամ' });
    await done;
    expect(queryClient.getQueryData<StaffConversation>(key)?.messages.at(-1)).toMatchObject({
      id: 'm-2',
      staffName: 'Արամ',
    });
    expect(invalidated(queryClient, queryKeys.staffConversations(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.staffFloor(BRANCH))).toBe(true);
  });
});

describe('reading', () => {
  it("clears the guest's unread at once — the thread, the summary and the booking's row", async () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.dinerConversation('reservation', 'r-1'), THREAD);
    queryClient.setQueryData<DinerUnreadMessages>(queryKeys.unreadMessages, {
      total: 3,
      items: [
        {
          conversationId: 'c-1',
          subjectKind: 'reservation',
          subjectId: 'r-1',
          venueName: 'Լավա ռեստորան',
          unread: 2,
          lastText: null,
          lastKind: 'askComing',
          lastAuthor: 'venue',
          lastAtUtc: '2026-10-23T14:31:00Z',
          open: true,
        },
        {
          conversationId: 'c-2',
          subjectKind: 'takeaway',
          subjectId: 'tk-1',
          venueName: 'Lumen Coffee',
          unread: 1,
          lastText: 'Ok',
          lastKind: 'text',
          lastAuthor: 'venue',
          lastAtUtc: '2026-10-23T14:00:00Z',
          open: true,
        },
      ],
    });
    queryClient.setQueryData(queryKeys.booking('r-1'), {
      id: 'r-1',
      messages: {
        unread: 2,
        lastAuthor: 'venue',
        lastKind: 'askComing',
        lastText: null,
        lastAtUtc: null,
        open: true,
      },
    } as Booking);

    const observer = new MutationObserver(
      queryClient,
      markConversationReadOptions(
        queryClient,
        gatewayWith(() => Promise.reject(new Error('unused'))),
      ),
    );
    await observer.mutate(BOOKING);

    expect(
      queryClient.getQueryData<DinerConversation>(queryKeys.dinerConversation('reservation', 'r-1'))
        ?.unreadCount,
    ).toBe(0);
    const summary = queryClient.getQueryData<DinerUnreadMessages>(queryKeys.unreadMessages)!;
    expect(summary.total).toBe(1);
    expect(summary.items.map((item) => item.unread)).toEqual([0, 1]);
    expect(queryClient.getQueryData<Booking>(queryKeys.booking('r-1'))?.messages?.unread).toBe(0);
    expect(invalidated(queryClient, queryKeys.unreadMessages)).toBe(true);
    expect(invalidated(queryClient, queryKeys.booking('r-1'))).toBe(true);
  });

  it('reads up to the newest message shown: a venue message after the mark stays unread', async () => {
    const queryClient = client();
    const later = {
      ...THREAD.messages[0]!,
      id: 'm-3',
      kind: 'text' as const,
      text: 'Սեղանը պատրաստ է',
      createdAtUtc: '2026-10-23T14:36:00Z',
    };
    queryClient.setQueryData(queryKeys.dinerConversation('reservation', 'r-1'), {
      ...THREAD,
      messages: [...THREAD.messages, later],
    });
    queryClient.setQueryData<DinerUnreadMessages>(queryKeys.unreadMessages, {
      total: 2,
      items: [
        {
          conversationId: 'c-1',
          subjectKind: 'reservation',
          subjectId: 'r-1',
          venueName: 'Լավա ռեստորան',
          unread: 2,
          lastText: 'Սեղանը պատրաստ է',
          lastKind: 'text',
          lastAuthor: 'venue',
          lastAtUtc: '2026-10-23T14:36:00Z',
          open: true,
        },
      ],
    });
    const sent: unknown[] = [];
    const gateway = {
      markConversationRead: (command: unknown) => {
        sent.push(command);
        return Promise.resolve();
      },
    } as unknown as YallaGateway;

    const observer = new MutationObserver(
      queryClient,
      markConversationReadOptions(queryClient, gateway),
    );
    await observer.mutate({ ...BOOKING, upToUtc: '2026-10-23T14:31:00Z' });

    expect(sent).toEqual([{ ...BOOKING, upToUtc: '2026-10-23T14:31:00Z' }]);
    expect(
      queryClient.getQueryData<DinerConversation>(queryKeys.dinerConversation('reservation', 'r-1'))
        ?.unreadCount,
    ).toBe(1);
    const summary = queryClient.getQueryData<DinerUnreadMessages>(queryKeys.unreadMessages)!;
    expect(summary.total).toBe(1);
    expect(summary.items[0]?.unread).toBe(1);
  });

  it('leaves a summary with nothing to clear as it was', () => {
    const queryClient = client();
    const summary: DinerUnreadMessages = { total: 0, items: [] };
    queryClient.setQueryData(queryKeys.unreadMessages, summary);
    afterGuestConversationRead(queryClient, ORDER);
    expect(queryClient.getQueryData(queryKeys.unreadMessages)).toEqual(summary);
  });

  it("clears the floor's row and badge at once, then reads the inbox and the floor again", () => {
    const queryClient = client();
    const row = (id: string, unread: number): StaffConversationListItem => ({
      conversationId: `c-${id}`,
      subject: {
        kind: 'reservation',
        id,
        label: '6',
        guestName: 'Անի Մ.',
        localTime: '19:30',
        localDate: '2026-10-23',
        partySize: 4,
        itemCount: null,
        totalAmd: null,
      },
      lastMessage: null,
      latestStatus: null,
      unreadFromGuest: unread,
      awaitingGuestAnswer: false,
      oldestUnansweredGuestMessageUtc: null,
      open: true,
    });
    queryClient.setQueryData<BranchConversations>(queryKeys.staffConversations(BRANCH), {
      items: [row('r-1', 2), row('r-2', 1)],
      unreadTotal: 3,
      remindAfterMinutes: 3,
      templates: null,
      waitersCanWrite: true,
      asOfUtc: '2026-10-23T14:34:00Z',
    });
    queryClient.setQueryData(queryKeys.staffConversation('reservation', 'r-1'), STAFF_THREAD);
    queryClient.setQueryData(queryKeys.staffFloor(BRANCH), { details: [] });

    afterStaffConversationRead(queryClient, BRANCH, BOOKING);

    const inbox = queryClient.getQueryData<BranchConversations>(
      queryKeys.staffConversations(BRANCH),
    )!;
    expect(inbox.unreadTotal).toBe(1);
    expect(inbox.items.map((item) => item.unreadFromGuest)).toEqual([0, 1]);
    expect(
      queryClient.getQueryData<StaffConversation>(queryKeys.staffConversation('reservation', 'r-1'))
        ?.unreadCount,
    ).toBe(0);
    expect(invalidated(queryClient, queryKeys.staffConversations(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.staffFloor(BRANCH))).toBe(true);
  });

  it("keeps a guest message after the floor's mark unread on the row and the badge", () => {
    const queryClient = client();
    const guest = (id: string, at: string) => ({
      id,
      author: 'guest' as const,
      kind: 'text' as const,
      text: 'Բարև',
      answer: null,
      status: null,
      createdAtUtc: at,
      staffName: null,
    });
    queryClient.setQueryData<StaffConversation>(queryKeys.staffConversation('reservation', 'r-1'), {
      ...STAFF_THREAD,
      unreadCount: 2,
      messages: [guest('g-1', '2026-10-23T14:32:00Z'), guest('g-2', '2026-10-23T14:38:00Z')],
    });
    queryClient.setQueryData<BranchConversations>(queryKeys.staffConversations(BRANCH), {
      items: [
        {
          conversationId: 'c-1',
          subject: {
            kind: 'reservation',
            id: 'r-1',
            label: '6',
            guestName: 'Անի Մ.',
            localTime: '19:30',
            localDate: '2026-10-23',
            partySize: 4,
            itemCount: null,
            totalAmd: null,
          },
          lastMessage: null,
          latestStatus: null,
          unreadFromGuest: 2,
          awaitingGuestAnswer: false,
          oldestUnansweredGuestMessageUtc: '2026-10-23T14:32:00Z',
          open: true,
        },
      ],
      unreadTotal: 2,
      remindAfterMinutes: 3,
      templates: null,
      waitersCanWrite: true,
      asOfUtc: '2026-10-23T14:38:00Z',
    });

    afterStaffConversationRead(queryClient, BRANCH, BOOKING, '2026-10-23T14:32:00Z');

    expect(
      queryClient.getQueryData<StaffConversation>(queryKeys.staffConversation('reservation', 'r-1'))
        ?.unreadCount,
    ).toBe(1);
    const inbox = queryClient.getQueryData<BranchConversations>(
      queryKeys.staffConversations(BRANCH),
    )!;
    expect(inbox.items[0]?.unreadFromGuest).toBe(1);
    expect(inbox.unreadTotal).toBe(1);
  });
});

describe('the answers and the ask', () => {
  it('reads the booking\'s thread again after "on my way" and "running late"', () => {
    for (const answer of [
      (queryClient: QueryClient) =>
        afterOnMyWay(queryClient, {
          reservationId: 'r-1',
          guestConfirmedOnWayAtUtc: '2026-10-23T14:33:00Z',
          wasReplay: false,
        }),
      (queryClient: QueryClient) =>
        afterRunningLate(queryClient, {
          reservationId: 'r-1',
          guestRunningLateMinutes: 15,
          guestRunningLateAtUtc: '2026-10-23T14:33:00Z',
          expectedArrivalUtc: '2026-10-23T15:45:00Z',
        }),
      (queryClient: QueryClient) => afterGuestAnswered(queryClient, 'r-1'),
    ]) {
      const queryClient = client();
      queryClient.setQueryData(queryKeys.dinerConversation('reservation', 'r-1'), THREAD);
      queryClient.setQueryData(queryKeys.unreadMessages, { total: 0, items: [] });
      answer(queryClient);
      expect(invalidated(queryClient, queryKeys.dinerConversation('reservation', 'r-1'))).toBe(
        true,
      );
      expect(invalidated(queryClient, queryKeys.unreadMessages)).toBe(true);
    }
  });

  it("reads the floor's thread and inbox again after an ask or a pre-order's not coming", () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.staffConversation('reservation', 'r-1'), STAFF_THREAD);
    queryClient.setQueryData(queryKeys.staffConversation('reservation', 'r-2'), STAFF_THREAD);
    queryClient.setQueryData(queryKeys.staffConversations(BRANCH), { items: [] });
    afterVenueAsked(queryClient, BRANCH, 'r-1');
    expect(invalidated(queryClient, queryKeys.staffConversation('reservation', 'r-1'))).toBe(true);
    expect(invalidated(queryClient, queryKeys.staffConversation('reservation', 'r-2'))).toBe(false);
    expect(invalidated(queryClient, queryKeys.staffConversations(BRANCH))).toBe(true);

    const refused = client();
    refused.setQueryData(queryKeys.staffConversation('reservation', 'r-2'), STAFF_THREAD);
    afterPreOrderAction(refused, BRANCH, null);
    expect(invalidated(refused, queryKeys.staffConversation('reservation', 'r-2'))).toBe(true);
  });
});
