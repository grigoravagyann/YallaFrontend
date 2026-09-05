import type { components } from '../generated/schema';
import type {
  AffectedReservation,
  PreconditionFailure,
  StaffTableDetail,
  StaffTabStatus,
  TabParticipantStaffStatus,
  SettlementMode,
  TableActionResult,
  TableConflictState,
  TableStatus,
  TableWarning,
  TabTotals,
} from '../contracts/service';
import type {
  AdjustmentKind,
  BranchMenu,
  FloorChange,
  FloorChangePage,
  OrderQueueEntry,
  OrderStatus,
  ParticipantShare,
  PaymentResult,
  PlaceOrderResult,
  ServiceRequest,
  ServiceRequestReason,
  SpiceLevel,
  StaffTab,
  TabAdjustment,
  TabEvent,
  TabEventActor,
  TabEventPage,
  TabEventType,
  TabLine,
  TabParticipantStatusCode,
  TabShares,
} from '../contracts/ordering';
import type { Menu } from '../contracts/menu';
import { derivedTableState } from './mapping';

type Schemas = components['schemas'];
type FloorState = Schemas['Yalla.Application.Floor.BranchFloorState'];
type ChangeResult = Schemas['Yalla.Application.Tables.TableStateChangeResult'];
type StaffView = Schemas['Yalla.Application.Tabs.TabStaffView'];
type KitchenOrder = Schemas['Yalla.Application.Ordering.KitchenOrderView'];
type OrderLine = Schemas['Yalla.Application.Ordering.OrderLineView'];
type OrderView = Schemas['Yalla.Application.Ordering.OrderView'];
type AdjustmentView = Schemas['Yalla.Application.Ordering.AdjustmentView'];
type ShareView = Schemas['Yalla.Application.Ordering.ParticipantShareView'];
type SharesView = Schemas['Yalla.Application.Ordering.TabSharesView'];
type CashView = Schemas['Yalla.Application.Ordering.CashPaymentView'];
type RequestView = Schemas['Yalla.Application.Ordering.ServiceRequestView'];
type MenuView = Schemas['Yalla.Application.Menus.BranchMenuView'];
type TotalsSnapshot = Schemas['Yalla.Application.Ordering.TabTotalsSnapshot'];
type TotalsView = Schemas['Yalla.Application.Tabs.TabTotalsView'];
type ChangePage = Schemas['Yalla.Application.Floor.BranchChangePage'];
type EventPage = Schemas['Yalla.Application.Ordering.TabEventPage'];

/**
 * Wire shapes to counter-screen shapes.
 *
 * Separate from `mapping.ts` because that file is on the diner's critical path
 * and nothing about voids and balances belongs in the bundle a stranger's phone
 * downloads.
 *
 * Every function here is the single place one wire field becomes one client
 * field, which is what makes `pnpm api:generate` a compiler-checked step rather
 * than an afternoon of `undefined`. Where a client field has no wire field, the
 * mapper says so at the point of the gap rather than leaving a screen to
 * discover it.
 */

// --- Enums ------------------------------------------------------------------

/**
 * Values: 1 Free, 2 Held, 4 Occupied, 5 OutOfService.
 *
 * There is no 3. It was `Reserved` and the backend retired it permanently once
 * "reserved" became a derived overlay rather than a stored state, so a client
 * that maps 3 to anything is resurrecting a bug the server already fixed.
 */
const TABLE_STATUS: Readonly<Record<number, TableStatus>> = {
  1: 'free',
  2: 'held',
  4: 'occupied',
  5: 'outOfService',
};

export function tableStatus(value: number): TableStatus {
  // Out of service is the safe default: it is the one status from which no
  // transition seats anybody, so an unknown value cannot put a party in a chair.
  return TABLE_STATUS[value] ?? 'outOfService';
}

/** Values: 1 Open, 2 Closing, 3 Closed, 4 Abandoned. */
const TAB_STATUS: Readonly<Record<number, StaffTabStatus>> = {
  1: 'open',
  2: 'closing',
  3: 'closed',
  4: 'abandoned',
};

