import type { FieldViolation } from '../errors';
import type { StaffRole } from './console';
import { addLocalDays, isLocalDate, localDaysBetween } from './messageHistory';

/**
 * Activity history and staff results (2026-10-24, the "SHURJ Պատմություն և
 * վիճակագրություն" boards Main, Team, Person and Check): who did what at a
 * branch, from which device, and what each person's work adds up to.
 *
 * - `GET /api/branches/{branchId}/activity` — the History feed, newest first,
 *   a page at a time by an opaque cursor; `…/activity.csv` the same filters
 *   as a file.
 * - `GET /api/branches/{branchId}/activity/subjects/{subjectType}/{subjectId}`
 *   — one bill's or one booking's whole timeline, with the bill's items and
 *   who added and who voided each (the Check board).
 * - `GET /api/branches/{branchId}/staff-performance?from&to` — the Results
 *   table (Team board), with totals; `…/staff-performance.csv` as a file.
 * - `GET /api/branches/{branchId}/staff/{staffMemberId}/performance?from&to`
 *   — one person's page (Person board): the figures, sales by day and the
 *   recent lists, each paged.
 *
 * Manager or above at the branch (a branch manager their own; the owner and
 * the general manager every branch). A waiter reads only their own numbers,
 * from their own session (`GET /api/staff/me/performance`, the phone's
 * screen, not built here yet).
 *
 * The rules the product decided: sales, guests and tips belong to the table's
 * waiter, and a transfer moves the table from that moment on — what was done
 * before stays with the earlier person. A call's response time runs from the
 * call to the claim ("I'm on it"), a message's reply time from the guest's
 * text to the venue's first message; both are reported as medians. The log is
 * kept twelve months, rows about money three years.
 *
 * `http/activityMapping.ts` alone reads the wire, which is hand-written to the
 * build spec until the schema is regenerated against the backend.
 */

// ---------------------------------------------------------------------------
// The product's fixed numbers
// ---------------------------------------------------------------------------

/** The log is kept a year (a daily purge deletes older rows)… */
export const ACTIVITY_KEPT_DAYS = 365;
/** …and rows about money three years. */
export const ACTIVITY_MONEY_KEPT_DAYS = 3 * 365;
/** The search box: at most this many characters. */
export const ACTIVITY_QUERY_MAX = 60;
/** A page of the feed, when the caller does not say… */
export const ACTIVITY_PAGE_SIZE = 50;
/** …and at most. */
export const ACTIVITY_PAGE_MAX = 100;
/** A page of one of a person's recent lists. */
export const STAFF_RECENT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------

/** What an entry is about, as the kind pills group it. */
export type ActivityCategory =
  | 'booking'
  | 'table'
  | 'order'
  | 'payment'
  | 'takeaway'
  | 'message'
  | 'settings'
  | 'staff'
  | 'device';

export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  'booking',
  'table',
  'order',
  'payment',
  'takeaway',
  'message',
  'settings',
  'staff',
  'device',
];

/** Who acted: a person on the staff, a guest, SHURJ itself, or the platform's admin. */
export type ActivityActorKind = 'staff' | 'diner' | 'system' | 'platformAdmin';

/**
 * What an entry is about. `tab` (a bill) and `reservation` open a timeline
 * (the Check board); the others are shown in place.
 */
export type ActivitySubjectType =
  'tab' | 'reservation' | 'takeaway' | 'menuItem' | 'staffMember' | 'device' | 'branch' | 'other';

/** The subjects with a timeline page. */
export const ACTIVITY_TIMELINE_SUBJECTS: readonly ActivitySubjectType[] = [
  'tab',
  'reservation',
  'takeaway',
];

/** One value of an entry's parameters, its "before" or its "after". */
export type ActivityValue = string | number | boolean | null;

/** Structured values a screen words for itself: never prose from the server. */
export type ActivityParams = Readonly<Record<string, ActivityValue>>;

export interface ActivityActor {
  readonly kind: ActivityActorKind;
  /** The staff member, for `staff`; `null` otherwise. */
  readonly staffMemberId: string | null;
  /** The name as it was when they acted (a snapshot). Empty for `system`. */
  readonly name: string;
}

