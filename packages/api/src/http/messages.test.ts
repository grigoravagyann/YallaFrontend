import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import {
  ConversationClosedError,
  GuestsCannotWriteError,
  MessagesTooFastError,
  WaitersCannotWriteError,
} from '../contracts/errors';
import { messageFailure } from '../contracts/messageFailure';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, offSchema, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import {
  branchConversationsFromWire,
  conversationSummaryFromWire,
  dinerConversationFromWire,
  messageAuthor,
  messageKind,
  messageSettingsFromWire,
  staffConversationFromWire,
  unreadMessagesFromWire,
  type WireDinerConversation,
  type WireStaffConversation,
} from './messagesMapping';
import { dinerOrderFromWire, type WireDinerOrder } from './placesMapping';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * Guest messages over HTTP (`docs/messages.md`, 2026-10-23), against the
 * backend's generated wire: the guest's four routes for each subject, the
 * floor's four, the console's settings, the rows on bookings, orders and the
 * floor, enums as words, and a typed error for every new refusal.
 */

const RESERVATION = '7a000000-0000-4000-8000-000000000001';
const ORDER = '5d1d0a2e-0000-4000-8000-0000000000c1';
const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';

/** As the backend writes it: words for enums, nulls left out. */
const WIRE_THREAD: WireDinerConversation = {
  conversationId: 'c-1',
  subject: {
    kind: 'reservation',
    id: RESERVATION,
    venueName: 'Լավա ռեստորան',
    branchId: BRANCH,
    startUtc: '2026-10-23T15:30:00Z',
    localDate: '2026-10-23',
    localTime: '19:30',
    partySize: 4,
    tableLabel: '6',
  },
  open: true,
  closesAtUtc: '2026-10-23T19:00:00Z',
  guestsCanWrite: true,
  venuePhone: '+37410500501',
  pendingAsk: false,
  venueLastReadUtc: '2026-10-23T08:20:00Z',
  unreadCount: 1,
  messages: [
    {
      id: 'm-1',
      author: 'guest',
      kind: 'text',
      text: 'Բարև։ Մենք 4 հոգի ենք։',
      createdAtUtc: '2026-10-23T08:05:00Z',
    },
    {
      id: 'm-2',
      author: 'venue',
      kind: 'ask-coming',
      createdAtUtc: '2026-10-23T14:31:00Z',
    },
    {
      id: 'm-3',
      author: 'guest',
      kind: 'answer',
      answer: { kind: 'late', lateMinutes: 15 },
      createdAtUtc: '2026-10-23T14:33:00Z',
    },
    {
      id: 'm-4',
      author: 'system',
      kind: 'status',
      status: { answer: 'late', heldUntilLocal: '19:45', cancelled: false },
      createdAtUtc: '2026-10-23T14:33:00.0000001Z',
    },
  ],
};

const WIRE_STAFF_THREAD: WireStaffConversation = {
  ...WIRE_THREAD,
  guestName: 'Անի Մ.',
  guestPhone: '+37491556677',
  canWrite: true,
  messages: WIRE_THREAD.messages.map((message) =>
    message.author === 'venue' ? { ...message, staffName: 'Արամ' } : message,
  ),
};

function dinerOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return {
    backend,
    gateway: createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
      audience: 'diner',
    }),
  };
}

function staffOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createStaffHttpGateway(backend.client()) };
}

function consoleOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return {
    backend,
    gateway: createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
      auth: createAuthSession({
        storage: createMemoryTokenStorage('refresh-0'),
        refreshTokens: vi.fn(),
      }),
      identity: createMemoryIdentityStore(),
    }),
  };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the thread on the wire', () => {
  it("reads the guest's view in the client vocabulary, with no staff names", () => {
    const thread = dinerConversationFromWire(WIRE_STAFF_THREAD, {
      kind: 'reservation',
      id: RESERVATION,
    });
    expect(thread).toMatchObject({
      conversationId: 'c-1',
      subject: { kind: 'reservation', localTime: '19:30', tableLabel: '6', takeawayCode: null },
      open: true,
      pendingAsk: false,
      unreadCount: 1,
    });
    expect(thread.messages).toEqual([
      {
        id: 'm-1',
        author: 'guest',
        kind: 'text',
        text: 'Բարև։ Մենք 4 հոգի ենք։',
        answer: null,
        status: null,
        createdAtUtc: '2026-10-23T08:05:00Z',
        staffName: null,
      },
      expect.objectContaining({ author: 'venue', kind: 'askComing', text: null, staffName: null }),
      expect.objectContaining({
        author: 'guest',
        kind: 'answer',
        answer: { kind: 'late', lateMinutes: 15 },
      }),
      expect.objectContaining({
        author: 'system',
        kind: 'status',
        status: { answer: 'late', heldUntilLocal: '19:45', cancelled: false },
      }),
    ]);
  });

  it("reads the floor's view with who wrote, the guest, the number and whether the caller may write", () => {
    const thread = staffConversationFromWire(WIRE_STAFF_THREAD, {
      kind: 'reservation',
      id: RESERVATION,
    });
    expect(thread).toMatchObject({
      guestName: 'Անի Մ.',
      guestPhone: '+37491556677',
      canWrite: true,
      guestLastReadUtc: null,
    });
    expect(thread.messages[1]?.staffName).toBe('Արամ');
    // A platform admin: the number is empty, and nobody writes.
    expect(
      staffConversationFromWire(
        { ...WIRE_STAFF_THREAD, guestPhone: '', canWrite: false },
        { kind: 'reservation', id: RESERVATION },
      ),
    ).toMatchObject({ guestPhone: '', canWrite: false });
  });

  it('reads "not coming" and its cancelled line', () => {
    const thread = dinerConversationFromWire(
      {
        ...WIRE_THREAD,
        messages: [
          {
            id: 'm-5',
            author: 'guest',
            kind: 'answer',
            answer: { kind: 'not-coming' },
            createdAtUtc: '2026-10-23T14:40:00Z',
          },
          {
            id: 'm-6',
            author: 'system',
            kind: 'status',
            status: { answer: 'not-coming', cancelled: true },
            createdAtUtc: '2026-10-23T14:40:00Z',
          },
        ],
      },
      { kind: 'reservation', id: RESERVATION },
    );
    expect(thread.messages.map((message) => [message.answer, message.status])).toEqual([
      [{ kind: 'notComing', lateMinutes: null }, null],
      [null, { answer: 'notComing', heldUntilLocal: null, cancelled: true }],
    ]);
  });

  it('reads an enum as any spelling of its word or its number, and one this build does not know as unknown', () => {
    expect([1, 2, 3, 'Guest', 'venue', 'SYSTEM', 9, 'bot'].map(messageAuthor)).toEqual([
      'guest',
      'venue',
      'system',
      'guest',
      'venue',
      'system',
      'unknown',
      'unknown',
    ]);
    expect([1, 2, 3, 4, 'ask-coming', 'ask_coming', 'AskComing', 'photo'].map(messageKind)).toEqual(
      ['text', 'askComing', 'answer', 'status', 'askComing', 'askComing', 'askComing', 'unknown'],
    );
  });

  it('answers a subject with no thread as an open, empty one', () => {
    expect(
      dinerConversationFromWire(
        {
          subject: { kind: 'takeaway', id: ORDER, venueName: 'Lumen Coffee', branchId: BRANCH },
          open: true,
          guestsCanWrite: true,
          pendingAsk: false,
          unreadCount: 0,
          messages: [],
        },
        { kind: 'takeaway', id: ORDER },
      ),
    ).toMatchObject({
      conversationId: null,
      subject: { kind: 'takeaway', id: ORDER, readyAtUtc: null },
      guestsCanWrite: true,
      messages: [],
    });
  });
});