/** Values: 1 HostPaysEverything, 2 EveryonePaysOwnItems, 3 AnyonePaysAnyAmount. */
const SETTLEMENT_MODE: Readonly<Record<number, SettlementMode>> = {
  1: 'hostPaysEverything',
  2: 'everyonePaysOwnItems',
  3: 'anyonePaysAnyAmount',
};

/** Values: 1 PendingApproval, 2 Approved, 3 Removed. */
const PARTICIPANT_STATUS: Readonly<Record<number, TabParticipantStaffStatus>> = {
  1: 'pendingApproval',
  2: 'approved',
  3: 'removed',
};

/** Values: 1 New, 2 InKitchen, 3 Ready, 4 Served, 5 Voided. */
const ORDER_STATUS: Readonly<Record<number, OrderStatus>> = {
  1: 'new',
  2: 'inKitchen',
  3: 'ready',
  4: 'served',
  5: 'voided',
};

export function orderStatus(value: number): OrderStatus {
  return ORDER_STATUS[value] ?? 'new';
}

/** The wire value for a client status, for the queue filter and the rail. */
const ORDER_STATUS_CODE: Readonly<Record<OrderStatus, 1 | 2 | 3 | 4 | 5>> = {
  new: 1,
  inKitchen: 2,
  ready: 3,
  served: 4,
  voided: 5,
};

export function orderStatusCode(status: OrderStatus): 1 | 2 | 3 | 4 | 5 {
  return ORDER_STATUS_CODE[status];
}

/** Values: 1 Napkins, 2 Water, 3 TheBill, 4 Other. */
const SERVICE_PRESET: Readonly<Record<number, ServiceRequestReason>> = {
  1: 'napkins',
  2: 'water',
  3: 'bill',
  4: 'other',
};

/** Values: 1 Discount, 2 Comp. */
const ADJUSTMENT_KIND: Readonly<Record<number, AdjustmentKind>> = { 1: 'discount', 2: 'comp' };

export function adjustmentKindCode(kind: AdjustmentKind): 1 | 2 {
  return kind === 'discount' ? 1 : 2;
}

/** Values: 0 NotSpicy, 1 Mild, 2 Medium, 3 Hot. */
const SPICE: Readonly<Record<number, SpiceLevel>> = {
  0: 'notSpicy',
  1: 'mild',
  2: 'medium',
  3: 'hot',
};

/** Values: 1 Diner, 2 Staff, 3 System. */
const ACTOR: Readonly<Record<number, TabEventActor>> = { 1: 'diner', 2: 'staff', 3: 'system' };

/** Values: 1 PendingApproval, 2 Approved, 3 Removed, on a share row. */
const SHARE_STATUS: Readonly<Record<number, TabParticipantStatusCode>> = {
  1: 'pendingApproval',
  2: 'approved',
  3: 'removed',
};

/**
 * `Yalla.Domain.Enums.TabEventType`, 1–20, in the order the backend pins them.
 *
 * An unrecognised value maps to `unknown` rather than throwing, because the
 * backend's own contract says a client must ignore a type it does not know and
 * keep its sequence position. A new type on the server must not break a build
 * already installed on somebody's tablet.
 */
const TAB_EVENT_TYPES: readonly TabEventType[] = [
  'tabOpened',
  'participantJoined',
  'participantApproved',
  'participantRejected',
  'participantRemoved',
  'participantPermissionsChanged',
  'participantRenamed',
  'hostReassigned',
  'settlementModeChanged',
  'orderPlaced',
  'orderStatusChanged',
  'lineVoided',
  'adjustmentAdded',
  'adjustmentVoided',
  'paymentRecorded',
  'serviceRequested',
  'serviceRequestAcknowledged',
  'tabClosing',
  'tabClosed',
  'tabAbandoned',
];

// --- Floor ------------------------------------------------------------------

/**
 * The staff-only detail behind each table.
 *
 * `openTabId` and `rowVersion` are both real since Backend 8b, and both matter
 * more than they look. The first is why the tab panel opens on a cold load
 * rather than only on a table this device happened to seat; the second is the
 * only thing that can tell a waiter their queued command landed on a sitting
 * that has already ended.
 */
