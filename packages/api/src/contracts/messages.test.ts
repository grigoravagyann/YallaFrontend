import { describe, expect, it } from 'vitest';
import { NetworkError, NotFoundError, ValidationError } from '../errors';
import { ConversationClosedError, GuestsCannotWriteError, WaitersCannotWriteError } from './errors';
import { messageFailure } from './messageFailure';
import {
  VENUE_MESSAGE_PUSH_CATEGORIES,
  compareConversationItems,
  conversationClosesAtUtc,
  filterConversations,
  hasUnansweredAsk,
  isConversationOpen,
  isConversationReadable,
  messageSettingsViolations,
  messageViolations,
  needsReminder,
  newestShownMessageUtc,
  seenByGuest,
  seenByVenue,
  staffMayWrite,
  unreadAfterMark,
  venueMessageFeedSubject,
  venueMessagePushTarget,
  type StaffConversationListItem,
} from './messages';

/**
 * The guest-messages rules as the screens and the mocks read them
 * (`docs/messages.md`, 2026-10-23): the open window, the bounds, who may
 * write, the answer bar, the reminder, the inbox's order and filters, the
 * push and feed targets, and the failures as kinds of sentence.
 */

const END = '2026-10-23T17:00:00.000Z';
const at = (iso: string) => new Date(iso);

describe('the open window', () => {
  it('runs to two hours after a live booking ends', () => {
    const closes = conversationClosesAtUtc({ kind: 'reservation', active: true, endUtc: END });
    expect(closes).toBe('2026-10-23T19:00:00.000Z');
    expect(isConversationOpen(closes, at('2026-10-23T18:59:00Z'))).toBe(true);
    expect(isConversationOpen(closes, at('2026-10-23T19:00:00Z'))).toBe(false);
  });

  it('runs two hours from a cancellation, never past two hours after the end', () => {
    expect(
      conversationClosesAtUtc({
        kind: 'reservation',
        active: false,
        endUtc: END,
        endedAtUtc: '2026-10-23T12:00:00.000Z',
      }),
    ).toBe('2026-10-23T14:00:00.000Z');
    expect(
      conversationClosesAtUtc({
        kind: 'reservation',
        active: false,
        endUtc: END,
        endedAtUtc: '2026-10-23T18:30:00.000Z',
      }),
    ).toBe('2026-10-23T19:00:00.000Z');
  });

  it('stays open while a takeaway order moves, and two hours after it finishes', () => {
    expect(conversationClosesAtUtc({ kind: 'takeaway', active: true })).toBeNull();
    expect(isConversationOpen(null, at(END))).toBe(true);
    expect(
      conversationClosesAtUtc({
        kind: 'takeaway',
        active: false,
        endedAtUtc: '2026-10-23T15:10:00.000Z',
      }),
    ).toBe('2026-10-23T17:10:00.000Z');
  });

  it('is readable for thirty days after it closes', () => {
    const closes = '2026-10-23T19:00:00.000Z';
    expect(isConversationReadable(closes, at('2026-11-22T18:59:00Z'))).toBe(true);
    expect(isConversationReadable(closes, at('2026-11-22T19:00:00Z'))).toBe(false);
    expect(isConversationReadable(null, at('2027-01-01T00:00:00Z'))).toBe(true);
  });
});

describe('the bounds', () => {
  it('takes 1–500 characters after trim, naming `text`', () => {
    expect(messageViolations('  Hi  ')).toEqual([]);
    expect(messageViolations('ա'.repeat(500))).toEqual([]);
    expect(messageViolations('   ')[0]).toMatchObject({ field: 'text', min: 1, max: 500 });
    expect(messageViolations('ա'.repeat(501))[0]?.field).toBe('text');
    expect(messageViolations(null)).toHaveLength(1);
  });

  it('names every bad setting in the server field names', () => {
    expect(
      messageSettingsViolations({
        guestsCanWrite: true,
        waitersCanWrite: true,
        templates: null,
        remindAfterMinutes: 3,
      }),
    ).toEqual([]);
    expect(
      messageSettingsViolations({
        guestsCanWrite: true,
        waitersCanWrite: true,
        templates: ['ok', '', 'ա'.repeat(121)],
        remindAfterMinutes: 0,
      }).map((violation) => violation.field),
    ).toEqual(['remindAfterMinutes', 'templates[1]', 'templates[2]']);
    expect(
      messageSettingsViolations({
        guestsCanWrite: true,
        waitersCanWrite: true,
        templates: Array.from({ length: 9 }, () => 'ok'),
        remindAfterMinutes: 15,
      }).map((violation) => violation.field),
    ).toEqual(['templates']);
  });
});

