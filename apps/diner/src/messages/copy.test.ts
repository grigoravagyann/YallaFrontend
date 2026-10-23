import { messageFailure, ConversationClosedError, MessagesTooFastError } from '@yalla/api';
import type { ConversationSummary, MessageFailure, UnreadConversation } from '@yalla/api';
import { dinerResources } from '@yalla/i18n/diner';
import { describe, expect, it } from 'vitest';
import {
  failureHidesComposer,
  failureLine,
  lastMessageLine,
  messageBody,
  messageRow,
  threadRoute,
  unreadFor,
  venueInitial,
} from './copy';

/**
 * Guest messages (2026-10-23), the words the diner app builds: the server
 * sends the venue's ask, the guest's answers and the system's line as fields,
 * never prose, so a guest who switches language reads the old ones in the new.
 */

const clock = (hhmm: string) => `[${hhmm}]`;
const base = { text: null, answer: null, status: null } as const;

function lookup(dotted: string, locale: 'hy' | 'ru' | 'en' = 'en'): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      dinerResources[locale].diner,
    );
}

describe('messageBody', () => {
  it('keeps a text as written', () => {
    expect(messageBody({ ...base, kind: 'text', text: 'No onions, please' }, ctx())).toEqual({
      text: 'No onions, please',
    });
  });

  it("asks the venue's question at the booking's start, on the branch's clock", () => {
    expect(messageBody({ ...base, kind: 'askComing' }, ctx('19:30'))).toEqual({
      key: 'messages.ask',
      params: { time: '[19:30]' },
    });
    expect(messageBody({ ...base, kind: 'askComing' }, ctx(null))).toEqual({
      key: 'messages.askPlain',
    });
  });

  it("says the guest's three answers", () => {
    const answer = (kind: 'coming' | 'late' | 'notComing', lateMinutes: number | null = null) =>
      messageBody({ ...base, kind: 'answer', answer: { kind, lateMinutes } }, ctx());
    expect(answer('coming')).toEqual({ key: 'messages.answer.coming' });
    expect(answer('late', 15)).toEqual({ key: 'messages.answer.late', params: { minutes: 15 } });
    expect(answer('notComing')).toEqual({ key: 'messages.answer.notComing' });
  });

  it("says what the system's line changed", () => {
    const status = (
      heldUntilLocal: string | null,
      cancelled: boolean,
      answer: 'coming' | 'late' | 'notComing' | 'unknown' = 'unknown',
    ) =>
      messageBody(
        { ...base, kind: 'status', status: { answer, heldUntilLocal, cancelled } },
        ctx(),
      );
    expect(status('19:45', false)).toEqual({
      key: 'messages.status.held',
      params: { time: '[19:45]' },
    });
    expect(status(null, true)).toEqual({ key: 'messages.status.cancelled' });
    expect(status(null, false)).toEqual({ key: 'messages.status.updated' });
    // The line names the answer it follows: "Booking updated · coming".
    expect(status(null, false, 'coming')).toEqual({ key: 'messages.status.coming' });
    // …and, from a server that did not say, the answer just before it.
    expect(
      messageBody(
        {
          ...base,
          kind: 'status',
          status: { answer: 'unknown', heldUntilLocal: null, cancelled: false },
        },
        { ...ctx(), previous: { kind: 'answer', answer: { kind: 'coming', lateMinutes: null } } },
      ),
    ).toEqual({ key: 'messages.status.coming' });
  });

  it('shows nothing for a kind a newer server added, unless it has words', () => {
    expect(messageBody({ ...base, kind: 'unknown' }, ctx())).toBeNull();
    expect(messageBody({ ...base, kind: 'unknown', text: 'Hi' }, ctx())).toEqual({ text: 'Hi' });
  });

  it('has every sentence in all three languages', () => {
    const keys = [
      'messages.ask',
      'messages.askPlain',
      'messages.answer.coming',
      'messages.answer.late',
      'messages.answer.notComing',
      'messages.status.held',
      'messages.status.coming',
      'messages.status.cancelled',
      'messages.status.updated',
    ];
    for (const locale of ['hy', 'ru', 'en'] as const) {
      for (const key of keys)
        expect(lookup(key, locale), `${locale} ${key}`).toEqual(expect.any(String));
    }
  });

  function ctx(localTime: string | null = '19:30') {
    return { localTime, clock };
  }
});

