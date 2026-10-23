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
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
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
  type WireConversation,
} from './messagesMapping';
import { dinerOrderFromWire, type WireDinerOrder } from './placesMapping';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * Guest messages over HTTP (`docs/messages.md`, 2026-10-23), against the
 * hand-written wire: the guest's four routes for each subject, the floor's
 * four, the console's settings, the rows on bookings, orders and the floor,
 * enums as words or numbers, and a typed error for every new refusal.
 */

const RESERVATION = '7a000000-0000-4000-8000-000000000001';
const ORDER = '5d1d0a2e-0000-4000-8000-0000000000c1';
const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';

const WIRE_THREAD: WireConversation = {
  conversationId: 'c-1',
  subject: {
    kind: 'reservation',
    id: RESERVATION,
    venueName: 'Լավա ռեստորան',
    branchId: BRANCH,
    startUtc: '2026-10-23T15:30:00Z',
    localDate: '2026-10-23',
    localTime: '19:30:00',
    partySize: 4,
    tableLabel: '6',
  },
  open: true,
  closesAtUtc: '2026-10-23T19:00:00Z',
  guestsCanWrite: true,
  venuePhone: '+37410500501',
  pendingAsk: true,
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
      text: null,
      createdAtUtc: '2026-10-23T14:31:00Z',
      staffName: 'Արամ',
    },
    {
      id: 'm-3',
      author: 1,
      kind: 3,
      answer: { kind: 'late', lateMinutes: 15 },
      createdAtUtc: '2026-10-23T14:33:00Z',
    },
    {
      id: 'm-4',
      author: 'system',
      kind: 'status',
      status: { heldUntilLocal: '19:45:00' },
      createdAtUtc: '2026-10-23T14:33:00Z',
    },
  ],
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
    const thread = dinerConversationFromWire(
      { ...WIRE_THREAD },
      { kind: 'reservation', id: RESERVATION },
    );
    expect(thread).toMatchObject({
      conversationId: 'c-1',
      subject: { kind: 'reservation', localTime: '19:30', tableLabel: '6', takeawayCode: null },
      open: true,
      pendingAsk: true,
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
      expect.objectContaining({ author: 'venue', kind: 'askComing', staffName: null }),
      expect.objectContaining({
        author: 'guest',
        kind: 'answer',
        answer: { kind: 'late', lateMinutes: 15 },
      }),
      expect.objectContaining({
        author: 'system',
        kind: 'status',
        status: { heldUntilLocal: '19:45', cancelled: false },
      }),
    ]);
  });

  it("reads the floor's view with who wrote, the guest and whether the caller may write", () => {
    const thread = staffConversationFromWire(
      { ...WIRE_THREAD, guestName: 'Անի Մ.', guestLastReadUtc: null, canWrite: true },
      { kind: 'reservation', id: RESERVATION },
    );
    expect(thread).toMatchObject({ guestName: 'Անի Մ.', canWrite: true, guestLastReadUtc: null });
    expect(thread.messages[1]?.staffName).toBe('Արամ');
    // Never assumed: a thin answer lets nobody write.
    expect(staffConversationFromWire({}, { kind: 'takeaway', id: ORDER }).canWrite).toBe(false);
  });

  it('reads an enum as its word or its number, and one this build does not know as unknown', () => {
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
    expect([1, 2, 3, 4, 'askComing', 'ask_coming', 'AskComing', 'photo'].map(messageKind)).toEqual([
      'text',
      'askComing',
      'answer',
      'status',
      'askComing',
      'askComing',
      'askComing',
      'unknown',
    ]);
  });

  it('answers a subject with no thread as an open, empty one', () => {
    expect(
      dinerConversationFromWire(
        { conversationId: null, open: true, messages: [] },
        { kind: 'takeaway', id: ORDER },
      ),
    ).toMatchObject({
      conversationId: null,
      subject: { kind: 'takeaway', id: ORDER },
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
        lastText: null,
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

  it('reads the unread summary, summing rows when the total is absent', () => {
    expect(
      unreadMessagesFromWire({
        items: [
          {
            conversationId: 'c-1',
            subjectKind: 'takeaway',
            subjectId: ORDER,
            venueName: 'Lumen Coffee',
            unread: 2,
            lastKind: 'text',
            lastText: 'Ok',
            lastAtUtc: '2026-10-23T14:00:00Z',
          },
          { conversationId: null, subjectId: 'x' },
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
          lastAtUtc: '2026-10-23T14:00:00Z',
        },
      ],
    });
  });

  it("reads the floor's inbox, with the defaults a thin answer leaves", () => {
    const inbox = branchConversationsFromWire({
      items: [
        {
          conversationId: 'c-1',
          subject: {
            kind: 'takeaway',
            id: ORDER,
            label: 'T-485',
            guestName: 'Կարեն Ս.',
            localTime: '19:25:00',
          },
          lastMessage: {
            author: 'guest',
            kind: 'text',
            text: 'Կարո՞ղ եմ շուտ գալ',
            createdAtUtc: '2026-10-23T14:30:00Z',
          },
          unreadFromGuest: 1,
          awaitingGuestAnswer: false,
          oldestUnansweredGuestMessageUtc: '2026-10-23T14:30:00Z',
          open: true,
        },
      ],
    });
    expect(inbox).toMatchObject({
      unreadTotal: 1,
      remindAfterMinutes: 3,
      templates: null,
      waitersCanWrite: true,
    });
    expect(inbox.items[0]).toMatchObject({
      subject: { kind: 'takeaway', label: 'T-485', localTime: '19:25' },
      lastMessage: { author: 'guest', staffName: null, answer: null },
    });
  });

  it('reads the settings, defaulting what a thin answer leaves out', () => {
    expect(messageSettingsFromWire({ guestsCanWrite: false, templates: ['A'] })).toEqual({
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
        body: { conversationId: null, open: true, messages: [] },
      },
      [`POST /api/diner/takeaway-orders/${ORDER}/conversation/messages`]: {
        body: {
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
    expect(sent).toMatchObject({ id: 'm-9', wasReplay: true });
    await gateway.markConversationRead({ kind: 'reservation', id: RESERVATION });
    expect(await gateway.getUnreadMessages()).toEqual({ total: 0, items: [] });

    const send = backend.requests.find((request) => request.method === 'POST');
    expect(send?.body).toEqual({ text: 'Hi', clientCommandId: COMMAND });
  });

  it("answers somebody else's thread as none", async () => {
    const { gateway } = dinerOver({});
    expect(await gateway.getConversation({ kind: 'reservation', id: RESERVATION })).toBeNull();
  });

  it.each([
    [
      problemReply(409, 'conversation-closed', { closesAtUtc: '2026-10-23T19:00:00Z' }),
      ConversationClosedError,
    ],
    [problemReply(403, 'guests-cannot-write'), GuestsCannotWriteError],
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

  it("keeps the server's Retry-After on messages-too-fast", async () => {
    const { gateway } = dinerOver({
      [`POST /api/diner/reservations/${RESERVATION}/conversation/messages`]: {
        ...problemReply(429, 'messages-too-fast', { perConversation: true }),
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
    expect(error).toMatchObject({ retryAfterSeconds: 42, perConversation: true });
    expect(messageFailure(error)).toEqual({
      kind: 'tooFast',
      retryAfterSeconds: 42,
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
        },
      },
      [`GET /api/reservations/${RESERVATION}/conversation`]: {
        body: { ...WIRE_THREAD, guestName: 'Անի Մ.', canWrite: true },
      },
      [`POST /api/takeaway-orders/${ORDER}/conversation/messages`]: {
        body: {
          id: 'm-10',
          author: 'venue',
          kind: 'text',
          text: 'Այո',
          staffName: 'Արամ',
          createdAtUtc: '2026-10-23T14:41:00Z',
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
    ).toMatchObject({ guestName: 'Անի Մ.', canWrite: true });
    expect(
      await gateway.sendStaffMessage({
        subject: { kind: 'takeaway', id: ORDER },
        text: 'Այո',
        clientCommandId: COMMAND,
      }),
    ).toMatchObject({ staffName: 'Արամ', wasReplay: false });
    await gateway.markStaffConversationRead({ kind: 'takeaway', id: ORDER });
    expect(backend.requests.map((request) => `${request.method} ${request.path}`)).toContain(
      `POST /api/takeaway-orders/${ORDER}/conversation/read`,
    );
  });

  it.each([
    [problemReply(403, 'waiters-cannot-write'), WaitersCannotWriteError],
    [problemReply(403, 'forbidden'), ForbiddenError],
    [problemReply(409, 'conversation-closed'), ConversationClosedError],
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

  it('carries the floor line and the tile badge when the server sends them, and nothing otherwise', async () => {
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
    };
    const floor = {
      branchId: BRANCH,
      branchName: 'Կենտրոն',
      timeZoneId: 'Asia/Yerevan',
      asOfUtc: '2026-10-23T14:34:00Z',
      maxSequence: 4,
      tables: [table, { ...table, tableId: 't-7', label: '7', nextReservationUnreadMessages: 0 }],
      messages: { unreadTotal: 2, oldestUnansweredUtc: '2026-10-23T14:30:00Z' },
    };
    const { gateway } = staffOver({
      [`GET /api/branches/${BRANCH}/tables/floor`]: { body: floor },
    });
    const read = await gateway.getFloor(BRANCH);
    expect(read?.messages).toEqual({ unreadTotal: 2, oldestUnansweredUtc: '2026-10-23T14:30:00Z' });
    expect(read?.details[0]?.nextReservationUnreadMessages).toBe(2);
    expect('nextReservationUnreadMessages' in (read?.details[1] ?? {})).toBe(false);

    const { messages: _messages, ...older } = floor;
    const { gateway: before } = staffOver({
      [`GET /api/branches/${BRANCH}/tables/floor`]: { body: older },
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
  it('reads them and saves all four, trimmed', async () => {
    const saved = {
      guestsCanWrite: true,
      waitersCanWrite: false,
      templates: ['Լավ, սպասում ենք'],
      remindAfterMinutes: 5,
    };
    const { backend, gateway } = consoleOver({
      [`GET /api/branches/${BRANCH}/message-settings`]: { body: saved },
      [`PUT /api/branches/${BRANCH}/message-settings`]: (request) => ({ body: request.body }),
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
});