describe('the rows a thread shows on', () => {
  it('reads the summary, and none as null', () => {
    expect(
      conversationSummaryFromWire({
        unread: 1,
        lastAuthor: 'venue',
        lastKind: 'ask-coming',
        lastAtUtc: '2026-10-23T14:31:00Z',
        open: true,
      }),
    ).toEqual({
      unread: 1,
      lastAuthor: 'venue',
      lastKind: 'askComing',
      lastText: null,
      lastAtUtc: '2026-10-23T14:31:00Z',
      open: true,
    });
    expect(conversationSummaryFromWire({ unread: 0, open: true })).toMatchObject({
      lastAuthor: null,
      lastKind: null,
    });
    expect(conversationSummaryFromWire(null)).toBeNull();
  });

  it("puts a takeaway order's thread on its Orders-tab card, and none on dine-in", () => {
    const wire = {
      orderId: ORDER,
      branchId: BRANCH,
      venueName: 'Lumen Coffee',
      branchName: 'Northern Avenue',
      kind: 'takeaway',
      status: 2,
      placedAtUtc: '2026-10-23T14:00:00Z',
      items: [],
      timeline: [],
      canCancel: false,
      takeaway: {
        code: 'T-485',
        status: 2,
        pickupAsap: false,
        requestedPickupUtc: '2026-10-23T15:25:00Z',
        itemCount: 2,
      },
      // On the order itself, beside `takeaway`.
      messages: { unread: 1, lastAuthor: 'venue', lastKind: 'text', lastText: 'Ok', open: true },
    } as unknown as WireDinerOrder;
    expect(dinerOrderFromWire(wire, 'https://api.test').messages).toMatchObject({
      unread: 1,
      lastText: 'Ok',
    });
    expect(
      'messages' in
        dinerOrderFromWire({ ...wire, kind: 'dineIn' } as unknown as WireDinerOrder, 'x'),
    ).toBe(false);
  });

  it('reads the unread summary with who wrote last and whether the thread is open', () => {
    expect(
      unreadMessagesFromWire({
        total: 2,
        items: [
          {
            conversationId: 'c-1',
            subjectKind: 'takeaway',
            subjectId: ORDER,
            venueName: 'Lumen Coffee',
            unread: 2,
            lastKind: 'text',
            lastAuthor: 'venue',
            lastText: 'Ok',
            lastAtUtc: '2026-10-23T14:00:00Z',
            open: true,
          },
        ],
      }),
    ).toEqual({
      total: 2,
      items: [
        {
          conversationId: 'c-1',
          subjectKind: 'takeaway',
          subjectId: ORDER,
          venueName: 'Lumen Coffee',
          unread: 2,
          lastText: 'Ok',
          lastKind: 'text',
          lastAuthor: 'venue',
          lastAtUtc: '2026-10-23T14:00:00Z',
          open: true,
        },
      ],
    });
  });

  it("reads the floor's inbox: the guest's last words or answer, and the latest status apart", () => {
    const inbox = branchConversationsFromWire({
      items: [
        {
          conversationId: 'c-1',
          subject: {
            kind: 'reservation',
            id: RESERVATION,
            label: '6',
            guestName: 'Անի Մ.',
            localTime: '19:30',
            localDate: '2026-10-23',
            partySize: 4,
          },
          lastMessage: {
            id: 'm-3',
            author: 'guest',
            kind: 'answer',
            answer: { kind: 'late', lateMinutes: 15 },
            createdAtUtc: '2026-10-23T14:33:00Z',
          },
          latestStatus: { answer: 'late', heldUntilLocal: '19:45', cancelled: false },
          unreadFromGuest: 1,
          awaitingGuestAnswer: false,
          oldestUnansweredGuestMessageUtc: '2026-10-23T14:33:00Z',
          open: true,
        },
        {
          conversationId: 'c-2',
          subject: {
            kind: 'takeaway',
            id: ORDER,
            label: 'T-485',
            guestName: 'Կարեն Ս.',
            localTime: '19:25',
            itemCount: 2,
            totalAmd: 3400,
          },
          lastMessage: {
            id: 'm-9',
            author: 'venue',
            kind: 'text',
            text: 'Այո',
            staffName: 'Լիլիթ',
            createdAtUtc: '2026-10-23T14:30:00Z',
          },
          unreadFromGuest: 0,
          awaitingGuestAnswer: false,
          open: true,
        },
      ],
      unreadTotal: 1,
      remindAfterMinutes: 3,
      waitersCanWrite: true,
      asOfUtc: '2026-10-23T14:34:00Z',
    });
    expect(inbox).toMatchObject({
      unreadTotal: 1,
      remindAfterMinutes: 3,
      // Left out: the app's default four.
      templates: null,
      waitersCanWrite: true,
      asOfUtc: '2026-10-23T14:34:00Z',
    });
    expect(inbox.items[0]).toMatchObject({
      subject: { kind: 'reservation', label: '6', localDate: '2026-10-23', partySize: 4 },
      lastMessage: { author: 'guest', kind: 'answer', answer: { kind: 'late', lateMinutes: 15 } },
      latestStatus: { answer: 'late', heldUntilLocal: '19:45', cancelled: false },
    });
    expect(inbox.items[1]).toMatchObject({
      subject: { kind: 'takeaway', label: 'T-485', itemCount: 2, totalAmd: 3400 },
      lastMessage: { author: 'venue', staffName: 'Լիլիթ', answer: null },
      latestStatus: null,
      oldestUnansweredGuestMessageUtc: null,
    });
  });

  it('reads the settings', () => {
    expect(
      messageSettingsFromWire({
        guestsCanWrite: false,
        waitersCanWrite: true,
        templates: ['A'],
        remindAfterMinutes: 3,
      }),
    ).toEqual({
      guestsCanWrite: false,
      waitersCanWrite: true,
      templates: ['A'],
      remindAfterMinutes: 3,
    });
  });
});