describe('who may write', () => {
  it('lets managers, the GM and the owner always, waiters while allowed, nobody else', () => {
    const off = { waitersCanWrite: false };
    const on = { waitersCanWrite: true };
    expect(
      ['owner', 'generalManager', 'manager'].every((role) => staffMayWrite(role as 'owner', off)),
    ).toBe(true);
    expect(staffMayWrite('waiter', on)).toBe(true);
    expect(staffMayWrite('waiter', off)).toBe(false);
    expect(staffMayWrite('kitchen', on)).toBe(false);
    expect(staffMayWrite('platformAdmin', on)).toBe(false);
  });
});

describe('the thread as the screens read it', () => {
  it('shows the answer bar while the last ask has no answer after it', () => {
    expect(hasUnansweredAsk([{ kind: 'text' }, { kind: 'askComing' }])).toBe(true);
    expect(hasUnansweredAsk([{ kind: 'askComing' }, { kind: 'text' }])).toBe(true);
    expect(hasUnansweredAsk([{ kind: 'askComing' }, { kind: 'answer' }, { kind: 'status' }])).toBe(
      false,
    );
    expect(hasUnansweredAsk([{ kind: 'text' }])).toBe(false);
  });

  it('says "seen" through the other side\'s read, never on a pending message', () => {
    const guest = { author: 'guest', createdAtUtc: '2026-10-23T12:05:00Z' } as const;
    expect(seenByVenue(guest, '2026-10-23T12:05:00Z')).toBe(true);
    expect(seenByVenue(guest, '2026-10-23T12:04:00Z')).toBe(false);
    expect(seenByVenue({ ...guest, pending: true }, '2026-10-23T13:00:00Z')).toBe(false);
    expect(seenByVenue(guest, null)).toBe(false);
    expect(seenByGuest({ ...guest, author: 'venue' }, '2026-10-23T13:00:00Z')).toBe(true);
    expect(seenByGuest(guest, '2026-10-23T13:00:00Z')).toBe(false);
  });
});

describe('the inbox', () => {
  const item = (
    id: string,
    kind: 'reservation' | 'takeaway',
    waitingSince: string | null,
    lastAt: string,
  ): StaffConversationListItem => ({
    conversationId: `c-${id}`,
    subject: {
      kind,
      id,
      label: id,
      guestName: id,
      localTime: null,
      localDate: null,
      partySize: null,
      itemCount: null,
      totalAmd: null,
    },
    lastMessage: {
      author: 'guest',
      kind: 'text',
      text: 'x',
      createdAtUtc: lastAt,
      staffName: null,
      answer: null,
    },
    latestStatus: null,
    unreadFromGuest: 0,
    awaitingGuestAnswer: false,
    oldestUnansweredGuestMessageUtc: waitingSince,
    open: true,
  });

  const rows = [
    item('answered-new', 'reservation', null, '2026-10-23T14:40:00Z'),
    item('waiting-short', 'takeaway', '2026-10-23T14:35:00Z', '2026-10-23T14:35:00Z'),
    item('answered-old', 'reservation', null, '2026-10-23T12:00:00Z'),
    item('waiting-long', 'reservation', '2026-10-23T14:20:00Z', '2026-10-23T14:30:00Z'),
  ];

  it('orders unanswered first (longest waiting first), then newest', () => {
    expect([...rows].sort(compareConversationItems).map((row) => row.subject.id)).toEqual([
      'waiting-long',
      'waiting-short',
      'answered-new',
      'answered-old',
    ]);
  });

  it('filters All, Unanswered and Takeaway', () => {
    expect(filterConversations(rows, 'all')).toHaveLength(4);
    expect(filterConversations(rows, 'unanswered').map((row) => row.subject.id)).toEqual([
      'waiting-short',
      'waiting-long',
    ]);
    expect(filterConversations(rows, 'takeaway').map((row) => row.subject.id)).toEqual([
      'waiting-short',
    ]);
  });

  it('reminds once a guest message has waited the branch minutes', () => {
    const now = at('2026-10-23T14:38:00Z');
    expect(needsReminder(rows[1]!, 3, now)).toBe(true);
    expect(needsReminder(rows[1]!, 4, now)).toBe(false);
    expect(needsReminder(rows[0]!, 3, now)).toBe(false);
  });
});

