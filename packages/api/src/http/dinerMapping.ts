import type { components } from '../generated/schema';
import type { SettlementMode } from '../contracts/service';
import type {
  DinerTabAdjustment,
  DinerTabLine,
  DinerTabMe,
  DinerTabView,
  TabMoney,
  TabParticipantStatusCode,
  TabRosterEntry,
} from '../contracts/ordering';
import type { TabParticipantChange, TabParticipantRole } from '../contracts/tab';
import type { Booking } from '../contracts/booking';
import type { ReservationState, ReservationStatusCode } from '../contracts/push';
import { orderStatus, totals } from './staffMapping';

type Schemas = components['schemas'];
type TabView = Schemas['Yalla.Application.Tabs.TabView'];
type LineView = Schemas['Yalla.Application.Tabs.TabLineView'];
type ParticipantView = Schemas['Yalla.Application.Tabs.TabParticipantView'];
type ParticipantSummary = Schemas['Yalla.Application.Tabs.TabParticipantSummary'];
type AdjustmentView = Schemas['Yalla.Application.Tabs.TabAdjustmentView'];

/**
 * The diner's tab, from the wire.
 *
 * Split out from `staffMapping.ts` for one reason: the two tab reads are
 * **different endpoints returning different shapes**. `TabStaffView` carries
 * every participant's flags and an unconditional total; `TabView` carries the
 * caller's own row, two line arrays and an aggregate that is absent when the
 * host hid it. They are not two spellings of one view and a shared mapper had
 * to `null` its way through the difference.
 *
 * The shares, event-page, menu, service-request and participant-share mappers
 * are genuinely shared — one endpoint, one response, two callers — and are
 * imported from `staffMapping.ts` rather than copied. (That file's name is now
 * a half-truth; its header says it exists to keep balances out of the diner
 * bundle, which stopped being true the moment the diner got a bill.)
 */

// --- Enums ------------------------------------------------------------------

/** `ParticipantRole`: 1 Host, 2 Guest. */
const ROLE: Readonly<Record<number, TabParticipantRole>> = { 1: 'host', 2: 'guest' };

/** `ParticipantStatus`: 1 PendingApproval, 2 Approved, 3 Removed. */
const STATUS: Readonly<Record<number, TabParticipantStatusCode>> = {
  1: 'pendingApproval',
  2: 'approved',
  3: 'removed',
};

/** `TabStatus`: 1 Open, 2 Closing, 3 Closed, 4 Abandoned. */
const TAB_STATUS: Readonly<Record<number, DinerTabView['status']>> = {
  1: 'open',
  2: 'closing',
  3: 'closed',
  4: 'abandoned',
};

/**
 * `SettlementMode`: 1 HostPaysEverything, 2 EveryonePaysOwnItems,
 * 3 AnyonePaysAnyAmount.
 *
 * Named as the server names them. Mode 3 is *not* an even split, and a client
 * that shortens it to one says the wrong thing about who owes what.
 */
const SETTLEMENT_MODE: Readonly<Record<number, SettlementMode>> = {
  1: 'hostPaysEverything',
  2: 'everyonePaysOwnItems',
  3: 'anyonePaysAnyAmount',
};

const SETTLEMENT_MODE_CODE: Readonly<Record<SettlementMode, 1 | 2 | 3>> = {
  hostPaysEverything: 1,
  everyonePaysOwnItems: 2,
  anyonePaysAnyAmount: 3,
};

/** The wire value for a mode, for the one endpoint that sets it. */
export function settlementModeCode(mode: SettlementMode): 1 | 2 | 3 {
  return SETTLEMENT_MODE_CODE[mode];
}

// --- Lines ------------------------------------------------------------------

/**
 * One line, everything the wire carries.
 *
 * A voided line **arrives** — the server keeps it in both arrays with
 * `isVoided`, its reason and when, worth zero — so it is carried, marked, and
 * the bill draws it struck through with the reason. It used to be dropped here
 * and drawn as a live `0 ֏` item, exactly like something free.
 */