export function staffFloorDetails(state: FloorState): readonly StaffTableDetail[] {
  return state.tables.map((table) => ({
    tableId: table.tableId,
    label: table.label,
    seats: table.seats,
    physicalStatus: tableStatus(table.physicalStatus),
    currentSessionId: table.currentSessionId ?? null,
    seatedAtUtc: table.seatedAtUtc ?? null,
    partySize: table.partySize ?? null,
    nextReservationId: table.nextReservationId ?? null,
    nextReservationStartUtc: table.nextReservationStartUtc ?? null,
    // Still not on the floor payload. The panel shows the booked time and no
    // party size, rather than showing the party sitting there as the one booked.
    nextReservationPartySize: null,
    freeUntilUtc: table.freeUntilUtc ?? null,
    openTabId: table.openTabId ?? null,
    rowVersion: table.rowVersion,
  }));
}

// --- Transitions ------------------------------------------------------------

function warnings(source: ChangeResult['warnings']): readonly TableWarning[] {
  return (source ?? []).map((warning) => ({
    code: warning.code,
    message: warning.message,
  }));
}

export function affectedReservation(
  source: Schemas['Yalla.Application.Tables.AffectedReservation'],
): AffectedReservation {
  return {
    reservationId: source.reservationId,
    code: source.code,
    guestName: source.guestName,
    guestPhone: source.guestPhone,
    partySize: source.partySize,
    startUtc: source.startUtc,
    localDate: source.localDate,
    localStartTime: source.localStartTime,
  };
}

export function tableActionResult(result: ChangeResult): TableActionResult {
  return {
    branchId: result.branchId,
    tableId: result.tableId,
    tableLabel: result.tableLabel,
    fromStatus: tableStatus(result.fromStatus),
    toStatus: tableStatus(result.toStatus),
    state: derivedTableState(result.state),
    tableSessionId: result.tableSessionId ?? null,
    reservationId: result.reservationId ?? null,
    tabId: result.tabId ?? null,
    nextReservationStartUtc: result.nextReservationStartUtc ?? null,
    freeUntilUtc: result.freeUntilUtc ?? null,
    atUtc: result.atUtc,
    clientCommandId: result.clientCommandId,
    wasReplay: result.wasReplay,
    outstandingDram: result.outstandingAmd ?? null,
    warnings: warnings(result.warnings),
    affectedReservations: (result.affectedReservations ?? []).map(affectedReservation),
  };
}

/** Values: 1 StatusChanged, 2 TableChangedAndChangedBack. */
const PRECONDITION_FAILURE: Readonly<Record<number, PreconditionFailure>> = {
  1: 'statusChanged',
  2: 'tableChangedAndChangedBack',
};

/**
 * The 409 body's `context`, reshaped.
 *
 * Returns `null` rather than a partly-filled object when the payload is not the
 * table conflict we expect. A conflict screen that says a table is `free`
 * because a field was missing is worse than one that says it cannot tell.
 *
 * `failure` is present on `precondition-failed` and absent on the plain
 * `table-state-conflict` a live race produces, and the difference is load
 * bearing: it is what lets the conflict list say "the table has been used since
 * you tapped" rather than only "the table changed".
 */
export function tableConflictFrom(
  context: Readonly<Record<string, unknown>> | null | undefined,
): TableConflictState | null {
  if (!context) return null;

  const tableId = context['tableId'];
  const currentStatus = context['currentStatus'];
  if (typeof tableId !== 'string') return null;

  // The server serialises the enum as a number; a future text serialiser would
  // send the name. Accept both rather than breaking on a serialiser setting.
  const current =
    typeof currentStatus === 'number'
      ? tableStatus(currentStatus)
      : typeof currentStatus === 'string'
        ? currentStatus.charAt(0).toLowerCase() + currentStatus.slice(1)
        : undefined;
  if (current === undefined) return null;

  // `expectedFromStatus` on a precondition failure, `attemptedFromStatus` on the
  // live-race conflict. Both mean "what the waiter was looking at".
  const attempted = context['expectedFromStatus'] ?? context['attemptedFromStatus'];
  const attemptedStatus =
    typeof attempted === 'number'
      ? tableStatus(attempted)
      : typeof attempted === 'string'
        ? attempted.charAt(0).toLowerCase() + attempted.slice(1)
        : 'free';

  const changedBy = context['changedByName'] ?? context['actorName'];
  const failure = context['failure'];

  return {
    tableId,
    tableLabel: typeof context['tableLabel'] === 'string' ? context['tableLabel'] : '',
    attemptedFromStatus: attemptedStatus as TableStatus,
    currentStatus: current as TableStatus,
    currentSessionId:
      typeof context['currentSessionId'] === 'string' ? context['currentSessionId'] : null,
    failure: typeof failure === 'number' ? (PRECONDITION_FAILURE[failure] ?? null) : null,
    ...(typeof changedBy === 'string' ? { changedBy } : {}),
  };
}

