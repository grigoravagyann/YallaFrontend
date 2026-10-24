import {
  MESSAGE_HISTORY_PAGE_SIZE,
  historySearchText,
  type ConversationOutcome,
  type MessageHistoryItem,
  type MessageHistoryPage,
  type MessageHistoryQuery,
} from '../contracts/messageHistory';
import { subjectKind } from './messagesMapping';

/**
 * The message-history wire (`docs/messages.md` §history, 2026-10-24):
 * `GET /api/branches/{branchId}/conversations/history`.
 *
 * ## Hand-written, on purpose, for now
 *
 * The backend is built in parallel to the same spec, so `generated/schema.ts`
 * does not have this shape yet. The `Wire…` interfaces below are the spec's
 * JSON, every field optional and read tolerantly — an enum as its word
 * ("no-show") **or** its number, a missing list as empty. When the schema is
 * regenerated, each becomes `Schemas['Yalla.Application.Messages.…']` here
 * and nothing outside this file changes; any drift shows up as a compile
 * error in the mapper.
 */

// ---------------------------------------------------------------------------
// The wire (hand-written to the build spec)
// ---------------------------------------------------------------------------

type WireEnum = string | number | null | undefined;

/** `subject` on a history row. */
export interface WireMessageHistorySubject {
  /** "reservation" / "takeaway" (or 1 / 2). */
  readonly kind?: WireEnum;
  readonly id?: string | null;
  /** The table's label for a booking, the code ("T-485") for an order. */
  readonly label?: string | null;
  readonly guestName?: string | null;
  readonly localDate?: string | null;
  readonly localTime?: string | null;
  readonly partySize?: number | null;
  readonly itemCount?: number | null;
  readonly totalAmd?: number | null;
  /**
   * A booking: `came`, `no-show`, `cancelled`, `declined`, `upcoming`. An
   * order: `collected`, `no-show`, `declined`, `cancelled`, `in-progress`.
   */
  readonly outcome?: WireEnum;
}

/** One row. */
export interface WireMessageHistoryItem {
  readonly conversationId?: string | null;
  readonly subject?: WireMessageHistorySubject | null;
  /** Without system lines. */
  readonly messageCount?: number | null;
  readonly firstAtUtc?: string | null;
  readonly lastAtUtc?: string | null;
  /** "yyyy-MM-dd HH:mm" on the branch's calendar and clock. */
  readonly lastLocal?: string | null;
  /** Distinct, in the order they first wrote. */
  readonly staffNames?: readonly (string | null)[] | null;
  readonly unanswered?: boolean | null;
  readonly open?: boolean | null;
}

/** The page: `{ items, nextCursor?, from, to }`. */
export interface WireMessageHistoryPage {
  readonly items?: readonly WireMessageHistoryItem[] | null;
  readonly nextCursor?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
}

/** The query string the route reads. */
export interface WireMessageHistoryParams {
  readonly [key: string]: string | number | boolean | undefined;
  readonly from: string;
  readonly to: string;
  readonly kind: string;
  readonly q?: string | undefined;
  readonly unansweredOnly?: boolean | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

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

/** "19:30:00" as the server may write a wall clock, said as "19:30". */
function wallClock(value: unknown): string | null {
  const said = text(value);
  if (said === null) return null;
  return /^\d{2}:\d{2}/u.test(said) ? said.slice(0, 5) : said;
}

/** "2026-10-24 18:31", "2026-10-24T18:31:00": the day and the minute, as "2026-10-24 18:31". */
function localStamp(value: unknown): string {
  const said = text(value);
  if (said === null) return '';
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/u.exec(said);
  return match ? `${match[1]} ${match[2]}` : said;
}

const OUTCOMES: Readonly<Record<string, ConversationOutcome>> = {
  came: 'came',
  noshow: 'noShow',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  declined: 'declined',
  upcoming: 'upcoming',
  collected: 'collected',
  inprogress: 'inProgress',
};

/** "no-show", "noShow", "NoShow", "no_show" all read as `noShow`; anything else is `unknown`. */
export function conversationOutcome(value: unknown): ConversationOutcome {
  if (typeof value !== 'string') return 'unknown';
  return OUTCOMES[value.replace(/[-_\s]/gu, '').toLowerCase()] ?? 'unknown';
}

export function messageHistoryItemFromWire(wire: WireMessageHistoryItem): MessageHistoryItem {
  const subject = wire.subject ?? {};
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
 * `from`/`to` fall back to what was asked.
 */
export function messageHistoryPageFromWire(
  wire: WireMessageHistoryPage | null | undefined,
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
 * The query string: the dates and the kind always (so the range is the one on
 * screen, not the server's default), the search only when there is one,
 * `unansweredOnly` only when on, the cursor only after the first page.
 */
export function messageHistoryParams(query: MessageHistoryQuery): WireMessageHistoryParams {
  const q = historySearchText(query.q);
  return {
    from: query.from,
    to: query.to,
    kind: query.kind,
    ...(q !== '' ? { q } : {}),
    ...(query.unansweredOnly ? { unansweredOnly: true } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: query.limit ?? MESSAGE_HISTORY_PAGE_SIZE,
  };
}
