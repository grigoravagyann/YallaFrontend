import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_PAGE_SIZE,
  activitySearchText,
  type ActivityActorKind,
  type ActivityBillItem,
  type ActivityBillTotals,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityPage,
  type ActivityParams,
  type ActivityPerson,
  type ActivityQuery,
  type ActivitySubjectType,
  type ActivityTimeline,
  type ActivityValue,
  type DailySales,
  type PerformanceFigures,
  type PerformanceRange,
  type StaffMemberPerformance,
  type StaffPerformance,
  type StaffPerformanceRow,
  type StaffRecentItem,
  type StaffRecentList,
  type StaffRecentPage,
  type TabTransferResult,
} from '../contracts/activity';
import type { StaffRole } from '../contracts/console';
import { staffRole } from './staffAdminMapping';

/**
 * The activity wire (build spec "SHURJ activity history and staff
 * performance", 2026-10-24):
 *
 * - `GET /api/branches/{branchId}/activity` (+ `.csv`)
 * - `GET /api/branches/{branchId}/activity/subjects/{subjectType}/{subjectId}`
 * - `GET /api/branches/{branchId}/staff-performance` (+ `.csv`)
 * - `GET /api/branches/{branchId}/staff/{staffMemberId}/performance`
 * - `POST /api/tabs/{tabId}/transfer`
 * - `POST /api/branches/{branchId}/calls/{callId}/claim`
 *
 * ## Hand-written, on purpose, for now
 *
 * The backend is built in parallel to the same spec, so `generated/schema.ts`
 * does not have these shapes yet. The `Wire…` interfaces below are the spec's
 * `ActivityEntry` columns as JSON, every field optional and read tolerantly:
 * an enum as its word ("PlatformAdmin", "platform-admin") **or** its number,
 * `before`/`after`/`summary` as an object **or** the JSON text the table
 * stores, a missing list as empty. When the schema is regenerated each becomes
 * `Schemas['Yalla.Application.Activity.…']` here and nothing outside this file
 * changes.
 */

type WireEnum = string | number | null | undefined;
/** An object, or the JSON text of one (`BeforeJson`, `AfterJson`). */
type WireJson = string | Readonly<Record<string, unknown>> | null | undefined;

// ---------------------------------------------------------------------------
// The wire (hand-written to the build spec)
// ---------------------------------------------------------------------------

export interface WireActivityEntry {
  readonly id?: string | null;
  readonly occurredAtUtc?: string | null;
  /** Staff / Diner / System / PlatformAdmin (or 1–4). */
  readonly actorKind?: WireEnum;
  readonly staffMemberId?: string | null;
  readonly actorName?: string | null;
  readonly deviceId?: string | null;
  /** "Hall tablet", "Aram's phone", "Console". */
  readonly deviceLabel?: string | null;
  readonly category?: WireEnum;
  /** `booking.approved` … */
  readonly action?: string | null;
  readonly subjectType?: WireEnum;
  readonly subjectId?: string | null;
  readonly tableLabel?: string | null;
  readonly guestName?: string | null;
  readonly amountAmd?: number | null;
  readonly isMoney?: boolean | null;
  readonly before?: WireJson;
  readonly beforeJson?: WireJson;
  readonly after?: WireJson;
  readonly afterJson?: WireJson;
  readonly reason?: string | null;
  /** The structured parameters the screen words. */
  readonly summary?: WireJson;
}

export interface WireActivityPage {
  readonly items?: readonly WireActivityEntry[] | null;
  readonly nextCursor?: string | null;
}

