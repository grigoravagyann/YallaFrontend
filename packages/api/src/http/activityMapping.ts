import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_PAGE_SIZE,
  STAFF_RECENT_LISTS,
  STAFF_RECENT_PAGE_SIZE,
  activitySearchText,
  type ActivityActorKind,
  type ActivityBookingHeader,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityLine,
  type ActivityPage,
  type ActivityParams,
  type ActivityPerson,
  type ActivityQuery,
  type ActivitySubjectType,
  type ActivityTabHeader,
  type ActivityTabStatus,
  type ActivityTakeawayHeader,
  type ActivityTimeline,
  type ActivityTimelineLine,
  type ActivityValue,
  type DailySales,
  type PerformanceFigures,
  type MyPerformanceQuery,
  type MyResults,
  type MyResultsQuery,
  type PerformanceRange,
  type StaffMemberPerformance,
  type StaffPerformance,
  type StaffPerformanceRow,
  type StaffPerformanceTotals,
  type StaffRecentList,
  type StaffRecentPage,
  type StaffRecentQuery,
  type TabTransferResult,
  type TabTransferTarget,
} from '../contracts/activity';
import type { components, operations } from '../generated/schema';
import { staffRole } from './staffAdminMapping';

/**
 * The activity wire (Yalla `docs/activity.md`, 2026-10-24):
 *
 * - `GET /api/branches/{branchId}/activity` (`listBranchActivity`, + `.csv`)
 * - `GET /api/branches/{branchId}/activity/subjects/{subjectType}/{subjectId}` (`getActivityTimeline`)
 * - `GET /api/branches/{branchId}/staff-performance` (`getStaffPerformance`, + `.csv`)
 * - `GET /api/branches/{branchId}/staff/{staffMemberId}/performance` (`getStaffMemberPerformance`)
 * - `POST /api/tabs/{tabId}/transfer` (`transferTable`)
 * - `GET /api/tabs/{tabId}/transfer-targets` (`listTransferTargets`)
 * - `POST /api/branches/{branchId}/calls/{callId}/claim` (`claimServiceRequest`)
 *
 * The shapes are the generated schema's. Every query value is a string on the
 * wire — the server reads them as strings so one that does not parse is named
 * in the one `422 validation-failed` with the rest. The words are the
 * server's, lowercase: `actorKind` `staff`/`guest`/`system`/`platform`,
 * `category` `booking`…`device`, `subjectType` `reservation`, `tab`,
 * `menu-item`, `service-request`… Read tolerantly: an unknown word as the
 * nearest safe value, a property the API leaves out (it omits nulls) as
 * `null`, `before`/`after`/`summary` as the objects they are — a booking's
 * `summary.extra` flattened under `extra.`, an order's `summary.lines` as its
 * dishes.
 */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

type Schemas = components['schemas'];

export type WireActivityItem = Schemas['Yalla.Application.Activity.ActivityItem'];
export type WireActivityPage = Schemas['Yalla.Application.Activity.ActivityPage'];
export type WireActivityTimeline = Schemas['Yalla.Application.Activity.ActivityTimeline'];
export type WireTabTimelineHeader = Schemas['Yalla.Application.Activity.TabTimelineHeader'];
export type WireBookingTimelineHeader = Schemas['Yalla.Application.Activity.BookingTimelineHeader'];
export type WireTakeawayTimelineHeader =
  Schemas['Yalla.Application.Activity.TakeawayTimelineHeader'];
export type WireTimelineLine = Schemas['Yalla.Application.Activity.TimelineLine'];
export type WireStaffPerformanceReport =
  Schemas['Yalla.Application.Activity.StaffPerformanceReport'];
export type WireStaffPerformanceRow = Schemas['Yalla.Application.Activity.StaffPerformanceRow'];
export type WireStaffPerformanceTotals =
  Schemas['Yalla.Application.Activity.StaffPerformanceTotals'];
