import type { FieldViolation } from '../errors';
import type { ConversationSubjectKind, ConversationSubjectRef } from './messages';

/**
 * Message history in the venue console (2026-10-24, the History board): every
 * guest thread of a branch from the last twelve months, filtered and
 * searchable, read only. Nobody answers from here — replies go from the
 * tablet — and reading here never marks anything read, so the tablet's unread
 * counts stay as they are.
 *
 * `GET /api/branches/{branchId}/conversations/history`, manager or above at
 * the branch (a branch manager their own only, as on Reviews; waiters and the
 * kitchen 403; a platform admin may read). The thread on the right is the
 * floor's own `GET /api/reservations/{id}/conversation` or
 * `/api/takeaway-orders/{id}/conversation`, read without polling and without
 * the read mark.
 *
 * Hand-written to the 2026-10-24 build spec while the backend is built beside
 * it; `http/messageHistoryMapping.ts` alone reads the wire, so the regenerated
 * schema changes that file and nothing here.
 */

// ---------------------------------------------------------------------------
// The product's fixed numbers
// ---------------------------------------------------------------------------

/** Nothing older is kept: a daily sweep deletes threads whose last message is older. */
export const MESSAGE_HISTORY_KEPT_DAYS = 365;
/** At most this many days in one range, both ends counted. */
export const MESSAGE_HISTORY_MAX_RANGE_DAYS = 366;
/** The default range: today and the six days before it. */
export const MESSAGE_HISTORY_DEFAULT_DAYS = 7;
/** The search box: at most this many characters. */
export const MESSAGE_HISTORY_QUERY_MAX = 60;
/** A page, when the caller does not say… */
export const MESSAGE_HISTORY_PAGE_SIZE = 50;
/** …and at most. */
export const MESSAGE_HISTORY_PAGE_MAX = 100;

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------

/** The kind pills: everything, bookings only, takeaway orders only. */
export type MessageHistoryKind = 'all' | ConversationSubjectKind;

export const MESSAGE_HISTORY_KINDS: readonly MessageHistoryKind[] = [
  'all',
  'reservation',
  'takeaway',
];

/**
 * What the list is filtered by. The dates are the branch's calendar
 * (`yyyy-MM-dd`), both ends included, and match the day of the thread's
 * **last** message on the branch's clock.
 */
export interface MessageHistoryFilters {
  readonly from: string;
  readonly to: string;
  readonly kind: MessageHistoryKind;
  /**
   * The guest's name (contains), the table's label (exact) or the takeaway
   * code (with or without `T-`), case-insensitive. Empty: no search.
   */
  readonly q: string;
  /** Only threads whose last typed guest text has no venue message after it. */
  readonly unansweredOnly: boolean;
}

/** One page's request: the filters, the cursor the last page answered, and the page size. */
export interface MessageHistoryQuery extends MessageHistoryFilters {
  /** The previous page's `nextCursor`; absent for the first page. Opaque. */
  readonly cursor?: string | null | undefined;
  /** 1–{@link MESSAGE_HISTORY_PAGE_MAX}; {@link MESSAGE_HISTORY_PAGE_SIZE} when absent. */
  readonly limit?: number | undefined;
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/**
 * How the subject ended, from its status:
 *
 * - a booking: `came` (seated or completed), `noShow`, `cancelled`,
 *   `declined`, or `upcoming` (pending or confirmed);
 * - a takeaway order: `collected`, `noShow`, `declined`, `cancelled`, or
 *   `inProgress` (sent, accepted or ready).
 *
 * `unknown` for a word a newer server adds, and when the server says nothing.
 */
export type ConversationOutcome =
  | 'came'
  | 'noShow'
  | 'cancelled'
  | 'declined'
  | 'upcoming'
  | 'collected'
  | 'inProgress'
  | 'unknown';

/** The subject as a history row shows it. */
export interface MessageHistorySubject extends ConversationSubjectRef {
  /** The table's label ("6") for a booking, the code ("T-485") for a takeaway order. */
  readonly label: string;
  /** "Անի Մ." — the name as the booking or the order has it. */
  readonly guestName: string;
  /** A booking's day; an order's day. The branch's calendar. */
  readonly localDate: string | null;
  /** "19:30": a booking's start, an order's ready (else requested) time. */
  readonly localTime: string | null;
  /** A booking's party; `null` on an order. */
  readonly partySize: number | null;
  /** An order's item count; `null` on a booking. */
  readonly itemCount: number | null;
  /** An order's total in dram; `null` on a booking. */
  readonly totalAmd: number | null;
  readonly outcome: ConversationOutcome;
}

/** One row of the history. */
export interface MessageHistoryItem {
  readonly conversationId: string;
  readonly subject: MessageHistorySubject;
  /** Typed and structured messages; system lines are not counted. */
  readonly messageCount: number;
  readonly firstAtUtc: string;
  readonly lastAtUtc: string;
  /** "2026-10-24 18:31": the last message on the branch's calendar and clock. */
  readonly lastLocal: string;
  /** Who at the venue wrote, each once, in the order they first did. */
  readonly staffNames: readonly string[];
  /** The last typed guest text has no venue message after it. */
  readonly unanswered: boolean;
  /** The thread still takes messages (from the tablet). */
  readonly open: boolean;
}

/** `GET …/conversations/history`: newest last message first. */
export interface MessageHistoryPage {
  readonly items: readonly MessageHistoryItem[];
  /** The next (older) page's cursor; `null` on the last page. */
  readonly nextCursor: string | null;
  /** The range the server used: the defaults when none was sent. */
  readonly from: string;
  readonly to: string;
}

// ---------------------------------------------------------------------------
// The rules, as the screen and the mock read them
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** `yyyy-MM-dd` as midnight UTC, or `null` for anything that is not a real day. */
function dayMs(date: string): number | null {
  const match = LOCAL_DATE_RE.exec(date);
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  // 2026-02-30 is no day: Date.UTC would quietly roll it into March.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return ms;
}

/** Whether a string is a real calendar day as `yyyy-MM-dd`. */
export function isLocalDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && dayMs(value) !== null;
}