/** The feed's query string. */
export interface WireActivityParams {
  readonly [key: string]: string | number | boolean | undefined;
  readonly date: string;
  readonly staffMemberId?: string | undefined;
  /** `system` for SHURJ's own actions (assumed: the spec names only `staffMemberId`). */
  readonly actorKind?: string | undefined;
  readonly category?: string | undefined;
  readonly q?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface WireBillItem {
  readonly lineId?: string | null;
  readonly name?: string | null;
  readonly quantity?: number | null;
  readonly amountAmd?: number | null;
  readonly addedByStaffMemberId?: string | null;
  readonly addedByName?: string | null;
  readonly voided?: boolean | null;
  readonly voidedByStaffMemberId?: string | null;
  readonly voidedByName?: string | null;
  readonly voidReason?: string | null;
  readonly comped?: boolean | null;
}

export interface WireBillTotals {
  readonly itemsAmd?: number | null;
  readonly discountAmd?: number | null;
  readonly serviceChargeAmd?: number | null;
  readonly paidAmd?: number | null;
  readonly tipAmd?: number | null;
  /** cash / card / mixed / unpaid. */
  readonly paidBy?: WireEnum;
}

export interface WireActivityTimeline {
  readonly subjectType?: WireEnum;
  readonly subjectId?: string | null;
  readonly tableLabel?: string | null;
  readonly guestName?: string | null;
  readonly code?: string | null;
  readonly partySize?: number | null;
  readonly startedAtUtc?: string | null;
  readonly endedAtUtc?: string | null;
  readonly serverStaffMemberId?: string | null;
  readonly serverName?: string | null;
  readonly totals?: WireBillTotals | null;
  readonly entries?: readonly WireActivityEntry[] | null;
  readonly items?: readonly WireBillItem[] | null;
}

export interface WirePerformanceFigures {
  readonly tables?: number | null;
  readonly guests?: number | null;
  readonly salesAmd?: number | null;
  readonly averageCheckAmd?: number | null;
  readonly tipsAmd?: number | null;
  readonly callClaimMedianSeconds?: number | null;
  readonly callClaims?: number | null;
  readonly messageReplyMedianSeconds?: number | null;
  readonly messageReplies?: number | null;
  readonly approvals?: number | null;
  readonly cashAmd?: number | null;
  readonly cashCount?: number | null;
  readonly discountCompCount?: number | null;
}

export interface WireStaffPerformanceRow extends WirePerformanceFigures {
  readonly staffMemberId?: string | null;
  readonly name?: string | null;
  /** The staff role's code (1 owner, 6 GM, 2 manager, 3 waiter, 4 kitchen) or its word. */
  readonly role?: WireEnum;
}

export interface WireStaffPerformance {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly rows?: readonly WireStaffPerformanceRow[] | null;
  readonly totals?: WirePerformanceFigures | null;
}

export interface WireStaffRecentItem extends WireActivityEntry {
  readonly responseSeconds?: number | null;
}

export interface WireStaffRecentPage {
  readonly items?: readonly WireStaffRecentItem[] | null;
  readonly total?: number | null;
  readonly nextCursor?: string | null;
}

export interface WireStaffMemberPerformance {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly staffMemberId?: string | null;
  readonly name?: string | null;
  readonly role?: WireEnum;
  readonly figures?: WirePerformanceFigures | null;
  readonly daily?:
    readonly { readonly date?: string | null; readonly salesAmd?: number | null }[] | null;
  readonly recent?: Partial<Record<StaffRecentList, WireStaffRecentPage | null>> | null;
}

export interface WireTabTransfer {
  readonly tabId?: string | null;
  readonly serverStaffMemberId?: string | null;
  readonly serverName?: string | null;
  readonly previousServerStaffMemberId?: string | null;
  readonly previousServerName?: string | null;
  readonly transferredAtUtc?: string | null;
}

/** `POST /api/tabs/{tabId}/transfer`'s body. */
export interface WireTransferTabRequest {
  readonly toStaffMemberId: string;
  readonly clientCommandId: string;
}

/** What a claim adds to a `ServiceRequestView`. */
export interface WireServiceRequestClaim {
  readonly claimedByStaffMemberId?: string | null;
  readonly claimedByName?: string | null;
  readonly claimedAtUtc?: string | null;
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

/** Whole dram: money is never fractional on this wire. */
function dram(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function dramOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function secondsOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

/** "PlatformAdmin", "platform-admin", "platform_admin" all read as "platformadmin". */
function word(value: WireEnum): string {
  return typeof value === 'string' ? value.replace(/[-_\s]/gu, '').toLowerCase() : '';
}

const ACTOR_BY_WORD: Readonly<Record<string, ActivityActorKind>> = {
  staff: 'staff',
  diner: 'diner',
  guest: 'diner',
  system: 'system',
  platformadmin: 'platformAdmin',
};
/** The enum's order in the spec, from 1 as every enum on this API: Staff, Diner, System, PlatformAdmin. */
const ACTOR_BY_CODE: Readonly<Record<number, ActivityActorKind>> = {
  1: 'staff',
  2: 'diner',
  3: 'system',
  4: 'platformAdmin',
};

export function activityActorKind(value: WireEnum): ActivityActorKind {
  if (typeof value === 'number') return ACTOR_BY_CODE[value] ?? 'system';
  return ACTOR_BY_WORD[word(value)] ?? 'system';
}

/** The category by word or by its place in the spec's list; an unknown one reads as `settings`. */
export function activityCategory(value: WireEnum, action?: string | null): ActivityCategory {
  // From 1, in the spec's order: booking, table, order, payment, takeaway, …
  if (typeof value === 'number') return ACTIVITY_CATEGORIES[value - 1] ?? 'settings';
  const said = word(value) as ActivityCategory;
  if (ACTIVITY_CATEGORIES.includes(said)) return said;
  // No category: the action's own prefix, `booking.approved` → booking.
  const prefix = (action ?? '').split('.')[0]?.toLowerCase() as ActivityCategory;
  return ACTIVITY_CATEGORIES.includes(prefix) ? prefix : 'settings';
}

const SUBJECT_BY_WORD: Readonly<Record<string, ActivitySubjectType>> = {
  tab: 'tab',
  bill: 'tab',
  tablesession: 'tab',
  reservation: 'reservation',
  booking: 'reservation',
  takeaway: 'takeaway',
  takeawayorder: 'takeaway',
  menuitem: 'menuItem',
  staffmember: 'staffMember',
  staff: 'staffMember',
  device: 'device',
  staffdevice: 'device',
  branch: 'branch',
};

export function activitySubjectType(value: WireEnum): ActivitySubjectType {
  return SUBJECT_BY_WORD[word(value)] ?? 'other';
}

/** The route's segment for a subject type: the type's own word. */
export function activitySubjectSegment(type: ActivitySubjectType): string {
  return type === 'takeaway' ? 'takeawayOrder' : type;
}

function scalar(value: unknown): ActivityValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/** An object of plain values, from the object or from its JSON text; anything else is left out. */
export function activityParams(value: WireJson): ActivityParams | null {
  let source: unknown = value;
  if (typeof value === 'string') {
    try {
      source = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null;
  const out: Record<string, ActivityValue> = {};
  for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
    const said = scalar(raw);
    if (said !== undefined) out[key] = said;
  }
  return out;
}

export function activityEntryFromWire(wire: WireActivityEntry): ActivityEntry {
  const actorKind = activityActorKind(wire.actorKind);
  const deviceLabel = text(wire.deviceLabel) ?? '';
  const deviceId = text(wire.deviceId);
  const action = text(wire.action) ?? '';
  return {
    id: text(wire.id) ?? '',
    occurredAtUtc: text(wire.occurredAtUtc) ?? '',
    actor: {
      kind: actorKind,
      staffMemberId: actorKind === 'staff' ? text(wire.staffMemberId) : null,
      name: text(wire.actorName) ?? '',
    },
    device: {
      id: deviceId,
      label: deviceLabel,
      // The server's fallback for a console session: no device, "Console".
      isConsole:
        actorKind === 'staff' &&
        deviceId === null &&
        (deviceLabel === '' || /^console$/iu.test(deviceLabel)),
    },
    category: activityCategory(wire.category, action),
    action,
    subject: { type: activitySubjectType(wire.subjectType), id: text(wire.subjectId) },
    tableLabel: text(wire.tableLabel),
    guestName: text(wire.guestName),
    amountAmd: dramOrNull(wire.amountAmd),
    isMoney: wire.isMoney === true,
    before: activityParams(wire.before ?? wire.beforeJson),
    after: activityParams(wire.after ?? wire.afterJson),
    reason: text(wire.reason),
    params: activityParams(wire.summary) ?? {},
  };
}

/** A page; a row with no id or no time is left out. */
export function activityPageFromWire(wire: WireActivityPage | null | undefined): ActivityPage {
  return {
    items: (wire?.items ?? [])
      .map(activityEntryFromWire)
      .filter((entry) => entry.id !== '' && entry.occurredAtUtc !== ''),
    nextCursor: text(wire?.nextCursor),
  };
}

function person(id: unknown, name: unknown): ActivityPerson | null {
  const said = text(name);
  return said === null ? null : { staffMemberId: text(id), name: said };
}

const PAID_BY: Readonly<Record<string, ActivityBillTotals['paidBy']>> = {
  cash: 'cash',
  card: 'card',
  mixed: 'mixed',
  unpaid: 'unpaid',
};

function billTotals(wire: WireBillTotals | null | undefined): ActivityBillTotals | null {
  if (!wire) return null;
  return {
    itemsAmd: dram(wire.itemsAmd),
    discountAmd: dram(wire.discountAmd),
    serviceChargeAmd: dram(wire.serviceChargeAmd),
    paidAmd: dram(wire.paidAmd),
    tipAmd: dram(wire.tipAmd),
    paidBy: PAID_BY[word(wire.paidBy)] ?? null,
  };
}

function billItem(wire: WireBillItem, index: number): ActivityBillItem {
  return {
    lineId: text(wire.lineId) ?? `line-${index}`,
    name: text(wire.name) ?? '',
    quantity: Math.max(1, count(wire.quantity)),
    amountAmd: dram(wire.amountAmd),
    addedBy: person(wire.addedByStaffMemberId, wire.addedByName),
    voided: wire.voided === true,
    voidedBy: person(wire.voidedByStaffMemberId, wire.voidedByName),
    voidReason: text(wire.voidReason),
    comped: wire.comped === true,
  };
}

/**
 * A timeline, its entries oldest first whatever order they came in. `null`
 * when the subject has no id (nothing to open).
 */
export function activityTimelineFromWire(
  wire: WireActivityTimeline | null | undefined,
  asked: { readonly type: ActivitySubjectType; readonly id: string },
): ActivityTimeline {
  const entries = (wire?.entries ?? [])
    .map(activityEntryFromWire)
    .filter((entry) => entry.id !== '' && entry.occurredAtUtc !== '')
    .sort((a, b) => Date.parse(a.occurredAtUtc) - Date.parse(b.occurredAtUtc));
  const said = activitySubjectType(wire?.subjectType);
  return {
    subject: { type: said === 'other' ? asked.type : said, id: text(wire?.subjectId) ?? asked.id },
    tableLabel: text(wire?.tableLabel),
    guestName: text(wire?.guestName),
    code: text(wire?.code),
    partySize: count(wire?.partySize) || null,
    startedAtUtc: text(wire?.startedAtUtc),
    endedAtUtc: text(wire?.endedAtUtc),
    server: person(wire?.serverStaffMemberId, wire?.serverName),
    totals: billTotals(wire?.totals),
    entries,
    items: (wire?.items ?? []).map(billItem),
  };
}

function roleOf(value: WireEnum): StaffRole {
  if (typeof value === 'number') return staffRole(value);
  const said = word(value);
  const roles: Readonly<Record<string, StaffRole>> = {
    owner: 'owner',
    generalmanager: 'generalManager',
    manager: 'manager',
    waiter: 'waiter',
    kitchen: 'kitchen',
  };
  return roles[said] ?? 'waiter';
}

export function performanceFiguresFromWire(
  wire: WirePerformanceFigures | null | undefined,
): PerformanceFigures {
  const tables = count(wire?.tables);
  const sales = dram(wire?.salesAmd);
  return {
    tables,
    guests: count(wire?.guests),
    salesAmd: sales,
    averageCheckAmd:
      dramOrNull(wire?.averageCheckAmd) ?? (tables > 0 ? Math.round(sales / tables) : null),
    tipsAmd: dram(wire?.tipsAmd),
    callMedianSeconds: secondsOrNull(wire?.callClaimMedianSeconds),
    callsClaimed: count(wire?.callClaims),
    replyMedianSeconds: secondsOrNull(wire?.messageReplyMedianSeconds),
    messagesAnswered: count(wire?.messageReplies),
    approvals: count(wire?.approvals),
    cashAmd: dram(wire?.cashAmd),
    cashBills: count(wire?.cashCount),
    discountsAndComps: count(wire?.discountCompCount),
  };
}

function performanceRow(wire: WireStaffPerformanceRow): StaffPerformanceRow {
  return {
    ...performanceFiguresFromWire(wire),
    staffMemberId: text(wire.staffMemberId) ?? '',
    name: text(wire.name) ?? '',
    role: roleOf(wire.role),
  };
}

export function staffPerformanceFromWire(
  wire: WireStaffPerformance | null | undefined,
  asked: PerformanceRange,
): StaffPerformance {
  return {
    from: text(wire?.from) ?? asked.from,
    to: text(wire?.to) ?? asked.to,
    rows: (wire?.rows ?? []).map(performanceRow).filter((row) => row.staffMemberId !== ''),
    totals: performanceFiguresFromWire(wire?.totals),
  };
}

function recentItem(wire: WireStaffRecentItem): StaffRecentItem {
  return { ...activityEntryFromWire(wire), responseSeconds: secondsOrNull(wire.responseSeconds) };
}

export function staffRecentPageFromWire(
  wire: WireStaffRecentPage | null | undefined,
): StaffRecentPage {
  const items = (wire?.items ?? [])
    .map(recentItem)
    .filter((entry) => entry.id !== '' && entry.occurredAtUtc !== '');
  return {
    items,
    total: Math.max(count(wire?.total), items.length),
    nextCursor: text(wire?.nextCursor),
  };
}

const RECENT_LISTS: readonly StaffRecentList[] = [
  'orders',
  'messages',
  'bookings',
  'cash',
  'calls',
];

export function staffMemberPerformanceFromWire(
  wire: WireStaffMemberPerformance | null | undefined,
  asked: PerformanceRange & { readonly staffMemberId: string },
): StaffMemberPerformance {
  const daily: DailySales[] = (wire?.daily ?? []).flatMap((day) => {
    const date = text(day.date);
    return date === null ? [] : [{ date: date.slice(0, 10), salesAmd: dram(day.salesAmd) }];
  });
  const recent = Object.fromEntries(
    RECENT_LISTS.map((list) => [list, staffRecentPageFromWire(wire?.recent?.[list])]),
  ) as Record<StaffRecentList, StaffRecentPage>;
  return {
    from: text(wire?.from) ?? asked.from,
    to: text(wire?.to) ?? asked.to,
    staffMemberId: text(wire?.staffMemberId) ?? asked.staffMemberId,
    name: text(wire?.name) ?? '',
    role: roleOf(wire?.role),
    figures: performanceFiguresFromWire(wire?.figures),
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
    recent,
  };
}

export function tabTransferFromWire(
  wire: WireTabTransfer | null | undefined,
  asked: { readonly tabId: string; readonly toStaffMemberId: string },
): TabTransferResult {
  return {
    tabId: text(wire?.tabId) ?? asked.tabId,
    server: person(wire?.serverStaffMemberId, wire?.serverName) ?? {
      staffMemberId: asked.toStaffMemberId,
      name: '',
    },
    previousServer: person(wire?.previousServerStaffMemberId, wire?.previousServerName),
    transferredAtUtc: text(wire?.transferredAtUtc) ?? new Date().toISOString(),
  };
}

/** The claim's three fields, only when a claim was made: an unclaimed call carries none. */
export function serviceRequestClaimFromWire(wire: WireServiceRequestClaim | null | undefined): {
  claimedByStaffMemberId?: string | null;
  claimedByName?: string | null;
  claimedAtUtc?: string | null;
} {
  const name = text(wire?.claimedByName);
  const at = text(wire?.claimedAtUtc);
  if (name === null && at === null) return {};
  return {
    claimedByStaffMemberId: text(wire?.claimedByStaffMemberId),
    claimedByName: name,
    claimedAtUtc: at,
  };
}

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

/**
 * The feed's query string: the day always; who, the category and the search
 * only when set; the cursor only after the first page.
 */
export function activityParamsFor(
  filters: ActivityFilters,
  page?: Pick<ActivityQuery, 'cursor' | 'limit'>,
): WireActivityParams {
  const q = activitySearchText(filters.q);
  return {
    date: filters.date,
    ...(filters.who.kind === 'staff' ? { staffMemberId: filters.who.staffMemberId } : {}),
    ...(filters.who.kind === 'system' ? { actorKind: 'system' } : {}),
    ...(filters.category !== 'all' ? { category: filters.category } : {}),
    ...(q !== '' ? { q } : {}),
    ...(page?.cursor ? { cursor: page.cursor } : {}),
    ...(page ? { limit: page.limit ?? ACTIVITY_PAGE_SIZE } : {}),
  };
}

/** `from` and `to`, with a list and its cursor for one more page of a person's list. */
export function performanceParams(
  range: PerformanceRange,
  more?: { readonly list: StaffRecentList; readonly cursor: string },
): Record<string, string> {
  return {
    from: range.from,
    to: range.to,
    ...(more ? { list: more.list, cursor: more.cursor } : {}),
  };
}

/** `name-2026-10-24.csv` from a `Content-Disposition`, or the fallback. */
export function csvFileName(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/iu.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain name
    }
  }
  const plain = /filename="?([^";]+)"?/iu.exec(disposition);
  return plain?.[1]?.trim() || fallback;
}