describe("the guest's routes", () => {
  it('reads, sends, marks read and sums each subject at its own route', async () => {
    const { backend, gateway } = dinerOver({
      [`GET /api/diner/reservations/${RESERVATION}/conversation`]: { body: WIRE_THREAD },
      [`GET /api/diner/takeaway-orders/${ORDER}/conversation`]: {
        body: {
          subject: { kind: 'takeaway', id: ORDER, venueName: 'Lumen Coffee', branchId: BRANCH },
          open: true,
          guestsCanWrite: true,
          pendingAsk: false,
          unreadCount: 0,
          messages: [],
        },
      },
      [`POST /api/diner/takeaway-orders/${ORDER}/conversation/messages`]: {
        body: {
          conversationId: 'c-7',
          id: 'm-9',
          author: 'guest',
          kind: 'text',
          text: 'Hi',
          createdAtUtc: '2026-10-23T14:40:00Z',
          wasReplay: true,
        },
      },
      [`POST /api/diner/reservations/${RESERVATION}/conversation/read`]: { status: 204 },
      'GET /api/diner/messages/unread': { body: { total: 0, items: [] } },
    });
    expect(
      (await gateway.getConversation({ kind: 'reservation', id: RESERVATION }))?.unreadCount,
    ).toBe(1);
    expect(await gateway.getConversation({ kind: 'takeaway', id: ORDER })).toMatchObject({
      conversationId: null,
      subject: { kind: 'takeaway', id: ORDER },
    });
    const sent = await gateway.sendGuestMessage({
      subject: { kind: 'takeaway', id: ORDER },
      text: '  Hi  ',
      clientCommandId: COMMAND,
    });
    expect(sent).toMatchObject({
      id: 'm-9',
      conversationId: 'c-7',
      wasReplay: true,
      answer: null,
      status: null,
      staffName: null,
    });
    await gateway.markConversationRead({ kind: 'reservation', id: RESERVATION });
    expect(await gateway.getUnreadMessages()).toEqual({ total: 0, items: [] });

    const send = backend.requests.find((request) => request.method === 'POST');
    expect(send?.body).toEqual({ text: 'Hi', clientCommandId: COMMAND });
  });

  it('marks read up to the newest message shown, and up to now with none', async () => {
    const { backend, gateway } = dinerOver({
      [`POST /api/diner/reservations/${RESERVATION}/conversation/read`]: { status: 204 },
      [`POST /api/diner/takeaway-orders/${ORDER}/conversation/read`]: { status: 204 },
    });
    await gateway.markConversationRead({
      kind: 'reservation',
      id: RESERVATION,
      upToUtc: '2026-10-23T14:32:00Z',
    });
    await gateway.markConversationRead({ kind: 'takeaway', id: ORDER });
    expect(backend.requests.map((request) => [request.path, request.body ?? null])).toEqual([
      [
        `/api/diner/reservations/${RESERVATION}/conversation/read`,
        { upToUtc: '2026-10-23T14:32:00Z' },
      ],
      [`/api/diner/takeaway-orders/${ORDER}/conversation/read`, null],
    ]);
  });

  it("answers somebody else's thread as none", async () => {
    const { gateway } = dinerOver({});
    expect(await gateway.getConversation({ kind: 'reservation', id: RESERVATION })).toBeNull();
  });

  it.each([
    [
      problemReply(409, 'conversation-closed', {
        subjectKind: 'reservation',
        subjectId: RESERVATION,
        closedAtUtc: '2026-10-23T19:00:00Z',
      }),
      ConversationClosedError,
    ],
    [problemReply(403, 'guests-cannot-write', { branchId: BRANCH }), GuestsCannotWriteError],
    [problemReply(429, 'messages-too-fast'), MessagesTooFastError],
    [
      problemReply(422, 'validation-failed', { fields: [{ field: 'text', message: 'x' }] }),
      ValidationError,
    ],
  ])('reads a refusal as its typed error', async (reply, type) => {
    const { gateway } = dinerOver({
      [`POST /api/diner/reservations/${RESERVATION}/conversation/messages`]: reply,
    });
    const error = await caught(
      gateway.sendGuestMessage({
        subject: { kind: 'reservation', id: RESERVATION },
        text: 'Hi',
        clientCommandId: COMMAND,
      }),
    );
    expect(error).toBeInstanceOf(type);
  });

  it('reads when a thread closed from `closedAtUtc`', async () => {
    const { gateway } = dinerOver({
      [`POST /api/diner/reservations/${RESERVATION}/conversation/messages`]: problemReply(
        409,
        'conversation-closed',
        {
          subjectKind: 'reservation',
          subjectId: RESERVATION,
          closedAtUtc: '2026-10-23T19:00:00Z',
        },
      ),
    });
    const error = await caught(
      gateway.sendGuestMessage({
        subject: { kind: 'reservation', id: RESERVATION },
        text: 'Hi',
        clientCommandId: COMMAND,
      }),
    );
    expect(error).toMatchObject({
      subjectKind: 'reservation',
      subjectId: RESERVATION,
      closedAtUtc: '2026-10-23T19:00:00Z',
    });
    expect(messageFailure(error)).toEqual({ kind: 'closed', closedAtUtc: '2026-10-23T19:00:00Z' });
  });

  it("keeps the server's Retry-After while waiting helps", async () => {
    const { gateway } = dinerOver({
      [`POST /api/diner/reservations/${RESERVATION}/conversation/messages`]: {
        ...problemReply(429, 'messages-too-fast', {
          conversationId: 'c-1',
          perMinute: 5,
          perConversation: 60,
          retryAfterUtc: '2026-10-23T14:41:00Z',
        }),
        headers: { 'retry-after': '42' },
      },
    });
    const error = (await caught(
      gateway.sendGuestMessage({
        subject: { kind: 'reservation', id: RESERVATION },
        text: 'Hi',
        clientCommandId: COMMAND,
      }),
    )) as MessagesTooFastError;
    expect(error).toMatchObject({
      conversationId: 'c-1',
      retryAfterSeconds: 42,
      retryAfterUtc: '2026-10-23T14:41:00Z',
      perConversation: false,
    });
    expect(messageFailure(error)).toEqual({
      kind: 'tooFast',
      retryAfterSeconds: 42,
      perConversation: false,
    });
  });

  it("reads a spent thread — no retryAfterUtc, no Retry-After — as the thread's sixty used up", async () => {
    const { gateway } = dinerOver({
      [`POST /api/diner/reservations/${RESERVATION}/conversation/messages`]: problemReply(
        429,
        'messages-too-fast',
        { conversationId: 'c-1', perMinute: 5, perConversation: 60 },
      ),
    });
    const error = await caught(
      gateway.sendGuestMessage({
        subject: { kind: 'reservation', id: RESERVATION },
        text: 'Hi',
        clientCommandId: COMMAND,
      }),
    );
    expect(messageFailure(error)).toEqual({
      kind: 'tooFast',
      retryAfterSeconds: null,
      perConversation: true,
    });
  });
});