/** A calendar day `days` after (or before) another. */
export function addLocalDays(date: string, days: number): string {
  const ms = dayMs(date);
  if (ms === null) return date;
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (`to` − `from`); `null` when either is not a day. */
export function localDaysBetween(from: string, to: string): number | null {
  const a = dayMs(from);
  const b = dayMs(to);
  return a === null || b === null ? null : Math.round((b - a) / DAY_MS);
}

/** The oldest day the history keeps, given the branch's today. */
export function oldestHistoryDate(today: string): string {
  return addLocalDays(today, -MESSAGE_HISTORY_KEPT_DAYS);
}

/** The server's defaults: today−6 to today, every kind, no search. */
export function defaultMessageHistoryFilters(today: string): MessageHistoryFilters {
  return {
    from: addLocalDays(today, -(MESSAGE_HISTORY_DEFAULT_DAYS - 1)),
    to: today,
    kind: 'all',
    q: '',
    unansweredOnly: false,
  };
}

/** The search as the server reads it: trimmed. */
export function historySearchText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Every bad field in the server's names (`from`, `to`, `kind`, `q`, `limit`),
 * so the screen marks the same fields before asking as the server's 422
 * would. `today` is the branch's. Empty when the query may be sent.
 *
 * - `from` must be a day, on or after today−365 and on or before `to`;
 * - `to` must be a day, and the range at most 366 days, both ends counted;
 * - `q` at most 60 characters after trim; `limit` 1–100.
 */
export function messageHistoryViolations(
  query: MessageHistoryFilters & { readonly limit?: number | undefined },
  today: string,
): readonly FieldViolation[] {
  const violations: FieldViolation[] = [];
  const fromOk = isLocalDate(query.from);
  const toOk = isLocalDate(query.to);
  if (!fromOk) {
    violations.push({
      field: 'from',
      message: 'from must be a date (yyyy-MM-dd).',
      bound: 'required',
    });
  }
  if (!toOk) {
    violations.push({ field: 'to', message: 'to must be a date (yyyy-MM-dd).', bound: 'required' });
  }
  if (fromOk && (localDaysBetween(oldestHistoryDate(today), query.from) ?? 0) < 0) {
    violations.push({
      field: 'from',
      message: `History is kept for ${MESSAGE_HISTORY_KEPT_DAYS} days.`,
      bound: 'min',
    });
  }
  if (fromOk && toOk) {
    const days = localDaysBetween(query.from, query.to)!;
    if (days < 0) {
      violations.push({ field: 'from', message: 'from must be on or before to.', bound: 'range' });
    } else if (days + 1 > MESSAGE_HISTORY_MAX_RANGE_DAYS) {
      violations.push({
        field: 'to',
        message: `At most ${MESSAGE_HISTORY_MAX_RANGE_DAYS} days at once.`,
        bound: 'max',
        max: MESSAGE_HISTORY_MAX_RANGE_DAYS,
      });
    }
  }
  if (!MESSAGE_HISTORY_KINDS.includes(query.kind)) {
    violations.push({ field: 'kind', message: 'kind must be all, reservation or takeaway.' });
  }
  if (historySearchText(query.q).length > MESSAGE_HISTORY_QUERY_MAX) {
    violations.push({
      field: 'q',
      message: `At most ${MESSAGE_HISTORY_QUERY_MAX} characters.`,
      bound: 'max',
      max: MESSAGE_HISTORY_QUERY_MAX,
    });
  }
  if (
    query.limit !== undefined &&
    (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MESSAGE_HISTORY_PAGE_MAX)
  ) {
    violations.push({
      field: 'limit',
      message: `limit must be between 1 and ${MESSAGE_HISTORY_PAGE_MAX}.`,
      bound: 'range',
      min: 1,
      max: MESSAGE_HISTORY_PAGE_MAX,
    });
  }
  return violations;
}

/** "t-482", "T482", "482" all name the code "T-482". */
function codeDigits(value: string): string {
  return value.replace(/^t-?/iu, '');
}

/**
 * The server's search, for the mock: the guest's name contains it, the
 * table's label is it, or the takeaway code is it (with or without `T-`),
 * case-insensitive. An empty search matches everything.
 */
export function matchesHistorySearch(
  subject: Pick<MessageHistorySubject, 'kind' | 'label' | 'guestName'>,
  q: string | null | undefined,
): boolean {
  const needle = historySearchText(q).toLocaleLowerCase();
  if (needle === '') return true;
  if (subject.guestName.toLocaleLowerCase().includes(needle)) return true;
  const label = subject.label.toLocaleLowerCase();
  if (subject.kind === 'reservation') return label === needle;
  return codeDigits(label) === codeDigits(needle);
}

/** The order the server answers in: newest last message first, the id breaking a tie. */
export function compareHistoryItems(a: MessageHistoryItem, b: MessageHistoryItem): number {
  const byTime = Date.parse(b.lastAtUtc) - Date.parse(a.lastAtUtc);
  if (byTime !== 0) return byTime;
  return a.conversationId < b.conversationId ? 1 : a.conversationId > b.conversationId ? -1 : 0;
}