export function dinerTabLine(view: LineView): DinerTabLine {
  return {
    id: view.lineId,
    orderId: view.orderId,
    menuItemId: view.menuItemId,
    name: view.name,
    quantity: view.quantity,
    unitPriceDram: view.unitPriceAmd,
    lineTotalDram: view.lineTotalAmd,
    isShared: view.isShared,
    participantId: view.placedByParticipantId ?? null,
    orderedByName: view.placedByDisplayName ?? null,
    note: view.note ?? null,
    orderStatus: orderStatus(view.orderStatus),
    sharedWithCount: view.sharedWithCount,
    isVoided: view.isVoided,
    voidReason: view.voidReason ?? null,
    voidedAtUtc: view.voidedAtUtc ?? null,
  };
}

/** A comp or discount, with the reason the manager typed. `AdjustmentKind`: 1 Discount, 2 Comp. */
export function dinerAdjustment(view: AdjustmentView): DinerTabAdjustment {
  return {
    id: view.adjustmentId,
    kind: view.kind === 2 ? 'comp' : 'discount',
    lineId: view.lineId ?? null,
    percent: view.percent ?? null,
    amountDram: view.amountAmd ?? null,
    reductionDram: view.reductionAmd,
    reason: view.reason,
    isVoided: view.isVoided,
    atUtc: view.appliedAtUtc,
  };
}

/** What a host action left one participant as. */
export function participantChange(view: ParticipantView): TabParticipantChange {
  return {
    participantId: view.participantId,
    displayName: view.displayName,
    role: ROLE[view.role] ?? 'guest',
    status: STATUS[view.status] ?? 'pendingApproval',
    permissions: {
      canOrder: view.canOrder,
      canSeeTableTotal: view.canSeeTableTotal,
      canPay: view.canPay,
    },
  };
}

function me(view: ParticipantView): DinerTabMe {
  return {
    participantId: view.participantId,
    displayName: view.displayName,
    role: ROLE[view.role] ?? 'guest',
    status: STATUS[view.status] ?? 'pendingApproval',
    canOrder: view.canOrder,
    canOrderNow: view.canOrderNow,
    canPay: view.canPay,
    canSeeTableTotal: view.canSeeTableTotal,
    joinedAtUtc: view.joinedAtUtc,
  };
}

function rosterEntry(view: ParticipantSummary): TabRosterEntry {
  return {
    participantId: view.participantId,
    displayName: view.displayName,
    role: ROLE[view.role] ?? 'guest',
    status: STATUS[view.status] ?? 'pendingApproval',
  };
}

/**
 * The money, narrowed on the flag and never on presence.
 *
 * `tableTotalVisible` is the server's own statement of which branch this is.
 * `tableTotal` is absent from the body when it is false — but the generated
 * type is `?: T | null`, because OpenAPI cannot express "absent exactly when
 * that boolean is false". Testing presence instead would work today and would
 * silently start showing hidden totals the day anything changes the serializer.
 *
 * The `&& view.tableTotal` is a type guard, not a second condition: a body that
 * claims visibility and omits the aggregate is malformed, and rendering the
 * own-items branch is the safe reading of it.
 */
export function tabMoney(view: TabView): TabMoney {
  if (view.tableTotalVisible && view.tableTotal) {
    return { kind: 'table', bill: totals(view.tableTotal) };
  }
  return { kind: 'ownItemsOnly', yourItemsSubtotalDram: view.myItemsSubtotalAmd };
}

/**
 * The whole tab.
 *
 * `fetchedAtUtc` is the caller's clock, passed in rather than read here so the
 * mapper stays pure and a test can pin it. `TabView` carries no server
 * timestamp for "as of", and inventing one from `openedAtUtc` would put a stale
 * banner an evening out of date.
 */