describe('failureLine', () => {
  it('says why each refusal happened', () => {
    const cases: [MessageFailure, string][] = [
      [{ kind: 'closed', closedAtUtc: null }, 'messages.failure.closed'],
      [{ kind: 'guestsCannotWrite' }, 'messages.failure.guestsCannotWrite'],
      [{ kind: 'forbidden' }, 'messages.failure.forbidden'],
      [{ kind: 'invalid', violations: [] }, 'messages.failure.invalid'],
      [{ kind: 'notFound' }, 'messages.failure.notFound'],
      [{ kind: 'offline' }, 'messages.failure.offline'],
      [{ kind: 'generic' }, 'messages.failure.generic'],
      [
        { kind: 'tooFast', retryAfterSeconds: null, perConversation: false },
        'messages.failure.tooFast',
      ],
      [
        { kind: 'tooFast', retryAfterSeconds: null, perConversation: true },
        'messages.failure.tooFastThread',
      ],
    ];
    for (const [failure, key] of cases) {
      expect(failureLine(failure).key).toBe(key);
      expect(lookup(key)).toEqual(expect.any(String));
    }
    expect(failureLine({ kind: 'tooFast', retryAfterSeconds: 40, perConversation: false })).toEqual(
      { key: 'messages.failure.tooFastWait', params: { seconds: 40 } },
    );
  });

  it('hides the composer only when the thread takes no more text', () => {
    expect(failureHidesComposer(messageFailure(new ConversationClosedError({ url: '/x' })))).toBe(
      true,
    );
    expect(failureHidesComposer({ kind: 'guestsCannotWrite' })).toBe(true);
    expect(failureHidesComposer(messageFailure(new MessagesTooFastError({ url: '/x' })))).toBe(
      false,
    );
    expect(failureHidesComposer({ kind: 'offline' })).toBe(false);
  });
});

describe('messageRow', () => {
  const summary = (overrides: Partial<ConversationSummary> = {}): ConversationSummary => ({
    unread: 0,
    lastAuthor: null,
    lastKind: null,
    lastText: null,
    lastAtUtc: null,
    open: true,
    ...overrides,
  });
  const unread = (overrides: Partial<UnreadConversation> = {}): UnreadConversation => ({
    conversationId: 'c1',
    subjectKind: 'reservation',
    subjectId: 'r1',
    venueName: 'Lava',
    unread: 1,
    lastText: 'Are you coming at 19:30?',
    lastKind: 'text',
    lastAuthor: 'venue',
    lastAtUtc: '2026-10-23T14:31:00Z',
    open: true,
    ...overrides,
  });

  it('is nothing without a thread', () => {
    expect(messageRow(null)).toBeNull();
    expect(messageRow(undefined, null)).toBeNull();
  });

  it('offers to write before anybody has, and nothing once that has closed', () => {
    expect(messageRow(summary())).toEqual({ kind: 'write' });
    expect(messageRow(summary({ open: false }))).toBeNull();
  });

  it('says "new" with the count and the last line', () => {
    expect(
      messageRow(
        summary({
          unread: 1,
          lastText: 'Hello',
          lastKind: 'text',
          lastAtUtc: '2026-10-23T14:31:00Z',
        }),
      ),
    ).toEqual({
      kind: 'unread',
      unread: 1,
      atUtc: '2026-10-23T14:31:00Z',
      line: { text: 'Hello' },
    });
  });

  it('takes the fresher unread summary over the list', () => {
    const row = messageRow(
      summary({ unread: 0, lastText: 'Old', lastKind: 'text', lastAtUtc: '2026-10-23T12:00:00Z' }),
      unread({ unread: 2, lastText: 'New', lastAtUtc: '2026-10-23T14:31:00Z' }),
    );
    expect(row).toEqual({
      kind: 'unread',
      unread: 2,
      atUtc: '2026-10-23T14:31:00Z',
      line: { text: 'New' },
    });
    // Read since the list was: no longer new.
    expect(
      messageRow(
        summary({ unread: 1, lastText: 'Hi', lastKind: 'text', lastAtUtc: '2026-10-23T14:31:00Z' }),
        unread({ unread: 0, lastText: 'Hi', lastAtUtc: '2026-10-23T14:31:00Z' }),
      ),
    ).toMatchObject({ kind: 'last' });
  });

  it('says a closed thread is closed', () => {
    expect(
      messageRow(summary({ open: false, lastKind: 'status', lastAtUtc: '2026-10-18T17:00:00Z' })),
    ).toEqual({ kind: 'closed' });
  });

  it('words a last message that has no text by what it was', () => {
    expect(lastMessageLine({ lastKind: 'askComing', lastText: null })).toEqual({
      key: 'messages.askPlain',
    });
    expect(lastMessageLine({ lastKind: 'answer', lastText: null })).toEqual({
      key: 'messages.row.answered',
    });
  });

  it("finds a subject's row in the unread summary", () => {
    const items = [unread(), unread({ subjectKind: 'takeaway', subjectId: 't1' })];
    expect(unreadFor(items, { kind: 'takeaway', id: 't1' })?.subjectId).toBe('t1');
    expect(unreadFor(items, { kind: 'reservation', id: 'other' })).toBeNull();
    expect(unreadFor(undefined, { kind: 'reservation', id: 'r1' })).toBeNull();
  });
});

describe('threadRoute and venueInitial', () => {
  it("opens a booking's or an order's thread, with a draft when there is one", () => {
    expect(threadRoute({ kind: 'reservation', id: 'r1' })).toEqual({
      pathname: '/messages/reservation/[id]',
      params: { id: 'r1' },
    });
    expect(threadRoute({ kind: 'takeaway', id: 't1' }, 'No onions')).toEqual({
      pathname: '/messages/takeaway/[id]',
      params: { id: 't1', draft: 'No onions' },
    });
  });

  it('takes the first letter as a reader sees it', () => {
    expect(venueInitial('Լավա ռեստորան')).toBe('Լ');
    expect(venueInitial('  lumen')).toBe('L');
    expect(venueInitial('')).toBe('·');
  });
});