// --- The branch change stream -------------------------------------------------

export function floorChangePage(page: ChangePage): FloorChangePage {
  return {
    branchId: page.branchId,
    lastSequence: page.maxSequence,
    hasMore: page.hasMore,
    changes: page.changes.map((change): FloorChange => ({
      sequence: change.sequence,
      tableId: change.diningTableId,
      tableLabel: change.tableLabel,
      fromStatus: tableStatus(change.fromStatus),
      toStatus: tableStatus(change.toStatus),
      atUtc: change.atUtc,
      tableSessionId: change.tableSessionId ?? null,
      reservationId: change.reservationId ?? null,
      actor: ACTOR[change.actorType] ?? 'system',
      actorId: change.actorId ?? null,
      reason: change.reason,
    })),
  };
}

// --- Money --------------------------------------------------------------------

export function totals(snapshot: TotalsSnapshot | TotalsView): TabTotals {
  return {
    subtotalDram: snapshot.subtotalAmd,
    serviceChargeDram: snapshot.serviceChargeAmd,
    totalDram: snapshot.totalAmd,
    paidDram: snapshot.paidAmd,
    remainingDram: snapshot.remainingAmd,
  };
}

/**
 * The branch's service-charge percentage, worked back out of the totals.
 *
 * Not on any wire shape the counter screen can read. Returned as `null` rather
 * than `0` when there is nothing to derive it from: a zero would render a
 * service-charge line claiming the venue charges nothing, which is a different
 * and wrong statement.
 */
export function serviceChargePercentFrom(source: TabTotals): number | null {
  if (source.subtotalDram <= 0) return null;
  return Math.round((source.serviceChargeDram / source.subtotalDram) * 1000) / 10;
}

// --- Lines ---------------------------------------------------------------------

/**
 * One order line.
 *
 * The status is **inferred**, and this is the only place it happens. No read
 * model carries a void flag; the server zeroes `lineTotalAmd` for a voided line
 * while `unitPriceAmd` and `quantity` keep their order-time snapshots, so a
 * positive gross with a zero total is a void and nothing else produces that.
 * A genuinely free item has a zero unit price and reads as active, correctly.
 */
export function tabLine(
  line: OrderLine,
  order: { readonly orderId: string; readonly placedAtUtc: string; readonly status: number },
): TabLine {
  const gross = line.unitPriceAmd * line.quantity;
  return {
    id: line.lineId,
    orderId: order.orderId,
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    unitPriceDram: line.unitPriceAmd,
    lineTotalDram: line.lineTotalAmd,
    note: line.note ?? null,
    isShared: line.isShared,
    isTableAttributed: line.isTableAttributed,
    // `OrderLineView` names neither. See the contract.
    participantId: null,
    orderedByName: null,
    sharedWithCount: line.sharedWithParticipantIds.length,
    status: gross > 0 && line.lineTotalAmd === 0 ? 'voided' : 'active',
    // Stored on `TabOrderLine`, projected into nothing. See `contracts/ordering.ts`.
    voidReason: null,
    voidedByName: null,
    placedAtUtc: order.placedAtUtc,
    orderStatus: orderStatus(order.status),
  };
}

export function tabLinesFromOrders(
  orders: readonly KitchenOrder[],
  tabId: string,
): readonly TabLine[] {
  return orders
    .filter((order) => order.tabId === tabId)
    .flatMap((order) =>
      order.lines.map((line) =>
        tabLine(line, {
          orderId: order.orderId,
          placedAtUtc: order.placedAtUtc,
          status: order.status,
        }),
      ),
    )
    .sort((a, b) => a.placedAtUtc.localeCompare(b.placedAtUtc));
}

