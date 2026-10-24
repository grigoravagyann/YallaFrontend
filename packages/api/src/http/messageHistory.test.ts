import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { conversationOutcome } from './messageHistoryMapping';

/**
 * Message history over HTTP (`listBranchMessageHistory`, Yalla
 * `docs/messages.md` §8): the list's query string (every value a string), the
 * page read tolerantly (the API leaves a null property out), and the thread
 * read through the floor's own route with the console's session — a GET,
 * never a read mark — with its `subject.outcome`.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const FILTERS = {
  from: '2026-10-18',
  to: '2026-10-24',
  kind: 'all' as const,
  q: '',
  unansweredOnly: false,
};

const ROW = {
  conversationId: 'c-1',
  subject: {
    kind: 'reservation',
    id: 'res-1',
    label: '6',
    guestName: 'Անի Մարտիրոսյան',
    localDate: '2026-10-24',
    localTime: '19:30',
    partySize: 4,
    outcome: 'no-show',
  },
  messageCount: 5,
  firstAtUtc: '2026-10-24T08:05:00Z',
  lastAtUtc: '2026-10-24T14:33:00Z',
  lastLocal: '2026-10-24 18:33',
  staffNames: ['Լիլիթ Հակոբյան', 'Արամ Սարգսյան'],
  unanswered: false,
  open: true,
};

describe('the history list', () => {
  it('sends the range and the kind always, the rest only when set', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/branches/b-1/conversations/history': {
        body: { items: [], from: '2026-10-18', to: '2026-10-24' },
      },
    });
    await gateway.listMessageHistory('b-1', FILTERS);
    await gateway.listMessageHistory('b-1', {
      ...FILTERS,
      kind: 'takeaway',
      q: '  T-482 ',
      unansweredOnly: true,
      cursor: 'opaque==',
      limit: 20,
    });
    const [first, second] = backend.requests.map((request) =>
      Object.fromEntries(request.query.entries()),
    );
    expect(first).toEqual({ from: '2026-10-18', to: '2026-10-24', kind: 'all', limit: '50' });
    expect(second).toEqual({
      from: '2026-10-18',
      to: '2026-10-24',
      kind: 'takeaway',
      q: 'T-482',
      unansweredOnly: 'true',
      cursor: 'opaque==',
      limit: '20',
    });
  });

  it('leaves a blank date out for the server to default, and reads the dates it answers', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/branches/b-1/conversations/history': {
        body: { items: [], from: '2026-04-25', to: '2026-05-01' },
      },
    });
    const page = await gateway.listMessageHistory('b-1', {
      ...FILTERS,
      from: '',
      to: '2026-05-01',
    });
    expect(Object.fromEntries(backend.requests[0]!.query.entries())).toEqual({
      to: '2026-05-01',
      kind: 'all',
      limit: '50',
    });
    expect(page).toMatchObject({ from: '2026-04-25', to: '2026-05-01' });
  });

  it('reads a row, its outcome and its cursor, and a thin row as empty', async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-1/conversations/history': {
        body: {
          items: [
            ROW,
            {
              conversationId: 'c-2',
              subject: {
                kind: 'takeaway',
                id: 'ord-2',
                label: 'T-485',
                itemCount: 3,
                totalAmd: 5400,
              },
              lastAtUtc: '2026-10-24T14:30:00Z',
            },
            // No subject id: nothing to open, so nothing to list.
            { conversationId: 'c-3', subject: { kind: 'reservation' } },
          ],
          nextCursor: 'next-1',
          from: '2026-10-18',
          to: '2026-10-24',
        },
      },
    });
    const page = await gateway.listMessageHistory('b-1', FILTERS);
    expect(page.nextCursor).toBe('next-1');
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toEqual({
      conversationId: 'c-1',
      subject: {
        kind: 'reservation',
        id: 'res-1',
        label: '6',
        guestName: 'Անի Մարտիրոսյան',
        localDate: '2026-10-24',
        localTime: '19:30',
        partySize: 4,
        itemCount: null,
        totalAmd: null,
        outcome: 'noShow',
      },
      messageCount: 5,
      firstAtUtc: '2026-10-24T08:05:00Z',
      lastAtUtc: '2026-10-24T14:33:00Z',
      lastLocal: '2026-10-24 18:33',
      staffNames: ['Լիլիթ Հակոբյան', 'Արամ Սարգսյան'],
      unanswered: false,
      open: true,
    });
    expect(page.items[1]).toMatchObject({
      subject: {
        kind: 'takeaway',
        label: 'T-485',
        itemCount: 3,
        totalAmd: 5400,
        outcome: 'unknown',
      },
      messageCount: 0,
      staffNames: [],
      unanswered: false,
      open: false,
      firstAtUtc: '2026-10-24T14:30:00Z',
    });
  });

  it('keeps the range asked for when the answer leaves it out, and the last page has no cursor', async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-1/conversations/history': { body: {} },
    });
    expect(await gateway.listMessageHistory('b-1', FILTERS)).toEqual({
      items: [],
      nextCursor: null,
      from: '2026-10-18',
      to: '2026-10-24',
    });
  });

  it('reads every outcome word, in any spelling', () => {
    expect(
      [
        'came',
        'no-show',
        'NoShow',
        'cancelled',
        'declined',
        'upcoming',
        'collected',
        'in-progress',
        'refunded',
        3,
      ].map(conversationOutcome),
    ).toEqual([
      'came',
      'noShow',
      'noShow',
      'cancelled',
      'declined',
      'upcoming',
      'collected',
      'inProgress',
      'unknown',
      'unknown',
    ]);
  });

  it('keeps a 422 naming every bad field with its bound, and a 403 as itself', async () => {
    const { gateway } = gatewayOver({
      // As `MessageHistoryRules.Check` writes them: a date's bound is a date, a count's a number.
      'GET /api/branches/b-1/conversations/history': problemReply(422, 'validation-failed', {
        fields: [
          {
            field: 'from',
            message: 'from (2026-10-25) is after to (2026-10-24).',
            bound: 'conflict',
            max: '2026-10-24',
            value: '2026-10-25',
          },
          {
            field: 'q',
            message: 'A search is at most 60 characters.',
            bound: 'max',
            max: 60,
            value: 61,
          },
        ],
      }),
      'GET /api/branches/b-2/conversations/history': problemReply(403, 'forbidden'),
    });
    const refused = await gateway
      .listMessageHistory('b-1', FILTERS)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).violations).toEqual([
      {
        field: 'from',
        message: 'from (2026-10-25) is after to (2026-10-24).',
        bound: 'conflict',
      },
      { field: 'q', message: 'A search is at most 60 characters.', bound: 'max', max: 60 },
    ]);
    await expect(gateway.listMessageHistory('b-2', FILTERS)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('the thread beside it', () => {
  const THREAD = {
    conversationId: 'c-1',
    subject: {
      kind: 'reservation',
      id: 'res-1',
      tableLabel: '6',
      localTime: '19:30',
      outcome: 'came',
    },
    open: false,
    messages: [
      {
        id: 'm-1',
        author: 'guest',
        kind: 'text',
        text: 'Բարև',
        createdAtUtc: '2026-10-24T08:05:00Z',
      },
      {
        id: 'm-2',
        author: 'venue',
        kind: 'text',
        text: 'Բարև, Անի',
        createdAtUtc: '2026-10-24T08:20:00Z',
        staffName: 'Լիլիթ Հակոբյան',
      },
    ],
    guestName: 'Անի Մարտիրոսյան',
  };

  it('reads the floor’s own route with a GET, and posts nothing', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/reservations/res-1/conversation': { body: THREAD },
      'GET /api/takeaway-orders/ord-2/conversation': {
        body: { ...THREAD, subject: { kind: 'takeaway', id: 'ord-2', takeawayCode: 'T-485' } },
      },
    });
    const thread = await gateway.getStaffConversation({ kind: 'reservation', id: 'res-1' });
    expect(thread?.messages.map((message) => message.staffName)).toEqual([null, 'Լիլիթ Հակոբյան']);
    expect(thread?.canWrite).toBe(false);
    expect(thread?.subject.outcome).toBe('came');
    const order = await gateway.getStaffConversation({ kind: 'takeaway', id: 'ord-2' });
    // A server that says nothing of it: unknown, never a guess.
    expect(order?.subject.outcome).toBe('unknown');
    expect(backend.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /api/reservations/res-1/conversation',
      'GET /api/takeaway-orders/ord-2/conversation',
    ]);
  });

  it('answers null for a subject that is gone', async () => {
    const { gateway } = gatewayOver({});
    expect(await gateway.getStaffConversation({ kind: 'reservation', id: 'gone' })).toBeNull();
  });
});