describe("the floor's routes", () => {
  it('lists, reads, sends and marks read at the staff routes', async () => {
    const { backend, gateway } = staffOver({
      [`GET /api/branches/${BRANCH}/conversations`]: {
        body: {
          items: [],
          unreadTotal: 0,
          remindAfterMinutes: 5,
          templates: ['A'],
          waitersCanWrite: false,
          asOfUtc: '2026-10-23T14:34:00Z',
        },
      },
      [`GET /api/reservations/${RESERVATION}/conversation`]: { body: WIRE_STAFF_THREAD },
      [`POST /api/takeaway-orders/${ORDER}/conversation/messages`]: {
        body: {
          conversationId: 'c-2',
          id: 'm-10',
          author: 'venue',
          kind: 'text',
          text: 'Այո',
          staffName: 'Արամ',
          createdAtUtc: '2026-10-23T14:41:00Z',
          wasReplay: false,
        },
      },
      [`POST /api/takeaway-orders/${ORDER}/conversation/read`]: { status: 204 },
    });
    expect(await gateway.listConversations(BRANCH)).toMatchObject({
      remindAfterMinutes: 5,
      templates: ['A'],
      waitersCanWrite: false,
    });
    expect(
      await gateway.getStaffConversation({ kind: 'reservation', id: RESERVATION }),
    ).toMatchObject({ guestName: 'Անի Մ.', guestPhone: '+37491556677', canWrite: true });
    expect(
      await gateway.sendStaffMessage({
        subject: { kind: 'takeaway', id: ORDER },
        text: 'Այո',
        clientCommandId: COMMAND,
      }),
    ).toMatchObject({ staffName: 'Արամ', conversationId: 'c-2', wasReplay: false });
    await gateway.markStaffConversationRead({
      kind: 'takeaway',
      id: ORDER,
      upToUtc: '2026-10-23T14:41:00Z',
    });
    const read = backend.requests.find(
      (request) => request.path === `/api/takeaway-orders/${ORDER}/conversation/read`,
    );
    expect(read?.method).toBe('POST');
    expect(read?.body).toEqual({ upToUtc: '2026-10-23T14:41:00Z' });
  });

  it.each([
    [problemReply(403, 'waiters-cannot-write', { branchId: BRANCH }), WaitersCannotWriteError],
    // Kitchen and a platform admin.
    [problemReply(403, 'forbidden'), ForbiddenError],
    [
      problemReply(409, 'conversation-closed', {
        subjectKind: 'reservation',
        subjectId: RESERVATION,
        closedAtUtc: '2026-10-23T19:00:00Z',
      }),
      ConversationClosedError,
    ],
  ])('reads a refusal as its typed error', async (reply, type) => {
    const { gateway } = staffOver({
      [`POST /api/reservations/${RESERVATION}/conversation/messages`]: reply,
    });
    expect(
      await caught(
        gateway.sendStaffMessage({
          subject: { kind: 'reservation', id: RESERVATION },
          text: 'Hi',
          clientCommandId: COMMAND,
        }),
      ),
    ).toBeInstanceOf(type);
  });

  it("carries the floor line and both tile badges — the next booking's and the sitting party's — when there are some", async () => {
    const table = {
      tableId: 't-6',
      label: '6',
      seats: 4,
      isBookable: true,
      physicalStatus: 1,
      state: 1,
      rowVersion: 'AAA=',
      floorAreaDisplayOrder: 0,
      nextReservationId: RESERVATION,
      nextReservationUnreadMessages: 2,
      sittingUnreadMessages: 0,
      nextReservationPhoneUnverified: false,
      openTabAwaitingAdmission: false,
    };
    const floor = {
      branchId: BRANCH,
      branchName: 'Կենտրոն',
      timeZoneId: 'Asia/Yerevan',
      asOfUtc: '2026-10-23T14:34:00Z',
      maxSequence: 4,
      tables: [
        table,
        {
          ...table,
          tableId: 't-7',
          label: '7',
          nextReservationUnreadMessages: 0,
          sittingUnreadMessages: 1,
        },
        { ...table, tableId: 't-8', label: '8', nextReservationUnreadMessages: 0 },
      ],
      messages: { unreadTotal: 3, oldestUnansweredUtc: '2026-10-23T14:30:00Z' },
    };
    const { gateway } = staffOver({
      [`GET /api/branches/${BRANCH}/tables/floor`]: { body: floor },
    });
    const read = await gateway.getFloor(BRANCH);
    expect(read?.messages).toEqual({ unreadTotal: 3, oldestUnansweredUtc: '2026-10-23T14:30:00Z' });
    expect(read?.details[0]?.nextReservationUnreadMessages).toBe(2);
    expect(read?.details[0]).not.toHaveProperty('sittingUnreadMessages');
    expect(read?.details[1]?.sittingUnreadMessages).toBe(1);
    expect(read?.details[1]).not.toHaveProperty('nextReservationUnreadMessages');
    expect(read?.details[2]).not.toHaveProperty('nextReservationUnreadMessages');
    expect(read?.details[2]).not.toHaveProperty('sittingUnreadMessages');

    const { messages: _messages, ...older } = floor;
    const { gateway: before } = staffOver({
      [`GET /api/branches/${BRANCH}/tables/floor`]: offSchema(
        { body: older },
        'messages is required on BranchFloorState; this proves a floor from a server before guest messages carries no floor line',
      ),
    });
    expect('messages' in ((await before.getFloor(BRANCH)) ?? {})).toBe(false);
  });

  it('answers an unknown thread as none', async () => {
    const { gateway } = staffOver({});
    expect(await gateway.getStaffConversation({ kind: 'takeaway', id: ORDER })).toBeNull();
    expect(await caught(gateway.listConversations(BRANCH))).toBeInstanceOf(NotFoundError);
  });
});

