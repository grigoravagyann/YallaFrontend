import { ApiError, type FieldViolation } from '../errors';
import type { StaffRole } from './console';
import { addLocalDays, isLocalDate, localDaysBetween } from './messageHistory';
import { ProblemCodes } from '../generated/problemCodes';

/**
 * Activity history and staff results (2026-10-24, the "Time to Eat Պատմություն և
 * վիճակագրություն" boards Main, Team, Person and Check): who did what at a
 * branch, from which device, and what each person's work adds up to. Yalla
 * `docs/activity.md` is the backend's account of the same.
 *
 * - `GET /api/branches/{branchId}/activity` (`listBranchActivity`) — the
 *   History feed, newest first, a page at a time by an opaque cursor;
 *   `…/activity.csv` the same filters as a file.
 * - `GET /api/branches/{branchId}/activity/subjects/{subjectType}/{subjectId}`
 *   (`getActivityTimeline`) — one bill's, booking's or takeaway order's whole
 *   story, oldest first, with the bill's lines and who added and voided each
 *   (the Check board).
 * - `GET /api/branches/{branchId}/staff-performance?from&to` — the Results
 *   table (Team board), with the branch's totals; `…/staff-performance.csv`.
 * - `GET /api/branches/{branchId}/staff/{staffMemberId}/performance?from&to&list&cursor`
 *   — one person's page (Person board): their figures, sales by day and one
 *   recent list, a page at a time.
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
 */

// ---------------------------------------------------------------------------
// The product's fixed numbers
// ---------------------------------------------------------------------------

/** The log is kept a year (a daily purge deletes older rows)… */
export const ACTIVITY_KEPT_DAYS = 365;
/** …and rows about money three years (the server's 1,095 days). */
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

/** What an entry is about, as the kind pills group it — the wire's words. */
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

/**
 * Who acted — the wire's words (`actorKind`): a person on the staff, the
 * guest, Time to Eat itself (a deadline passed), or the platform's support.
 */
export type ActivityActorKind = 'staff' | 'guest' | 'system' | 'platform';

/**
 * Every action code the server writes (Yalla `ActivityActions`,
 * `docs/activity.md` §3). Stable: the server adds codes and never rewords
 * one, so a code this build does not know is still shown, by its category.
 */