export function orderQueueEntry(order: KitchenOrder): OrderQueueEntry {
  return {
    orderId: order.orderId,
    tabId: order.tabId,
    tableLabel: order.tableLabel,
    status: orderStatus(order.status),
    placedAtUtc: order.placedAtUtc,
    estimatedReadyAtUtc: order.estimatedReadyAtUtc ?? null,
    waitingMinutes: order.waitingMinutes,
    lines: order.lines.map((line) => ({
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      note: line.note ?? null,
    })),
  };
}

export function placeOrderResult(view: OrderView): PlaceOrderResult {
  return {
    orderId: view.orderId,
    tabId: view.tabId,
    status: orderStatus(view.status),
    placedAtUtc: view.placedAtUtc,
    estimatedReadyAtUtc: view.estimatedReadyAtUtc ?? null,
    wasReplay: view.wasReplay,
    totals: totals(view.totals),
  };
}

export function adjustment(view: AdjustmentView): TabAdjustment {
  return {
    id: view.adjustmentId,
    kind: ADJUSTMENT_KIND[view.kind] ?? 'discount',
    lineId: view.tabOrderLineId ?? null,
    percent: view.percent ?? null,
    amountDram: view.amountAmd ?? null,
    reductionDram: view.reductionAmd,
    reason: view.reason,
    isVoided: view.isVoided,
    // `AdjustmentView` carries no actor, so the panel names nobody.
    byName: null,
    atUtc: view.createdAtUtc,
  };
}

export function participantShare(
  view: ShareView,
  hostParticipantId: string | null,
): ParticipantShare {
  return {
    participantId: view.participantId,
    displayName: view.displayName,
    isHost: hostParticipantId !== null && view.participantId === hostParticipantId,
    status: SHARE_STATUS[view.status] ?? 'approved',
    ownItemsDram: view.ownItemsAmd,
    sharedItemsDram: view.sharedItemsAmd,
    absorbedFromRemovedDram: view.absorbedFromRemovedAmd,
    personalDram: view.personalAmd,
    serviceChargeDram: view.serviceChargeAmd,
    shareDram: view.shareAmd,
    paidDram: view.paidAmd,
  };
}

/**
 * The shares projection, with the hidden case as its own branch.
 *
 * `tableTotalVisible: false` means `totals` and `shares` are **absent from the
 * body** — not zero, not null-as-free. Narrowing is the only way to reach the
 * aggregate, so no screen can render a hidden total as a settled bill by
 * forgetting a check.
 */
export function tabShares(view: SharesView, hostParticipantId: string | null = null): TabShares {
  const mine = view.myShare ? participantShare(view.myShare, hostParticipantId) : null;

  if (!view.tableTotalVisible || !view.totals) {
    return {
      kind: 'yourShareOnly',
      tabId: view.tabId,
      absorbedFromRemovedDram: view.absorbedFromRemovedAmd,
      yourShare: mine,
    };
  }

  return {
    kind: 'table',
    tabId: view.tabId,
    totals: totals(view.totals),
    absorbedFromRemovedDram: view.absorbedFromRemovedAmd,
    shares: (view.shares ?? []).map((share) => participantShare(share, hostParticipantId)),
    yourShare: mine,
  };
}

export function paymentResult(view: CashView): PaymentResult {
  return {
    paymentId: view.paymentId,
    tabId: view.tabId,
    amountDram: view.amountAmd,
    tipDram: view.tipAmd,
    totals: totals(view.totals),
    tabClosed: view.tabClosed,
    tableSessionClosed: view.tableSessionClosed,
    wasReplay: view.wasReplay,
  };
}

// --- Service requests -----------------------------------------------------------

export function serviceRequest(view: RequestView): ServiceRequest {
  return {
    id: view.serviceRequestId,
    tabId: view.tabId,
    tableLabel: view.tableLabel,
    reason: SERVICE_PRESET[view.preset] ?? 'other',
    note: view.note ?? null,
    requestedAtUtc: view.createdAtUtc,
    waitingMinutes: view.waitingMinutes,
    acknowledgedAtUtc: view.acknowledgedAtUtc ?? null,
  };
}