export type WirePersonPerformance = Schemas['Yalla.Application.Activity.PersonPerformance'];
export type WireRecentPage = Schemas['Yalla.Application.Activity.RecentPage'];
/** `GET /api/staff/me/results`' answer: a person's page with every list's first page. */
export type WireMyResults = Schemas['Yalla.Application.Activity.MyResults'];
export type WireTableTransferResult = Schemas['Yalla.Application.Activity.TableTransferResult'];
/** `POST /api/tabs/{tabId}/transfer`'s body. */
export type WireTransferTableRequest = Schemas['Yalla.Api.Endpoints.TransferTableRequest'];
/** `GET /api/tabs/{tabId}/transfer-targets`' answer and one of its items. */
export type WireTransferTargetsView = Schemas['Yalla.Application.Activity.TransferTargetsView'];
export type WireTransferTarget = Schemas['Yalla.Application.Activity.TransferTarget'];

/** The feed's query string (and the CSV's): every value a string. */
export type WireActivityParams = NonNullable<
  operations['listBranchActivity']['parameters']['query']
>;
/** The results' query string. */
export type WireStaffPerformanceParams = NonNullable<
  operations['getStaffPerformance']['parameters']['query']
>;
/** My results' query string. */
export type WireMyPerformanceParams = NonNullable<
  operations['getMyPerformance']['parameters']['query']
>;
/** My results in one read: its query string. */
export type WireMyResultsParams = NonNullable<operations['getMyResults']['parameters']['query']>;
/** A person's page's query string. */
export type WirePersonPerformanceParams = NonNullable<
  operations['getStaffMemberPerformance']['parameters']['query']
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