/** The device that acted, as it was named then. */
export interface ActivityDevice {
  readonly id: string | null;
  /**
   * "Hall tablet", "Aram's phone", "Console" — a snapshot. Empty when no
   * device acted (SHURJ itself, a guest's phone).
   */
  readonly label: string;
  /** The console: the server's fallback for a session with no staff device. */
  readonly isConsole: boolean;
}

export interface ActivitySubject {
  readonly type: ActivitySubjectType;
  readonly id: string | null;
}

/**
 * One thing somebody did. `action` is a stable code (`booking.approved`,
 * `order.lineVoided`) the screen words with `params`; an action it does not
 * know is still shown, by its category.
 */
export interface ActivityEntry {
  readonly id: string;
  readonly occurredAtUtc: string;
  readonly actor: ActivityActor;
  readonly device: ActivityDevice;
  readonly category: ActivityCategory;
  readonly action: string;
  readonly subject: ActivitySubject;
  /** The table's label ("4"), when the entry is about a table, a bill or a booking at one. */
  readonly tableLabel: string | null;
  readonly guestName: string | null;
  /** The money the entry is about, in whole dram. */
  readonly amountAmd: number | null;
  /** About money: kept three years, tinted in the feed. */
  readonly isMoney: boolean;
  /** What changed, when something did: "18 400" → "16 560". */
  readonly before: ActivityParams | null;
  readonly after: ActivityParams | null;
  /** Why, as the person typed or chose it. */
  readonly reason: string | null;
  readonly params: ActivityParams;
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/** The kind pills: everything, or one category. */
export type ActivityCategoryFilter = 'all' | ActivityCategory;

/**
 * Whose actions: everyone, one staff member, or SHURJ itself (the automatic
 * declines and reminders).
 */
export type ActivityWho =
  | { readonly kind: 'everyone' }
  | { readonly kind: 'staff'; readonly staffMemberId: string }
  | { readonly kind: 'system' };

export interface ActivityFilters {
  /** One day of the branch's calendar, `yyyy-MM-dd`. */
  readonly date: string;
  readonly who: ActivityWho;
  readonly category: ActivityCategoryFilter;
  /** A table's label, a guest's name, a takeaway code ("T-482") or a dish's name. Empty: none. */
  readonly q: string;
}

export interface ActivityQuery extends ActivityFilters {
  /** The previous page's `nextCursor`; absent for the first page. Opaque. */
  readonly cursor?: string | null | undefined;
  readonly limit?: number | undefined;
}

export interface ActivityPage {
  readonly items: readonly ActivityEntry[];
  /** The next (older) page; `null` on the last. */
  readonly nextCursor: string | null;
}

/** The search as the server reads it: trimmed. */
export function activitySearchText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** The oldest day the feed keeps for anything that is not money. */
export function oldestActivityDate(today: string): string {
  return addLocalDays(today, -ACTIVITY_KEPT_DAYS);
}

/** Today, everyone, every kind, no search. */
export function defaultActivityFilters(today: string): ActivityFilters {
  return { date: today, who: { kind: 'everyone' }, category: 'all', q: '' };
}

/**
 * Every bad filter, under the field names the route reads, so the screen says
 * what the server would refuse before asking: `date` not a day (`required`),
 * after today (`max`) or older than the money rows are kept (`min`); a search
 * over 60 characters (`q`, `max`); a category the route does not know
 * (`category`, `range`).
 */
export function activityViolations(
  filters: ActivityFilters,
  today: string,
): readonly FieldViolation[] {
  const violations: FieldViolation[] = [];
  if (!isLocalDate(filters.date)) {
    violations.push({ field: 'date', message: 'date is a date, yyyy-MM-dd.', bound: 'required' });
  } else if ((localDaysBetween(today, filters.date) ?? 0) > 0) {
    violations.push({ field: 'date', message: 'date is today or earlier.', bound: 'max' });
  } else if ((localDaysBetween(filters.date, today) ?? 0) > ACTIVITY_MONEY_KEPT_DAYS) {
    violations.push({
      field: 'date',
      message: `The history goes back ${ACTIVITY_MONEY_KEPT_DAYS} days.`,
      bound: 'min',
    });
  }
  if (filters.category !== 'all' && !ACTIVITY_CATEGORIES.includes(filters.category)) {
    violations.push({ field: 'category', message: 'Unknown category.', bound: 'range' });
  }
  if (activitySearchText(filters.q).length > ACTIVITY_QUERY_MAX) {
    violations.push({
      field: 'q',
      message: `A search is at most ${ACTIVITY_QUERY_MAX} characters.`,
      bound: 'max',
      max: ACTIVITY_QUERY_MAX,
    });
  }
  return violations;
}

/** "t-482", "T482", "482" all name the code "T-482". */
function codeDigits(value: string): string {
  return value.replace(/^t-?/iu, '');
}

/**
 * The server's search, for the mock: the table's label is it, the takeaway
 * code is it (with or without `T-`), or the guest's or a dish's name contains
 * it, case-insensitive. Empty matches everything.
 */
export function matchesActivitySearch(entry: ActivityEntry, q: string | null | undefined): boolean {
  const needle = activitySearchText(q).toLocaleLowerCase();
  if (needle === '') return true;
  if (entry.tableLabel !== null && entry.tableLabel.toLocaleLowerCase() === needle) return true;
  const code = entry.params['code'];
  if (typeof code === 'string' && codeDigits(code.toLocaleLowerCase()) === codeDigits(needle)) {
    return true;
  }
  if (entry.guestName?.toLocaleLowerCase().includes(needle)) return true;
  const item = entry.params['itemName'];
  return typeof item === 'string' && item.toLocaleLowerCase().includes(needle);
}

/** Newest first, the id breaking a tie: the order the server answers in. */
export function compareActivityEntries(a: ActivityEntry, b: ActivityEntry): number {
  const byTime = Date.parse(b.occurredAtUtc) - Date.parse(a.occurredAtUtc);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Whether an entry opens a timeline page (a bill, a booking, a takeaway order). */
export function hasTimeline(subject: ActivitySubject): subject is ActivitySubject & {
  readonly id: string;
} {
  return subject.id !== null && ACTIVITY_TIMELINE_SUBJECTS.includes(subject.type);
}

// ---------------------------------------------------------------------------
// One bill's or one booking's timeline (the Check board)
// ---------------------------------------------------------------------------

/** A person, as a timeline or a bill line names them. */
export interface ActivityPerson {
  readonly staffMemberId: string | null;
  readonly name: string;
}

/** One line of the bill, with who took it and who voided it. */
export interface ActivityBillItem {
  readonly lineId: string;
  readonly name: string;
  readonly quantity: number;
  /** The line's total, in whole dram, as it stood before any void. */
  readonly amountAmd: number;
  /** Who added it; `null` when the guest ordered from their phone. */
  readonly addedBy: ActivityPerson | null;
  readonly voided: boolean;
  readonly voidedBy: ActivityPerson | null;
  readonly voidReason: string | null;
  /** On the house. */
  readonly comped: boolean;
}

/** The bill's money, when the subject is one. */
export interface ActivityBillTotals {
  /** The live lines. */
  readonly itemsAmd: number;
  readonly discountAmd: number;
  readonly serviceChargeAmd: number;
  readonly paidAmd: number;
  readonly tipAmd: number;
  /** How it was paid, when it was: `mixed` for more than one way. */
  readonly paidBy: 'cash' | 'card' | 'mixed' | 'unpaid' | null;
}

export interface ActivityTimeline {
  readonly subject: ActivitySubject & { readonly id: string };
  readonly tableLabel: string | null;
  readonly guestName: string | null;
  /** A takeaway order's code ("T-482"). */
  readonly code: string | null;
  readonly partySize: number | null;
  /** When the bill opened (the table was seated) or the booking was made. */
  readonly startedAtUtc: string | null;
  /** When the bill closed; `null` while it is open. */
  readonly endedAtUtc: string | null;
  /** The table's waiter now (after any transfer). */
  readonly server: ActivityPerson | null;
  readonly totals: ActivityBillTotals | null;
  /** Oldest first. */
  readonly entries: readonly ActivityEntry[];
  /** The bill's lines, in the order they were added. Empty for a booking. */
  readonly items: readonly ActivityBillItem[];
}

// ---------------------------------------------------------------------------
// Staff results (the Team and Person boards)
// ---------------------------------------------------------------------------

/** The period pills: today, the last seven days, the last thirty. */
export type PerformancePeriod = 'today' | 'week' | 'month';

export const PERFORMANCE_PERIODS: readonly PerformancePeriod[] = ['today', 'week', 'month'];

/** A period's days on the branch's calendar, both ends included. */
export function performanceRange(
  period: PerformancePeriod,
  today: string,
): { readonly from: string; readonly to: string } {
  const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
  return { from: addLocalDays(today, -(days - 1)), to: today };
}

export interface PerformanceRange {
  readonly from: string;
  readonly to: string;
}

/**
 * One person's figures, or the branch's totals. Money in whole dram; times in
 * seconds. A median with nothing to measure is `null`, never 0.
 */
export interface PerformanceFigures {
  /** Tables (bills) they served. */
  readonly tables: number;
  readonly guests: number;
  readonly salesAmd: number;
  /** Sales over tables; `null` with no table. */
  readonly averageCheckAmd: number | null;
  readonly tipsAmd: number;
  /** From the call to "I'm on it", the median. */
  readonly callMedianSeconds: number | null;
  readonly callsClaimed: number;
  /** From the guest's text to the venue's first message, the median. */
  readonly replyMedianSeconds: number | null;
  readonly messagesAnswered: number;
  /** Bookings and takeaway orders they approved. */
  readonly approvals: number;
  readonly cashAmd: number;
  /** Bills they took cash for. */
  readonly cashBills: number;
  /** Discounts and comps they gave. */
  readonly discountsAndComps: number;
}

export interface StaffPerformanceRow extends PerformanceFigures {
  readonly staffMemberId: string;
  readonly name: string;
  readonly role: StaffRole;
}

export interface StaffPerformance extends PerformanceRange {
  readonly rows: readonly StaffPerformanceRow[];
  readonly totals: PerformanceFigures;
}

/** The person page's lists. */
export type StaffRecentList = 'orders' | 'messages' | 'bookings' | 'cash' | 'calls';

export const STAFF_RECENT_LISTS: readonly StaffRecentList[] = [
  'orders',
  'messages',
  'bookings',
  'cash',
  'calls',
];

/** An entry on one of the lists, with how fast they were when it is a response. */
export interface StaffRecentItem extends ActivityEntry {
  /** A reply's, a decision's or a claim's seconds; `null` otherwise. */
  readonly responseSeconds: number | null;
}

export interface StaffRecentPage {
  readonly items: readonly StaffRecentItem[];
  /** How many there are in the period, all pages counted. */
  readonly total: number;
  readonly nextCursor: string | null;
}

export interface DailySales {
  /** `yyyy-MM-dd`, the branch's calendar. */
  readonly date: string;
  readonly salesAmd: number;
}

export interface StaffMemberPerformance extends PerformanceRange {
  readonly staffMemberId: string;
  readonly name: string;
  readonly role: StaffRole;
  readonly figures: PerformanceFigures;
  /** Every day of the range, oldest first, a day with no sales as 0. */
  readonly daily: readonly DailySales[];
  readonly recent: Readonly<Record<StaffRecentList, StaffRecentPage>>;
}

/** One more page of one list. */
export interface StaffRecentQuery extends PerformanceRange {
  readonly list: StaffRecentList;
  readonly cursor: string;
}

/** The median of some seconds, `null` for none: what the server reports. */
export function medianSeconds(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

// ---------------------------------------------------------------------------
// The floor: transfer a table, claim a call
// ---------------------------------------------------------------------------

/**
 * `POST /api/tabs/{tabId}/transfer`: the table's bill, its messages and its
 * calls go to another waiter from now on. The current waiter or a manager and
 * above; the target is active staff of the branch who serves (a waiter or
 * above, not the kitchen).
 */
export interface TransferTabCommand {
  readonly tabId: string;
  readonly toStaffMemberId: string;
  readonly clientCommandId: string;
}

export interface TabTransferResult {
  readonly tabId: string;
  readonly server: ActivityPerson;
  /** Whose it was; `null` when nobody's yet. */
  readonly previousServer: ActivityPerson | null;
  readonly transferredAtUtc: string;
}

/** Roles who may take a table: a waiter or above, never the kitchen. */
export const SERVING_ROLES: readonly StaffRole[] = ['waiter', 'manager', 'generalManager', 'owner'];

/**
 * `POST /api/branches/{branchId}/calls/{callId}/claim`: "I'm on it". The
 * first claim wins; claiming again (anybody) answers the call as it stands.
 */
export interface ClaimServiceRequestCommand {
  readonly branchId: string;
  readonly requestId: string;
}