describe("the console's settings", () => {
  const BOUNDS = {
    maxTemplates: 8,
    templateMaxLength: 120,
    remindAfterMinutesMin: 1,
    remindAfterMinutesMax: 15,
    textMaxLength: 500,
  };

  it('reads them and saves all four, trimmed', async () => {
    const saved = {
      guestsCanWrite: true,
      waitersCanWrite: false,
      templates: ['Լավ, սպասում ենք'],
      remindAfterMinutes: 5,
    };
    const { backend, gateway } = consoleOver({
      [`GET /api/branches/${BRANCH}/message-settings`]: { body: { ...saved, bounds: BOUNDS } },
      [`PUT /api/branches/${BRANCH}/message-settings`]: (request) => ({
        body: { ...(request.body as object), bounds: BOUNDS },
      }),
    });
    expect(await gateway.getMessageSettings(BRANCH)).toEqual(saved);
    expect(
      await gateway.saveMessageSettings({
        branchId: BRANCH,
        settings: { ...saved, templates: ['  Լավ, սպասում ենք  '] },
      }),
    ).toEqual(saved);
    expect(backend.requests.at(-1)?.body).toEqual(saved);
  });

  it('saves the default set as null, and reads one left out as the default set', async () => {
    const { backend, gateway } = consoleOver({
      [`PUT /api/branches/${BRANCH}/message-settings`]: (request) => {
        const { templates: _templates, ...rest } = request.body as Record<string, unknown>;
        return { body: { ...rest, bounds: BOUNDS } };
      },
    });
    expect(
      await gateway.saveMessageSettings({
        branchId: BRANCH,
        settings: {
          guestsCanWrite: true,
          waitersCanWrite: true,
          templates: null,
          remindAfterMinutes: 3,
        },
      }),
    ).toMatchObject({ templates: null });
    expect(backend.requests.at(-1)?.body).toMatchObject({ templates: null });
  });
});