function word(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const ACTOR_KINDS: readonly ActivityActorKind[] = ['staff', 'guest', 'system', 'platform'];

/** `staff`, `guest`, `system`, `platform`; anything else reads as the system (no name, no person). */
export function activityActorKind(value: unknown): ActivityActorKind {
  const said = word(value) as ActivityActorKind;
  return ACTOR_KINDS.includes(said) ? said : 'system';
}

/** The category's word; an unknown one by the action's own prefix (`booking.approved` → booking), else `settings`. */
export function activityCategory(value: unknown, action?: string | null): ActivityCategory {
  const said = word(value) as ActivityCategory;
  if (ACTIVITY_CATEGORIES.includes(said)) return said;
  const prefix = (action ?? '').split('.')[0]?.toLowerCase() as ActivityCategory;
  return ACTIVITY_CATEGORIES.includes(prefix) ? prefix : 'settings';
}

const SUBJECT_BY_WORD: Readonly<Record<string, ActivitySubjectType>> = {
  tab: 'tab',
  reservation: 'reservation',
  takeaway: 'takeaway',
  takeawayorder: 'takeaway',
  'table-session': 'tableSession',
  table: 'table',
  order: 'order',
  'service-request': 'serviceRequest',
  conversation: 'conversation',
  'menu-item': 'menuItem',
  staff: 'staffMember',
  branch: 'branch',
  device: 'device',
};

/** The server's `subjectType` word (`menu-item`, `service-request`…) as this client's type. */
export function activitySubjectType(value: unknown): ActivitySubjectType {
  return SUBJECT_BY_WORD[word(value)] ?? 'other';
}

/** The timeline route's segment for a subject: `tab`, `reservation`, `takeawayOrder`. */
export function activitySubjectSegment(type: ActivitySubjectType): string {
  return type === 'takeaway' ? 'takeawayOrder' : type;
}

function scalar(value: unknown): ActivityValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function objectOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The plain values of an object; anything that is not one is left out. A
 * nested `extra` (a booking's) is flattened as `extra.<key>`.
 */
export function activityParams(value: unknown): ActivityParams | null {
  const source = objectOf(value);
  if (source === null) return null;
  const out: Record<string, ActivityValue> = {};
  for (const [key, raw] of Object.entries(source)) {
    const said = scalar(raw);
    if (said !== undefined) {
      out[key] = said;
      continue;
    }
    const nested = key === 'extra' ? objectOf(raw) : null;
    for (const [inner, innerRaw] of Object.entries(nested ?? {})) {
      const innerSaid = scalar(innerRaw);
      if (innerSaid !== undefined) out[`extra.${inner}`] = innerSaid;
    }
  }
  return out;
}

/** An order's `summary.lines`: `[{ name, quantity }]`, a line with no name left out. */
export function activityLines(summary: unknown): readonly ActivityLine[] {
  const lines = objectOf(summary)?.['lines'];
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((line: unknown) => {
    const row = objectOf(line);
    const name = text(row?.['name']);
    return name === null ? [] : [{ name, quantity: Math.max(1, count(row?.['quantity'])) }];
  });
}

/** "2026-10-24 18:31" (or "2026-10-24T18:31:00"): the day and the minute. */
function localStamp(value: unknown): string {
  const said = text(value);
  if (said === null) return '';
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/u.exec(said);
  return match ? `${match[1]} ${match[2]}` : said;
}

export function activityEntryFromWire(wire: Partial<WireActivityItem>): ActivityEntry {
  const actorKind = activityActorKind(wire.actorKind);
  const deviceLabel = text(wire.deviceLabel) ?? '';
  const deviceId = text(wire.deviceId);
  const action = text(wire.action) ?? '';
  return {
    id: text(wire.id) ?? '',
    occurredAtUtc: text(wire.occurredAtUtc) ?? '',
    local: localStamp(wire.local),
    actor: {
      kind: actorKind,
      staffMemberId: actorKind === 'staff' ? text(wire.staffMemberId) : null,
      name: text(wire.actorName) ?? '',
    },
    device: {
      id: deviceId,
      label: deviceLabel,
      // A staff session with no enrolled device: the server says `Console`.
      isConsole: actorKind === 'staff' && deviceId === null && /^console$/iu.test(deviceLabel),
    },
    category: activityCategory(wire.category, action),
    action,
    subject: {
      type: activitySubjectType(wire.subjectType),
      id: text(wire.subjectId),
      code: text(wire.subjectCode),
    },
    tableSessionId: text(wire.tableSessionId),
    tableLabel: text(wire.tableLabel),
    guestName: text(wire.guestName),
    itemNames: text(wire.itemNames),
    amountAmd: dramOrNull(wire.amountAmd),
    isMoney: wire.isMoney === true,
    before: activityParams(wire.before),
    after: activityParams(wire.after),
    reason: text(wire.reason),
    params: activityParams(wire.summary) ?? {},
    lines: activityLines(wire.summary),
    seconds: secondsOrNull(wire.seconds),
  };
}

function entriesFromWire(
  items: readonly Partial<WireActivityItem>[] | null | undefined,
): ActivityEntry[] {
  return (items ?? [])
    .map(activityEntryFromWire)
    .filter((entry) => entry.id !== '' && entry.occurredAtUtc !== '');
}

/** A page; a row with no id or no time is left out. */
export function activityPageFromWire(
  wire: Partial<WireActivityPage> | null | undefined,
): ActivityPage {
  return { items: entriesFromWire(wire?.items), nextCursor: text(wire?.nextCursor) };
}

function person(id: unknown, name: unknown): ActivityPerson | null {
  const said = text(name);
  return said === null ? null : { staffMemberId: text(id), name: said };
}

const TAB_STATUS: Readonly<Record<number, ActivityTabStatus>> = {
  1: 'open',
  2: 'closing',
  3: 'closed',
  4: 'abandoned',
};

function tabHeader(
  wire: Partial<WireTabTimelineHeader> | null | undefined,
): ActivityTabHeader | null {
  const tabId = text(wire?.tabId);
  if (!wire || tabId === null) return null;
  const openedAtUtc = text(wire.openedAtUtc) ?? '';
  return {
    tabId,
    tableSessionId: text(wire.tableSessionId) ?? '',
    tableLabel: text(wire.tableLabel) ?? '',
    partySize: count(wire.partySize),
    openedAtUtc,
    seatedAtUtc: text(wire.seatedAtUtc) ?? openedAtUtc,
    closedAtUtc: text(wire.closedAtUtc),
    status: (typeof wire.status === 'number' ? TAB_STATUS[wire.status] : undefined) ?? 'unknown',
    subtotalAmd: dram(wire.subtotalAmd),
    serviceChargeAmd: dram(wire.serviceChargeAmd),
    totalAmd: dram(wire.totalAmd),
    paidAmd: dram(wire.paidAmd),
    tipsAmd: dram(wire.tipsAmd),
    servers: (wire.servers ?? [])
      .flatMap((turn) => {
        const id = text(turn.staffMemberId);
        const from = text(turn.fromUtc);
        return id === null || from === null
          ? []
          : [{ staffMemberId: id, name: text(turn.name) ?? '', fromUtc: from }];
      })
      .sort((a, b) => Date.parse(a.fromUtc) - Date.parse(b.fromUtc)),
  };
}

function bookingHeader(
  wire: Partial<WireBookingTimelineHeader> | null | undefined,
): ActivityBookingHeader | null {
  const id = text(wire?.reservationId);
  if (!wire || id === null) return null;
  return {
    reservationId: id,
    code: text(wire.code) ?? '',
    guestName: text(wire.guestName) ?? '',
    partySize: count(wire.partySize),
    localDate: text(wire.localDate) ?? '',
    localTime: (text(wire.localTime) ?? '').slice(0, 5),
    status: typeof wire.status === 'number' ? wire.status : 0,
    tableLabel: text(wire.tableLabel) ?? '',
    tabId: text(wire.tabId),
  };
}

function takeawayHeader(
  wire: Partial<WireTakeawayTimelineHeader> | null | undefined,
): ActivityTakeawayHeader | null {
  const id = text(wire?.orderId);
  if (!wire || id === null) return null;
  return {
    orderId: id,
    code: text(wire.code) ?? '',
    guestName: text(wire.guestName) ?? '',
    status: typeof wire.status === 'number' ? wire.status : 0,
    totalAmd: dram(wire.totalAmd),
    paidAmd: dramOrNull(wire.paidAmd),
    // `TakeawayPaymentMethod`: 1 cash, 2 card.
    paymentMethod: wire.paymentMethod === 1 ? 'cash' : wire.paymentMethod === 2 ? 'card' : null,
    createdAtUtc: text(wire.createdAtUtc) ?? '',
    collectedAtUtc: text(wire.collectedAtUtc),
  };
}

function timelineLine(wire: Partial<WireTimelineLine>, index: number): ActivityTimelineLine {
  const voidedAtUtc = text(wire.voidedAtUtc);
  const addedByGuest = wire.addedByGuest === true;
  return {
    lineId: text(wire.lineId) ?? `line-${index}`,
    orderId: text(wire.orderId) ?? '',
    name: text(wire.name) ?? '',
    quantity: Math.max(1, count(wire.quantity)),
    unitPriceAmd: dram(wire.unitPriceAmd),
    lineTotalAmd: dram(wire.lineTotalAmd),
    addedAtUtc: text(wire.addedAtUtc) ?? '',
    addedBy: person(addedByGuest ? null : wire.addedByStaffMemberId, wire.addedByName),
    addedByGuest,
    serverStaffMemberId: text(wire.serverStaffMemberId),
    voided: voidedAtUtc !== null,
    voidedAtUtc,
    voidedBy: person(wire.voidedByStaffMemberId, wire.voidedByName),
    voidReason: text(wire.voidReason),
  };
}

/** A timeline, its entries oldest first whatever order they came in. */
export function activityTimelineFromWire(
  wire: Partial<WireActivityTimeline> | null | undefined,
  asked: { readonly type: ActivitySubjectType; readonly id: string },
): ActivityTimeline {
  const entries = entriesFromWire(wire?.entries).sort(
    (a, b) => Date.parse(a.occurredAtUtc) - Date.parse(b.occurredAtUtc),
  );
  const said = activitySubjectType(wire?.subjectType);
  return {
    subject: { type: said === 'other' ? asked.type : said, id: text(wire?.subjectId) ?? asked.id },
    tab: tabHeader(wire?.tab),
    booking: bookingHeader(wire?.booking),
    takeaway: takeawayHeader(wire?.takeaway),
    lines: (wire?.lines ?? []).map(timelineLine),
    entries,
    people: (wire?.people ?? []).flatMap((one) => {
      const found = person(one.staffMemberId, one.name);
      return found ? [found] : [];
    }),
  };
}

function figuresFromWire(
  wire: Partial<WireStaffPerformanceRow | WireStaffPerformanceTotals> | null | undefined,
): PerformanceFigures {
  const tables = count(wire?.tables);
  return {
    tables,
    guests: count(wire?.guests),
    salesAmd: dram(wire?.salesAmd),
    // The server writes 0 for no tables; nothing to average is said as nothing.
    averageCheckAmd: tables > 0 ? dram(wire?.averageCheckAmd) : null,
    tipsAmd: dram(wire?.tipsAmd),
    callMedianSeconds: secondsOrNull(wire?.callClaimMedianSeconds),
    callsClaimed: count(wire?.callsClaimed),
    replyMedianSeconds: secondsOrNull(wire?.messageReplyMedianSeconds),
    messagesAnswered: count(wire?.messagesAnswered),
    approvals: count(wire?.approvals),
    declines: count(wire?.declines),
    cashAmd: dram(wire?.cashAmd),
    cashPayments: count(wire?.cashPayments),
    discounts: count(wire?.discounts),
    comps: count(wire?.comps),
    adjustmentsAmd: dram(wire?.adjustmentsAmd),
    voids: count(wire?.voids),
  };
}

export function performanceFiguresFromWire(
  wire: Partial<WireStaffPerformanceRow> | null | undefined,
): PerformanceFigures {
  return figuresFromWire(wire);
}

function performanceRow(wire: Partial<WireStaffPerformanceRow>): StaffPerformanceRow {
  return {
    ...figuresFromWire(wire),
    staffMemberId: text(wire.staffMemberId) ?? '',
    name: text(wire.name) ?? '',
    role: typeof wire.role === 'number' ? staffRole(wire.role) : 'waiter',
    isActive: wire.isActive !== false,
  };
}

function totalsFromWire(
  wire: Partial<WireStaffPerformanceTotals> | null | undefined,
): StaffPerformanceTotals {
  return {
    ...figuresFromWire(wire),
    unattributedSalesAmd: dram(wire?.unattributedSalesAmd),
    takeawayAmd: dram(wire?.takeawayAmd),
  };
}

export function staffPerformanceFromWire(
  wire: Partial<WireStaffPerformanceReport> | null | undefined,
  asked: PerformanceRange,
): StaffPerformance {
  return {
    from: text(wire?.from) ?? asked.from,
    to: text(wire?.to) ?? asked.to,
    rows: (wire?.staff ?? []).map(performanceRow).filter((row) => row.staffMemberId !== ''),
    totals: totalsFromWire(wire?.totals),
  };
}

function recentList(value: unknown, fallback: StaffRecentList): StaffRecentList {
  const said = word(value) as StaffRecentList;
  return STAFF_RECENT_LISTS.includes(said) ? said : fallback;
}

export function staffRecentPageFromWire(
  wire: Partial<WireRecentPage> | null | undefined,
  asked: StaffRecentList,
): StaffRecentPage {
  return {
    list: recentList(wire?.list, asked),
    items: entriesFromWire(wire?.items),
    nextCursor: text(wire?.nextCursor),
  };
}

export function staffMemberPerformanceFromWire(
  wire: Partial<WirePersonPerformance> | null | undefined,
  asked: PerformanceRange & {
    readonly staffMemberId: string;
    readonly list?: StaffRecentList | undefined;
  },
): StaffMemberPerformance {
  return {
    ...personFromWire(wire, asked),
    recent: staffRecentPageFromWire(wire?.recent, asked.list ?? 'orders'),
  };
}

/**
 * `GET /api/staff/me/results`: the same person, figures and chart as a
 * person's page, and every list's first page, each read as that list's own.
 */
export function myResultsFromWire(
  wire: Partial<WireMyResults> | null | undefined,
  asked: PerformanceRange,
): MyResults {
  const page = (list: StaffRecentList) => staffRecentPageFromWire(wire?.recent?.[list], list);
  return {
    ...personFromWire(wire, { ...asked, staffMemberId: '' }),
    recent: {
      orders: page('orders'),
      messages: page('messages'),
      bookings: page('bookings'),
      cash: page('cash'),
      calls: page('calls'),
    },
  };
}

/** Who, the dates, the figures and the chart: a person's page without its list. */
function personFromWire(
  wire:
    Partial<Pick<WirePersonPerformance, 'from' | 'to' | 'kpis' | 'dailySales'>> | null | undefined,
  asked: PerformanceRange & { readonly staffMemberId: string },
): Omit<StaffMemberPerformance, 'recent'> {
  const kpis = wire?.kpis;
  const daily: DailySales[] = (wire?.dailySales ?? []).flatMap((day) => {
    const date = text(day.date);
    return date === null
      ? []
      : [{ date: date.slice(0, 10), salesAmd: dram(day.salesAmd), tables: count(day.tables) }];
  });
  return {
    from: text(wire?.from) ?? asked.from,
    to: text(wire?.to) ?? asked.to,
    staffMemberId: text(kpis?.staffMemberId) ?? asked.staffMemberId,
    name: text(kpis?.name) ?? '',
    role: typeof kpis?.role === 'number' ? staffRole(kpis.role) : 'waiter',
    isActive: kpis?.isActive !== false,
    figures: figuresFromWire(kpis),
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * `GET /api/tabs/{tabId}/transfer-targets`'s items, in the server's order (on
 * shift first, then by name). A row with no id cannot be sent as a
 * `toStaffMemberId`, so it is dropped rather than shown.
 */
export function transferTargetsFromWire(
  wire: Partial<WireTransferTargetsView> | null | undefined,
): readonly TabTransferTarget[] {
  return (wire?.items ?? []).flatMap((item: Partial<WireTransferTarget>) => {
    const staffMemberId = text(item?.staffMemberId);
    if (staffMemberId === null) return [];
    return [
      {
        staffMemberId,
        name: text(item.name) ?? '',
        role: typeof item.role === 'number' ? staffRole(item.role) : 'waiter',
        onShiftNow: item.onShiftNow === true,
        openTables: count(item.openTables),
      },
    ];
  });
}

export function tabTransferFromWire(
  wire: Partial<WireTableTransferResult> | null | undefined,
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
    tableSessionId: text(wire?.tableSessionId),
    tableLabel: text(wire?.tableLabel),
    wasReplay: wire?.wasReplay === true,
  };
}

/** The claim's three fields, only when a claim was made: an unclaimed call carries none. */
export function serviceRequestClaimFromWire(
  wire:
    | Pick<
        Partial<Schemas['Yalla.Application.Ordering.ServiceRequestView']>,
        'claimedByStaffMemberId' | 'claimedByName' | 'claimedAtUtc'
      >
    | null
    | undefined,
): {
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
 * The feed's query string, every value a string: the day always; who (a
 * person's id, or `actorKind=system`), the category and the search only when
 * set; the cursor only after the first page, the page size with a page.
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
    ...(page ? { limit: String(page.limit ?? ACTIVITY_PAGE_SIZE) } : {}),
  };
}

/** `from` and `to`, the results' whole query. */
export function performanceParams(range: PerformanceRange): WireStaffPerformanceParams {
  return { from: range.from, to: range.to };
}

/** A person's page: the dates, and one list a page at a time. */
export function personPerformanceParams(
  range: PerformanceRange,
  list?: Pick<StaffRecentQuery, 'list' | 'cursor'>,
): WirePersonPerformanceParams {
  return {
    from: range.from,
    to: range.to,
    ...(list
      ? {
          list: list.list,
          limit: String(STAFF_RECENT_PAGE_SIZE),
          ...(list.cursor ? { cursor: list.cursor } : {}),
        }
      : {}),
  };
}

/** `GET /api/staff/me/performance`'s query: every value a string, as the server reads them. */
export function myPerformanceParams(query: MyPerformanceQuery): WireMyPerformanceParams {
  return {
    from: query.from,
    to: query.to,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.list ? { list: query.list } : {}),
    ...(query.limit !== undefined
      ? { limit: String(Math.min(100, Math.max(1, Math.round(query.limit)))) }
      : {}),
  };
}

/** `GET /api/staff/me/results`' query: every value a string; `limit` is per list. */
export function myResultsParams(query: MyResultsQuery): WireMyResultsParams {
  return {
    from: query.from,
    to: query.to,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.limit !== undefined
      ? { limit: String(Math.min(100, Math.max(1, Math.round(query.limit)))) }
      : {}),
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