describe('the push and the feed', () => {
  it('reads the thread a venue-message push is about', () => {
    expect(
      venueMessagePushTarget({
        kind: 'venue-message',
        conversationId: 'c-1',
        reservationId: 'r-1',
        ask: 'true',
      }),
    ).toEqual({ subject: { kind: 'reservation', id: 'r-1' }, conversationId: 'c-1', ask: true });
    expect(
      venueMessagePushTarget({ kind: 'venue-message', takeawayOrderId: 'tk-1', ask: 'false' }),
    ).toEqual({ subject: { kind: 'takeaway', id: 'tk-1' }, conversationId: null, ask: false });
    expect(venueMessagePushTarget({ kind: 'takeaway-ready', orderId: 'tk-1' })).toBeNull();
    expect(venueMessagePushTarget({ kind: 'venue-message' })).toBeNull();
  });

  it('reads the thread a venue-message feed row is about', () => {
    expect(
      venueMessageFeedSubject({ kind: 'venue-message', reservationId: null, orderId: 'tk-1' }),
    ).toEqual({ kind: 'takeaway', id: 'tk-1' });
    // The backend's row: one id set, `subjectKind` naming which.
    expect(
      venueMessageFeedSubject({
        kind: 'venue-message',
        reservationId: 'r-1',
        orderId: null,
        params: { subjectKind: 'reservation', ask: 'true', conversationId: 'c-1' },
      }),
    ).toEqual({ kind: 'reservation', id: 'r-1' });
    expect(
      venueMessageFeedSubject({ kind: 'booking-confirmed', reservationId: 'r-1', orderId: null }),
    ).toBeNull();
  });
});

describe('a failure, as the kind of sentence to show', () => {
  it('names each refusal', () => {
    expect(messageFailure(new ConversationClosedError({ url: 'x', closedAtUtc: END }))).toEqual({
      kind: 'closed',
      closedAtUtc: END,
    });
    expect(messageFailure(new GuestsCannotWriteError({ url: 'x' })).kind).toBe('guestsCannotWrite');
    expect(messageFailure(new WaitersCannotWriteError({ url: 'x' })).kind).toBe(
      'waitersCannotWrite',
    );
    expect(messageFailure(new NotFoundError({ url: 'x' })).kind).toBe('notFound');
    expect(messageFailure(new NetworkError({ url: 'x' })).kind).toBe('offline');
    expect(messageFailure(new Error('boom')).kind).toBe('generic');
  });

  it('carries the fields a 422 named', () => {
    const error = new ValidationError({
      url: 'x',
      status: 422,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail: 'text',
        code: 'validation-failed',
        traceId: 't',
        instance: null,
        errors: null,
        context: { fields: [{ field: 'text', message: 'Too long.', bound: 'max', max: 500 }] },
      },
    });
    expect(messageFailure(error)).toEqual({
      kind: 'invalid',
      violations: [{ field: 'text', message: 'Too long.', bound: 'max', max: 500 }],
    });
  });
});

describe('the read mark', () => {
  const at = (createdAtUtc: string, author: 'guest' | 'venue' = 'venue', pending = false) => ({
    createdAtUtc,
    author,
    ...(pending ? { pending: true } : {}),
  });

  it("is the newest message the server sent, never a pending one's", () => {
    expect(
      newestShownMessageUtc([
        at('2026-10-23T14:31:00Z'),
        at('2026-10-23T14:35:00Z', 'guest'),
        at('2026-10-23T14:40:00Z', 'guest', true),
      ]),
    ).toBe('2026-10-23T14:35:00Z');
    expect(newestShownMessageUtc([at('2026-10-23T14:40:00Z', 'guest', true)])).toBeNull();
    expect(newestShownMessageUtc([])).toBeNull();
  });

  it("leaves the other side's messages after it unread, never more than the server counted", () => {
    const messages = [
      at('2026-10-23T14:31:00Z'),
      at('2026-10-23T14:36:00Z'),
      at('2026-10-23T14:37:00Z', 'guest'),
    ];
    expect(unreadAfterMark(messages, 'venue', '2026-10-23T14:31:00Z', 2)).toBe(1);
    expect(unreadAfterMark(messages, 'venue', '2026-10-23T14:31:00Z', 0)).toBe(0);
    expect(unreadAfterMark(messages, 'venue', '2026-10-23T14:36:00Z', 2)).toBe(0);
    // Up to now: nothing is left.
    expect(unreadAfterMark(messages, 'venue', null, 2)).toBe(0);
  });
});

describe('the push categories', () => {
  it('names all four a venue message may carry', () => {
    expect([...VENUE_MESSAGE_PUSH_CATEGORIES]).toEqual([
      'venue-ask',
      'venue-ask-buttons',
      'venue-message',
      'venue-message-readonly',
    ]);
  });
});