export const ACTIVITY_ACTIONS = [
  'booking.created',
  'booking.moved',
  'booking.cancelled',
  'booking.approved',
  'booking.declined',
  'booking.auto-declined',
  'booking.seated',
  'booking.no-show',
  'booking.no-show-undone',
  'booking.released',
  'booking.hold-extended',
  'booking.guest-answered',
  'booking.guest-coming',
  'table.seated',
  'table.freed',
  'table.held',
  'table.hold-released',
  'table.out-of-service',
  'table.back-in-service',
  'table.tab-opened',
  'table.tab-admitted',
  'table.tab-turned-away',
  'table.transferred',
  'table.call-claimed',
  'table.bill-presented',
  'table.host-reassigned',
  'order.sent',
  'order.placed-by-guest',
  'order.in-kitchen',
  'order.ready',
  'order.served',
  'order.pre-order-sent',
  'order.line-voided',
  'order.voided',
  'payment.cash',
  'payment.discount',
  'payment.comp',
  'payment.adjustment-reversed',
  'payment.unpaid',
  'takeaway.placed',
  'takeaway.cancelled',
  'takeaway.accepted',
  'takeaway.declined',
  'takeaway.auto-declined',
  'takeaway.ready',
  'takeaway.collected',
  'takeaway.no-show',
  'message.sent',
  'message.asked-on-my-way',
  'settings.menu-price',
  'settings.menu-availability',
  'settings.hours',
  'settings.special-days',
  'settings.policy',
  'settings.takeaway',
  'settings.messages',
  'settings.pre-orders',
  'staff.created',
  'staff.updated',
  'staff.pin-set',
  'staff.sign-in-issued',
  'staff.pin-lockout-cleared',
  'device.enrolment-code-created',
  'device.enrolled',
  'device.revoked',
  'device.phone-paired',
  'device.phone-unpaired',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Whether a code is one this build words (anything else falls back to its category). */
export function isKnownActivityAction(action: string): action is ActivityAction {
  return (ACTIVITY_ACTIONS as readonly string[]).includes(action);
}

/**
 * What an entry is about (`subjectType`): `tab` (a bill), `reservation` and
 * `takeaway` open a timeline (the Check board); the others are shown in place.
 */
export type ActivitySubjectType =
  | 'tab'
  | 'reservation'
  | 'takeaway'
  | 'tableSession'
  | 'table'
  | 'order'
  | 'serviceRequest'
  | 'conversation'
  | 'menuItem'
  | 'staffMember'
  | 'branch'
  | 'device'
  | 'other';

/** The subjects with a timeline page. */
export const ACTIVITY_TIMELINE_SUBJECTS: readonly ActivitySubjectType[] = [
  'tab',
  'reservation',
  'takeaway',
];

/** One value of an entry's parameters, its "before" or its "after". */
export type ActivityValue = string | number | boolean | null;

/**
 * Structured values a screen words for itself — never prose from the server.
 * The summary's own keys as they come; a booking's `extra` object flattened
 * under `extra.` (`extra.answer`, `extra.decisionSeconds`).
 */
export type ActivityParams = Readonly<Record<string, ActivityValue>>;

export interface ActivityActor {
  readonly kind: ActivityActorKind;
  /** The staff member, for `staff`; `null` otherwise. */
  readonly staffMemberId: string | null;
  /** The name as it was when they acted (a snapshot); the guest's for `guest`. Empty for `system`. */
  readonly name: string;
}

/** Where an entry came from, as parts: the console, a tablet, or a phone. */
export type ActivityDeviceKind = 'console' | 'tablet' | 'phone';

/** The device that acted, as it was named then. */
export interface ActivityDevice {
  readonly id: string | null;
  /**
   * "Hall tablet", "Aram's phone", "Console" — a snapshot, and English for a
   * phone and the console: word those from {@link kind} and {@link ownerName}.
   * Empty when no device acted (Time to Eat itself, a guest).
   */
  readonly label: string;
  /** The console: a staff session with no enrolled device (`deviceLabel` `Console`). */
  readonly isConsole: boolean;
  /**
   * Where it came from, as the server keeps it. Null for a guest or the
   * system, and for a tablet or phone on an entry written before the server
   * kept it (read {@link label} then).
   */
  readonly kind?: ActivityDeviceKind | null | undefined;
  /** A phone's person then, by full name; null for anything but a phone. */
  readonly ownerName?: string | null | undefined;
}

export interface ActivitySubject {
  readonly type: ActivitySubjectType;
  readonly id: string | null;
  /** Its short code: a takeaway's `T-482`, a booking's code. */
  readonly code?: string | null | undefined;
}

/** One dish of an order, as the summary's `lines` name it. */
export interface ActivityLine {
  readonly name: string;
  readonly quantity: number;
}

/**
 * One thing somebody did. `action` is a stable code (`booking.approved`,
 * `order.line-voided`) the screen words with `params`; an action it does not
 * know is still shown, by its category.
 */
export interface ActivityEntry {
  readonly id: string;
  readonly occurredAtUtc: string;
  /** The same instant on the branch's clock, `yyyy-MM-dd HH:mm`. */
  readonly local: string;
  readonly actor: ActivityActor;
  readonly device: ActivityDevice;
  readonly category: ActivityCategory;
  readonly action: string;
  readonly subject: ActivitySubject;
  /** The sitting it belongs to: what puts it on a bill's timeline. */
  readonly tableSessionId: string | null;
  /** The table's label ("4"), when the entry is about a table, a bill or a booking at one. */
  readonly tableLabel: string | null;
  readonly guestName: string | null;
  /** The dishes it names, comma-joined, as the search matches them. */
  readonly itemNames: string | null;
  /** The money the entry is about, in whole dram. */
  readonly amountAmd: number | null;
  /** About money: kept three years, tinted in the feed. */
  readonly isMoney: boolean;
  /** What changed, when something did: `{ priceAmd: 600 }` → `{ priceAmd: 700 }`. */
  readonly before: ActivityParams | null;
  readonly after: ActivityParams | null;
  /** Why, as the person typed it. */
  readonly reason: string | null;
  readonly params: ActivityParams;
  /** An order's dishes (`summary.lines`); empty for anything else. */
  readonly lines: readonly ActivityLine[];
  /**
   * How long it took, when the action measures it: a call's claim from the
   * call, a reply from the guest's text, a booking's decision from its request.
   */
  readonly seconds: number | null;
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/** The kind pills: everything, or one category. */
export type ActivityCategoryFilter = 'all' | ActivityCategory;

/**
 * Whose actions: everyone, one staff member, or Time to Eat itself (the automatic
 * declines; `actorKind=system`).
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
  /** A table's label, a guest's name, a code ("T-482") or a dish's name. Empty: none. */
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
 * The server's search, for the mock: the table's label is it, the code is it
 * (a takeaway's with or without `T-`), or the guest's or a dish's name
 * contains it, case-insensitive. Empty matches everything.
 */
export function matchesActivitySearch(entry: ActivityEntry, q: string | null | undefined): boolean {
  const needle = activitySearchText(q).toLocaleLowerCase();
  if (needle === '') return true;
  if (entry.tableLabel !== null && entry.tableLabel.toLocaleLowerCase() === needle) return true;
  const code = entry.subject.code;
  if (code && codeDigits(code.toLocaleLowerCase()) === codeDigits(needle)) return true;
  if (entry.guestName?.toLocaleLowerCase().includes(needle)) return true;
  return entry.itemNames?.toLocaleLowerCase().includes(needle) ?? false;
}

/** Newest first, the id breaking a tie: the order the server answers in. */
export function compareActivityEntries(a: ActivityEntry, b: ActivityEntry): number {
  const byTime = Date.parse(b.occurredAtUtc) - Date.parse(a.occurredAtUtc);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Whether a subject opens a timeline page (a bill, a booking, a takeaway order). */
export function hasTimeline<
  S extends { readonly type: ActivitySubjectType; readonly id: string | null },
>(subject: S): subject is S & { readonly id: string } {
  return subject.id !== null && ACTIVITY_TIMELINE_SUBJECTS.includes(subject.type);
}

/**
 * The timeline an entry opens: its own subject when that has one, else the
 * bill it names — a call claimed (`service-request`) or a table freed
 * (`table-session`) carries its `tabId`. `null` when it opens none.
 */
export function timelineSubjectOf(
  entry: Pick<ActivityEntry, 'subject' | 'params'>,
): { readonly type: ActivitySubjectType; readonly id: string } | null {
  if (hasTimeline(entry.subject)) return { type: entry.subject.type, id: entry.subject.id };
  const tabId = entry.params['tabId'];
  if (
    (entry.subject.type === 'serviceRequest' || entry.subject.type === 'tableSession') &&
    typeof tabId === 'string' &&
    tabId !== ''
  ) {
    return { type: 'tab', id: tabId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// One bill's, booking's or takeaway order's timeline (the Check board)
// ---------------------------------------------------------------------------

/** A person, as a timeline or a bill line names them. */
export interface ActivityPerson {
  readonly staffMemberId: string | null;
  readonly name: string;
}

/** A waiter's turn at the table: the first from the seat, each transfer after. */
export interface ActivityServerTurn {
  readonly staffMemberId: string;
  /** Their name as stored now. */
  readonly name: string;
  readonly fromUtc: string;
}

/** `TabStatus`: 1 Open, 2 Closing, 3 Closed, 4 Abandoned. */
export type ActivityTabStatus = 'open' | 'closing' | 'closed' | 'abandoned' | 'unknown';

/** A bill's header. Money in whole dram. */
export interface ActivityTabHeader {
  readonly tabId: string;
  readonly tableSessionId: string;
  readonly tableLabel: string;
  readonly partySize: number;
  readonly openedAtUtc: string;
  /** When the party sat — often before the tab. */
  readonly seatedAtUtc: string;
  /** `null` while open. */
  readonly closedAtUtc: string | null;
  readonly status: ActivityTabStatus;
  /** The lines, less discounts and comps. */
  readonly subtotalAmd: number;
  readonly serviceChargeAmd: number;
  /** What the bill came to — the reports' figure for it. */
  readonly totalAmd: number;
  readonly paidAmd: number;
  /** Tips on its payments, outside the bill. */
  readonly tipsAmd: number;
  /** The table's waiters in turn, oldest first. */
  readonly servers: readonly ActivityServerTurn[];
}

/** A booking's header. */
export interface ActivityBookingHeader {
  readonly reservationId: string;
  readonly code: string;
  readonly guestName: string;
  readonly partySize: number;
  /** `yyyy-MM-dd`, the branch's calendar. */
  readonly localDate: string;
  /** `HH:mm`. */
  readonly localTime: string;
  /** `ReservationStatus` as the server numbers it. */
  readonly status: number;
  readonly tableLabel: string;
  /** The bill its party sat down to, when it did. */
  readonly tabId: string | null;
}

/** A takeaway order's header. */
export interface ActivityTakeawayHeader {
  readonly orderId: string;
  readonly code: string;
  readonly guestName: string;
  /** `TakeawayStatus` as the server numbers it. */
  readonly status: number;
  readonly totalAmd: number;
  readonly paidAmd: number | null;
  readonly paymentMethod: 'cash' | 'card' | null;
  readonly createdAtUtc: string;
  readonly collectedAtUtc: string | null;
}

/** One line of the bill, with who took it and who voided it. */
export interface ActivityTimelineLine {
  readonly lineId: string;
  readonly orderId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceAmd: number;
  /** Quantity times price — zero once voided. */
  readonly lineTotalAmd: number;
  readonly addedAtUtc: string;
  /** Who keyed it: the waiter, or the guest by their display name (`addedByGuest`). */
  readonly addedBy: ActivityPerson | null;
  /** A guest ordered it from their phone. */
  readonly addedByGuest: boolean;
  /** The table's waiter when it was ordered — whose sale it is. */
  readonly serverStaffMemberId: string | null;
  readonly voided: boolean;
  readonly voidedAtUtc: string | null;
  readonly voidedBy: ActivityPerson | null;
  readonly voidReason: string | null;
}

export interface ActivityTimeline {
  readonly subject: { readonly type: ActivitySubjectType; readonly id: string };
  /** Exactly one header for a bill, a booking or a takeaway order; none for anything else. */
  readonly tab: ActivityTabHeader | null;
  readonly booking: ActivityBookingHeader | null;
  readonly takeaway: ActivityTakeawayHeader | null;
  /** The bill's (or the takeaway order's) lines, in the order they were added. */
  readonly lines: readonly ActivityTimelineLine[];
  /** Oldest first. */
  readonly entries: readonly ActivityEntry[];
  /** The staff who appear, for the filter chips. */
  readonly people: readonly ActivityPerson[];
}

/** The live lines' worth: what the bill's dishes came to before discounts. */
export function timelineLinesAmd(lines: readonly ActivityTimelineLine[]): number {
  return lines.filter((line) => !line.voided).reduce((sum, line) => sum + line.lineTotalAmd, 0);
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
  /** Closed bills with a share of the sale theirs, or theirs at the close. */
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
  /** Bookings they approved… */
  readonly approvals: number;
  /** …and declined. */
  readonly declines: number;
  /** Bookings they took by hand (2026-10-31), over the period. */
  readonly bookingsTaken: number;
  /** …of which the guests came (seated or finished). */
  readonly bookingsCame: number;
  /** …and did not (a no-show still standing). */
  readonly bookingsNoShow: number;
  /** Cash they took, at tables and the takeaway counter. */
  readonly cashAmd: number;
  readonly cashPayments: number;
  /** Discounts and comps they gave, still standing. */
  readonly discounts: number;
  readonly comps: number;
  /** What those took off, as the bills charged it. */
  readonly adjustmentsAmd: number;
  /** Lines they voided. */
  readonly voids: number;
}

export interface StaffPerformanceRow extends PerformanceFigures {
  readonly staffMemberId: string;
  readonly name: string;
  readonly role: StaffRole;
  readonly isActive: boolean;
}

/**
 * The branch's totals, counted once (a transferred table is one table, a
 * median is over every claim). Its money is the revenue report's for the same
 * days.
 */
export interface StaffPerformanceTotals extends PerformanceFigures {
  /** The part of the sales no waiter held: a table nobody on staff served. */
  readonly unattributedSalesAmd: number;
  /** Takeaway collected: nobody's sale, counted here and in the cash. */
  readonly takeawayAmd: number;
}

export interface StaffPerformance extends PerformanceRange {
  readonly rows: readonly StaffPerformanceRow[];
  readonly totals: StaffPerformanceTotals;
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

/** A page of one list: History entries, `seconds` where the action measures it. */
export interface StaffRecentPage {
  readonly list: StaffRecentList;
  readonly items: readonly ActivityEntry[];
  readonly nextCursor: string | null;
}

export interface DailySales {
  /** `yyyy-MM-dd`, the branch's calendar. */
  readonly date: string;
  readonly salesAmd: number;
  readonly tables: number;
}

export interface StaffMemberPerformance extends PerformanceRange {
  readonly staffMemberId: string;
  readonly name: string;
  readonly role: StaffRole;
  readonly isActive: boolean;
  readonly figures: PerformanceFigures;
  /** A week ending on `to` at least, oldest first, a day with no sales as 0. */
  readonly daily: readonly DailySales[];
  /** The first page of the list asked for (`orders` unless said). */
  readonly recent: StaffRecentPage;
}

/**
 * `GET /api/staff/me/performance` (`getMyPerformance`): the signed-in
 * person's own page, one list at a time — "more" of a list on My results.
 */
export interface MyPerformanceQuery extends PerformanceRange {
  /** An owner or general manager, who has no home branch, names the branch. */
  readonly branchId?: string | undefined;
  /** The recent list to read (`orders` when absent). */
  readonly list?: StaffRecentList | undefined;
  /** How many of it: 1 to 100, the server's 50 when absent. */
  readonly limit?: number | undefined;
}

/**
 * `GET /api/staff/me/results` (`getMyResults`): My results on the phone for a
 * period in one read — the figures, the chart and every list's first page.
 */
export interface MyResultsQuery extends PerformanceRange {
  /** An owner or general manager, who has no home branch, names the branch. */
  readonly branchId?: string | undefined;
  /** How many of each list: 1 to 100, the server's 10 when absent. */
  readonly limit?: number | undefined;
}

/**
 * The signed-in person's own numbers with the first page of every recent list:
 * a person's page whose `recent` is all five lists at once, each the page
 * `getMyPerformance` answers for that list (its cursor continues there).
 */
export interface MyResults extends Omit<StaffMemberPerformance, 'recent'> {
  readonly recent: Readonly<Record<StaffRecentList, StaffRecentPage>>;
}

/** One page of one list. */
export interface StaffRecentQuery extends PerformanceRange {
  readonly list: StaffRecentList;
  /** The page before's `nextCursor`; `null` for the first page. */
  readonly cursor: string | null;
}

/**
 * The median of some whole seconds, `null` for none — the server's rule: the
 * middle value of an odd count, of an even count the mean of the middle two
 * rounded half away from zero.
 */
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
 * `POST /api/tabs/{tabId}/transfer` (`transferTable`): the table's bill, its
 * messages and its calls go to another waiter from now on. The current waiter
 * or a manager and above; the target is active staff of the branch who serves
 * (a waiter or above, not the kitchen).
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
  readonly tableSessionId: string | null;
  readonly tableLabel: string | null;
  /** Already theirs: answered as done, nothing written. */
  readonly wasReplay: boolean;
}

/**
 * One person the table can be handed to — an item of `GET
 * /api/tabs/{tabId}/transfer-targets` (`listTransferTargets`). Exactly the
 * people `transferTab` accepts: active staff who serve at the tab's branch
 * (never the kitchen), minus the table's waiter now. Nothing more personal than
 * a name and a role.
 */
export interface TabTransferTarget {
  readonly staffMemberId: string;
  readonly name: string;
  readonly role: StaffRole;
  /** A shift of theirs at this branch runs now. */
  readonly onShiftNow: boolean;
  /** Live sittings at this branch whose waiter they are now. */
  readonly openTables: number;
}

/** `422 transfer-target-ineligible`: the person named cannot take the table. */
export const TRANSFER_TARGET_INELIGIBLE_CODE = ProblemCodes.TransferTargetIneligible;
/** `409 tab-not-transferable`: the bill is closed or the party has gone. */
export const TAB_NOT_TRANSFERABLE_CODE = ProblemCodes.TabNotTransferable;

/** `context.reason` of a `transfer-target-ineligible`. */
export type TransferIneligibleReason =
  'not-found' | 'inactive' | 'other-branch' | 'does-not-serve' | 'unknown';

/** What a refused transfer says, from the problem's code and `context.reason`; `null` for any other failure. */
export function transferRefusalOf(
  error: unknown,
):
  | { readonly kind: 'ineligible'; readonly reason: TransferIneligibleReason }
  | { readonly kind: 'notTransferable' }
  | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === TAB_NOT_TRANSFERABLE_CODE) return { kind: 'notTransferable' };
  if (error.code !== TRANSFER_TARGET_INELIGIBLE_CODE) return null;
  const said = error.problem?.context?.['reason'];
  const reasons: readonly TransferIneligibleReason[] = [
    'not-found',
    'inactive',
    'other-branch',
    'does-not-serve',
  ];
  return {
    kind: 'ineligible',
    reason: reasons.includes(said as TransferIneligibleReason)
      ? (said as TransferIneligibleReason)
      : 'unknown',
  };
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