export function dinerTab(view: TabView, fetchedAtUtc: string): DinerTabView {
  return {
    tabId: view.tabId,
    branchId: view.branchId,
    venueName: view.venueName,
    branchName: view.branchName,
    timeZoneId: view.timeZoneId,
    tableLabel: view.tableLabel,
    status: TAB_STATUS[view.status] ?? 'open',
    settlementMode: SETTLEMENT_MODE[view.settlementMode] ?? 'hostPaysEverything',
    settlementModeLocked: view.settlementModeLocked,
    hostParticipantId: view.hostParticipantId ?? null,
    hideTotalFromGuests: view.hideTotalFromGuests,
    me: me(view.me),
    participants: view.participants.map(rosterEntry),
    myLines: view.myLines.map(dinerTabLine),
    // Absent, not empty. `null` is "you are not shown the table's items"; `[]`
    // would be "the table has ordered nothing", and a screen cannot tell those
    // apart once they are the same value.
    tableLines:
      view.tableTotalVisible && view.tableLines ? view.tableLines.map(dinerTabLine) : null,
    money: tabMoney(view),
    // For everyone, hidden total or not: the rate is a fact about the venue,
    // not an aggregate of the table.
    serviceChargePercent: view.serviceChargePercent,
    adjustments: view.adjustments.map(dinerAdjustment),
    // Where the event stream stands, so the live bill can start reading from
    // here instead of never starting at all.
    maxSequence: view.maxSequence,
    openedAtUtc: view.openedAtUtc,
    closedAtUtc: view.closedAtUtc ?? null,
    fetchedAtUtc,
  };
}

// --- Reservations, for the notification actions ------------------------------

type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];

/**
 * `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed,
 * 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow.
 *
 * **There is no 3.** It is a retired member, exactly like `TableStatus`'s, and a
 * client that maps it to anything is resurrecting a state the server removed.
 * Anything unrecognised becomes `unknown`, which every caller treats as "do not
 * offer an action" — the safe reading when a newer server knows something this
 * build does not.
 */
const RESERVATION_STATUS: Readonly<Record<number, ReservationStatusCode>> = {
  1: 'pendingApproval',
  2: 'confirmed',
  4: 'seated',
  5: 'completed',
  6: 'cancelledByDiner',
  7: 'cancelledByVenue',
  8: 'noShow',
};

export function reservationStatus(value: number): ReservationStatusCode {
  return RESERVATION_STATUS[value] ?? 'unknown';
}

/**
 * A booking, from the one reservation shape the wire has.
 *
 * `venueName` is passed in because `ReservationView` does not carry it; the
 * gateway supplies it from the browse list when it has one, and `null` when it
 * does not — the branch name is always there to say where.
 */
export function booking(view: ReservationViewWire, venueName: string | null): Booking {
  return {
    id: view.id,
    code: view.code,
    status: reservationStatus(view.status),
    venueName,
    branchId: view.branchId,
    branchName: view.branchName,
    timeZoneId: view.timeZoneId,
    tableId: view.tableId,
    tableLabel: view.tableLabel,
    partySize: view.partySize,
    slotUtc: view.startUtc,
    endUtc: view.endUtc,
    freeCancellationUntilUtc: view.cancellationDeadlineUtc,
    cancelledAtUtc: view.cancelledAtUtc ?? null,
    cancelledAfterDeadline: view.cancelledAfterDeadline,
    manageToken: view.manageToken ?? null,
  };
}

export function reservationState(view: ReservationViewWire): ReservationState {
  return {
    reservationId: view.id,
    code: view.code,
    status: reservationStatus(view.status),
    branchId: view.branchId,
    branchName: view.branchName,
    tableLabel: view.tableLabel,
    partySize: view.partySize,
    startUtc: view.startUtc,
    endUtc: view.endUtc,
    localDate: view.localDate,
    localStartTime: view.localStartTime,
    timeZoneId: view.timeZoneId,
    cancelledAtUtc: view.cancelledAtUtc ?? null,
    cancelledAfterDeadline: view.cancelledAfterDeadline,
  };
}