// --- The menu --------------------------------------------------------------------

export function branchMenu(view: MenuView, fetchedAtUtc: string): BranchMenu {
  return {
    branchId: view.branchId,
    fetchedAtUtc,
    categories: [...view.categories]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((category) => ({
        id: category.id,
        name: category.name,
        displayOrder: category.displayOrder,
        items: [...category.items]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item) => ({
            id: item.id,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description,
            priceDram: item.priceAmd,
            photoUrl: item.photoUrl || null,
            ingredients: item.ingredients,
            allergens: item.allergens,
            portionSize: item.portionSize,
            spiceLevel: SPICE[item.spiceLevel] ?? 'notSpicy',
            prepMinutes: item.prepMinutes,
            isAvailable: item.isAvailable,
            displayOrder: item.displayOrder,
          })),
      })),
  };
}

/** The narrower shape order entry renders. Same source, fewer fields. */
export function menuFrom(view: MenuView, fetchedAtUtc: string): Menu {
  const full = branchMenu(view, fetchedAtUtc);
  return {
    branchId: full.branchId,
    updatedAtUtc: full.fetchedAtUtc,
    sections: full.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || null,
        priceDram: item.priceDram,
        isAvailable: item.isAvailable,
      })),
    })),
  };
}

// --- Tabs -------------------------------------------------------------------

/**
 * The staff tab view.
 *
 * `lines` arrive separately, from the branch order queue filtered to this tab,
 * because nothing staff-readable returns a tab's lines. `linesKnown` and
 * `adjustmentsKnown` say which of the two lists were actually fetched, so the
 * panel can distinguish "nothing was ordered" from "not read", which are two
 * very different things to tell somebody holding a bill.
 */
export function staffTabFromView(
  view: StaffView,
  extra: {
    readonly lines?: readonly TabLine[] | undefined;
    readonly linesKnown?: boolean | undefined;
    readonly adjustments?: readonly TabAdjustment[] | undefined;
  } = {},
): StaffTab {
  const tabTotals = totals(view.totals);

  return {
    id: view.tabId,
    branchId: view.branchId,
    tableId: view.diningTableId,
    tableLabel: view.tableLabel,
    status: TAB_STATUS[view.status] ?? 'open',
    settlementMode: SETTLEMENT_MODE[view.settlementMode] ?? 'hostPaysEverything',
    settlementModeLocked: view.settlementModeLocked,
    openedAtUtc: view.openedAtUtc,
    closedAtUtc: view.closedAtUtc ?? null,
    hostParticipantId: view.hostParticipantId ?? null,
    participants: view.participants.map((participant) => ({
      id: participant.participantId,
      displayName: participant.displayName || null,
      isHost: participant.participantId === view.hostParticipantId,
      status: PARTICIPANT_STATUS[participant.status] ?? 'approved',
      canOrder: participant.canOrder,
      canOrderNow: participant.canOrderNow,
      canSeeTableTotal: participant.canSeeTableTotal,
    })),
    totals: tabTotals,
    serviceChargePercent: serviceChargePercentFrom(tabTotals),
    lines: extra.lines ?? [],
    linesKnown: extra.linesKnown ?? false,
    adjustments: extra.adjustments ?? [],
    // Nothing lists a tab's adjustments back. Always false; see the contract.
    adjustmentsKnown: false,
  };
}

// --- The tab event stream ----------------------------------------------------

export function tabEventPage(page: EventPage): TabEventPage {
  return {
    tabId: page.tabId,
    lastSequence: page.maxSequence,
    hasMore: page.hasMore,
    events: page.events.map((event): TabEvent => ({
      sequence: event.sequence,
      tabId: page.tabId,
      type: TAB_EVENT_TYPES[event.type - 1] ?? 'unknown',
      actor: ACTOR[event.actorType] ?? 'system',
      actorId: event.actorId ?? null,
      // No view turns a staff id into a name; the copy degrades to "staff".
      actorName: null,
      atUtc: event.atUtc,
      data:
        typeof event.payload === 'object' && event.payload !== null
          ? (event.payload as Record<string, unknown>)
          : null,
    })),
  };
}
