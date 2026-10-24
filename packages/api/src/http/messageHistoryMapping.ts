import {
  MESSAGE_HISTORY_PAGE_SIZE,
  historySearchText,
  type MessageHistoryItem,
  type MessageHistoryPage,
  type MessageHistoryQuery,
} from '../contracts/messageHistory';
import type { components, operations } from '../generated/schema';
import { conversationOutcome, subjectKind } from './messagesMapping';

export { conversationOutcome } from './messagesMapping';

/**
 * The message-history wire (Yalla `docs/messages.md` §8, 2026-10-24):
 * `GET /api/branches/{branchId}/conversations/history`
 * (`listBranchMessageHistory`).
 *
 * The shapes are the generated schema's. Every query value is a string on the
 * wire — the server reads them as strings so one that does not parse is named
 * in the one `422 validation-failed` with the rest. The answer is read
 * tolerantly, as `messagesMapping.ts` reads its own: an outcome as its word
 * ("no-show") and anything else as `unknown`, a property the API leaves out
 * (it omits nulls) as `null`.
 */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

type Schemas = components['schemas'];

/** `subject` on a history row. */
export type WireMessageHistorySubject = Schemas['Yalla.Application.Messages.MessageHistorySubject'];

/** One row. */
export type WireMessageHistoryItem = Schemas['Yalla.Application.Messages.MessageHistoryItem'];

/** The page: `{ items, nextCursor?, from, to }`. */
export type WireMessageHistoryPage = Schemas['Yalla.Application.Messages.MessageHistoryPage'];

/** The query string the route reads: every value a string. */
export type WireMessageHistoryParams = NonNullable<
  operations['listBranchMessageHistory']['parameters']['query']
>;

// ---------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** "19:30" — and "19:30:00", should a server write the seconds — said as "19:30". */
function wallClock(value: unknown): string | null {
  const said = text(value);
  if (said === null) return null;
  return /^\d{2}:\d{2}/u.test(said) ? said.slice(0, 5) : said;
}

/** "2026-10-24 18:31" (or "2026-10-24T18:31:00"): the day and the minute, as "2026-10-24 18:31". */
function localStamp(value: unknown): string {
  const said = text(value);
  if (said === null) return '';
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/u.exec(said);
  return match ? `${match[1]} ${match[2]}` : said;
}

export function messageHistoryItemFromWire(
  wire: Partial<WireMessageHistoryItem>,
): MessageHistoryItem {
  const subject: Partial<WireMessageHistorySubject> = wire.subject ?? {};
  const lastAtUtc = text(wire.lastAtUtc) ?? '';
  return {
    conversationId: text(wire.conversationId) ?? '',
    subject: {
      kind: subjectKind(subject.kind),
      id: text(subject.id) ?? '',
      label: text(subject.label) ?? '',
      guestName: text(subject.guestName) ?? '',
      localDate: text(subject.localDate),
      localTime: wallClock(subject.localTime),
      partySize: finite(subject.partySize),
      itemCount: finite(subject.itemCount),
      totalAmd: finite(subject.totalAmd),
      outcome: conversationOutcome(subject.outcome),
    },
    messageCount: count(wire.messageCount),
    firstAtUtc: text(wire.firstAtUtc) ?? lastAtUtc,
    lastAtUtc,
    lastLocal: localStamp(wire.lastLocal),
    staffNames: (wire.staffNames ?? []).flatMap((name) => {
      const said = text(name);
      return said === null ? [] : [said];
    }),
    unanswered: wire.unanswered === true,
    open: wire.open === true,
  };
}

/**
 * The page. A row with no subject id cannot open its thread and is left out;
 * `from`/`to` are the dates the server read (its defaults filled in), else
 * what was asked.
 */
export function messageHistoryPageFromWire(
  wire: Partial<WireMessageHistoryPage> | null | undefined,
  asked: Pick<MessageHistoryQuery, 'from' | 'to'>,
): MessageHistoryPage {
  return {
    items: (wire?.items ?? [])
      .map(messageHistoryItemFromWire)
      .filter((item) => item.subject.id !== '' && item.conversationId !== ''),
    nextCursor: text(wire?.nextCursor),
    from: text(wire?.from) ?? asked.from,
    to: text(wire?.to) ?? asked.to,
  };
}

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

/**
 * The query string, every value a string: the dates (so the range is the one
 * on screen, not the server's default; a blank one is left out for the server
 * to default), the kind and the page size always, the search only when there
 * is one, `unansweredOnly` only when on, the cursor only after the first page.
 */
export function messageHistoryParams(query: MessageHistoryQuery): WireMessageHistoryParams {
  const q = historySearchText(query.q);
  const from = query.from.trim();
  const to = query.to.trim();
  return {
    ...(from !== '' ? { from } : {}),
    ...(to !== '' ? { to } : {}),
    kind: query.kind,
    ...(q !== '' ? { q } : {}),
    ...(query.unansweredOnly ? { unansweredOnly: 'true' } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: String(query.limit ?? MESSAGE_HISTORY_PAGE_SIZE),
  };
}
