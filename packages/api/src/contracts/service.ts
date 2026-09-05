/**
 * The counter screen's contracts: table actions, the live sequence streams,
 * orders, service requests and money.
 *
 * These are the shapes the staff tablet needs to run a service. Three of the
 * groups below are wired to endpoints that exist today; the rest are declared
 * against the backend's own models and raise `EndpointNotWiredError` from the
 * HTTP gateway until the server ships them. That split is deliberate and is
 * recorded on each group, because the one thing this screen must never do is
 * present an invented number as a real one.
 */

import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';

// ---------------------------------------------------------------------------
// Table actions — wired
// ---------------------------------------------------------------------------

/**
 * The physical status the backend stores, which is *not* the derived state the
 * floor draws. `reservedSoon` is an overlay on a physically free table, so a
 * precondition captured from the drawn state would refuse to seat a table that
 * is merely booked later — exactly the case a waiter overrides most often.
 */
export type TableStatus = 'free' | 'held' | 'occupied' | 'outOfService';

/**
 * The eight transitions the backend exposes, named as the waiter's action
 * rather than as the state pair. A waiter taps "seat the held party", not
 * "held → occupied".
 */
export type TableActionKind =
  | 'seatWalkIn'
  | 'seatReservation'
  | 'seatHeldParty'
  | 'hold'
  | 'releaseHold'
  | 'freeTable'
  | 'outOfService'
  | 'returnToService';

/**
 * What the panel captured when it opened.
 *
 * `expectedFromStatus` is the precondition that actually exists: every
 * transition endpoint refuses a table that has moved on, and the 409 carries
 * both the attempted and the current status.
 *
 * `rowVersion` is captured too and is normally `null`, because the backend's
 * floor read model carries no version column. It is here rather than omitted so
 * that the day the server starts sending one, the queue is already storing it
 * and only the sender changes. A precondition the client invents would be
 * stricter than the server's, which this screen is not allowed to be.
 */
export interface TablePrecondition {
  readonly expectedFromStatus: TableStatus;
  readonly rowVersion: string | null;
}

export interface TableActionCommand {
  readonly kind: TableActionKind;
  readonly branchId: string;
  readonly tableId: string;
  /** Generated once per tap and reused on every retry. */
  readonly clientCommandId: string;
  /** Required by `seatWalkIn` and `seatHeldParty`. */
  readonly partySize?: number | undefined;
  /** Set when honouring a booking. */
  readonly reservationId?: string | undefined;
  /** Free text for the audit log. Never required of the waiter. */
  readonly reason?: string | undefined;
}

/**
 * A warning that accompanies a **successful** transition.
 *
 * Warnings never block. The waiter knows the 20:00 booking just phoned to
 * cancel; the system does not. Refusing here would teach the floor to work
 * around the tablet, which is how state goes stale.
 */
export type TableWarningCode = 'upcoming-reservation' | 'outstanding-balance' | (string & {});

export interface TableWarning {
  readonly code: TableWarningCode;
  /** The server's prose, kept as a fallback for a code we do not translate. */
  readonly message: string;
}

export interface TableActionResult {
  readonly branchId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly fromStatus: TableStatus;
  readonly toStatus: TableStatus;
  /** What to draw: `toStatus` with the reservation overlay applied. */
  readonly state: DerivedTableState;
  readonly tableSessionId: string | null;
  readonly reservationId: string | null;
  readonly tabId: string | null;
  readonly nextReservationStartUtc: string | null;
  readonly freeUntilUtc: string | null;
  readonly atUtc: string;
  readonly clientCommandId: string;
  /**
   * The command had already been applied and this is the original response
   * replayed from the audit log. The queue clears such an entry silently — it
   * is a success, not a duplicate to worry a waiter with.
   */
  readonly wasReplay: boolean;
  /** Money still owed, when the change left an unresolved tab behind. */
  readonly outstandingDram: number | null;
  readonly warnings: readonly TableWarning[];
}

/** The 409 payload, reshaped. Everything the two-conflict model branches on. */
export interface TableConflictState {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly attemptedFromStatus: TableStatus;
  readonly currentStatus: TableStatus;
  readonly currentSessionId: string | null;
  /** Who took it, when the server can say. Absent today; the copy degrades. */
  readonly changedBy?: string | undefined;
}

// ---------------------------------------------------------------------------
// The tab, for staff — partly wired
// ---------------------------------------------------------------------------

/**
 * The server's three settlement modes, named as the server names them.
 *
 * Renaming these to something shorter on the client is how a screen ends up
 * saying "even split" for a mode that means "anyone pays any amount".
 */
export type TabSettlementMode =
  'hostPaysEverything' | 'everyonePaysOwnItems' | 'anyonePaysAnyAmount';

/** `closing` means the bill has been asked for. It is not `closed`. */
export type StaffTabStatus = 'open' | 'closing' | 'closed' | 'abandoned';

export type TabParticipantStaffStatus = 'pendingApproval' | 'approved' | 'removed';

export interface TabTotals {
  readonly subtotalDram: number;
  readonly serviceChargeDram: number;
  readonly totalDram: number;
  readonly paidDram: number;
  /** The number a waiter reads at a glance. Rendered largest on the panel. */
  readonly remainingDram: number;
}

export interface TabStaffParticipant {
  readonly id: string;
  readonly displayName: string | null;
  readonly isHost: boolean;
  readonly status: TabParticipantStaffStatus;
  /** The host's flag: whether they may add items. Drives the order picker. */
  readonly canOrder: boolean;
}

/** What one person owes, from the server. The client never divides anything. */
export interface ParticipantShare {
  readonly participantId: string;
  readonly displayName: string | null;
  readonly shareDram: number;
  readonly paidDram: number;
  readonly remainingDram: number;
}

export type OrderLineStatus = 'active' | 'voided' | 'comped';

export interface TabLine {
  readonly id: string;
  readonly orderId: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceDram: number;
  readonly lineTotalDram: number;
  readonly note: string | null;
  /** Split across the whole table rather than charged to one person. */
  readonly isShared: boolean;
  /** `null` means the table, which is the ordering default. */
  readonly participantId: string | null;
  readonly status: OrderLineStatus;
  /** Present on a voided or comped line. Never blank — the server requires it. */
  readonly adjustmentReason: string | null;
  readonly placedAtUtc: string;
}

export interface StaffTab {
  readonly id: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly status: StaffTabStatus;
  readonly settlementMode: TabSettlementMode;
  readonly openedAtUtc: string;
  readonly closedAtUtc: string | null;
  readonly participants: readonly TabStaffParticipant[];
  readonly totals: TabTotals;
  /** Empty until the ordering endpoints ship; never faked to look populated. */
  readonly lines: readonly TabLine[];
  readonly shares: readonly ParticipantShare[];
}

// ---------------------------------------------------------------------------
// Orders — not wired
// ---------------------------------------------------------------------------

/**
 * The kitchen's four states, in the order they happen.
 *
 * A kitchen-role session sees exactly one transition of these, which is why
 * the order matters enough to export.
 */
export type OrderStatus = 'new' | 'inKitchen' | 'ready' | 'served';

export const ORDER_STATUS_FLOW: readonly OrderStatus[] = ['new', 'inKitchen', 'ready', 'served'];

/** The next status, or `null` at the end of the flow. */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const index = ORDER_STATUS_FLOW.indexOf(status);
  return index < 0 || index === ORDER_STATUS_FLOW.length - 1
    ? null
    : (ORDER_STATUS_FLOW[index + 1] ?? null);
}

export interface PlaceOrderLine {
  readonly menuItemId: string;
  readonly quantity: number;
  /** A short free-text modifier. Not a modifier system; see the README. */
  readonly note?: string | undefined;
  readonly isShared: boolean;
  /** `null` charges the table, which is the default and has a cost — see the UI. */
  readonly participantId: string | null;
}

export interface PlaceOrderCommand {
  readonly tabId: string;
  readonly clientCommandId: string;
  readonly lines: readonly PlaceOrderLine[];
  /** Who took the order. The server stamps it from the token; this is a hint. */
  readonly placedByStaffId?: string | undefined;
}

export interface OrderQueueLine {
  readonly name: string;
  readonly quantity: number;
  readonly note: string | null;
}

export interface OrderQueueEntry {
  readonly orderId: string;
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly status: OrderStatus;
  readonly placedAtUtc: string;
  readonly placedByName: string | null;
  /** Where the order came from. A diner-placed order reads differently. */
  readonly source: 'staff' | 'diner';
  readonly estimatedReadyAtUtc: string | null;
  readonly lines: readonly OrderQueueLine[];
}

export interface SetOrderStatusCommand {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly clientCommandId: string;
}

// ---------------------------------------------------------------------------
// Service requests — not wired
// ---------------------------------------------------------------------------

export type ServiceRequestReason = 'napkins' | 'water' | 'bill' | 'other';

export interface ServiceRequest {
  readonly id: string;
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly reason: ServiceRequestReason;
  readonly requestedAtUtc: string;
  readonly acknowledgedAtUtc: string | null;
}

export interface AcknowledgeServiceRequestCommand {
  readonly requestId: string;
  readonly clientCommandId: string;
}

// ---------------------------------------------------------------------------
// Money — not wired
// ---------------------------------------------------------------------------

/**
 * Void presets, plus `other` which requires typing.
 *
 * Presets rather than free text because a void reason typed at speed during a
 * rush is "asdf", and a reason nobody can read is a reason nobody recorded.
 */
export type VoidReason = 'wrongItem' | 'guestChangedMind' | 'kitchenError' | 'spilled' | 'other';

export const VOID_REASONS: readonly VoidReason[] = [
  'wrongItem',
  'guestChangedMind',
  'kitchenError',
  'spilled',
  'other',
];

export interface VoidLineCommand {
  readonly tabId: string;
  readonly lineId: string;
  readonly reason: VoidReason;
  /** Required when `reason` is `other`; ignored otherwise. */
  readonly detail?: string | undefined;
  readonly clientCommandId: string;
}

export interface CompCommand {
  readonly tabId: string;
  /** `null` comps the whole tab. Manager only, either way. */
  readonly lineId: string | null;
  readonly reason: string;
  readonly clientCommandId: string;
}

/**
 * A cash payment.
 *
 * `tipDram` is deliberately a separate field and never folded into `amountDram`
 * anywhere in this client: a tip added to the balance is how a tab looks
 * settled while money is still owed.
 */
export interface RecordCashPaymentCommand {
  readonly tabId: string;
  readonly amountDram: number;
  readonly tipDram: number;
  readonly clientCommandId: string;
  /** Set to settle one person's share rather than the table's balance. */
  readonly participantId?: string | undefined;
}

export interface PaymentResult {
  readonly paymentId: string;
  readonly tabId: string;
  readonly amountDram: number;
  readonly tipDram: number;
  readonly totals: TabTotals;
  /** True when this payment took the balance to zero and closed the tab. */
  readonly tabClosed: boolean;
  readonly wasReplay: boolean;
}

export interface AbandonTabCommand {
  readonly tabId: string;
  readonly reason: string;
  readonly clientCommandId: string;
}

export interface AbandonTabResult {
  readonly tabId: string;
  readonly writtenOffDram: number;
  readonly atUtc: string;
  readonly wasReplay: boolean;
}

// ---------------------------------------------------------------------------
// The sequence streams — not wired
// ---------------------------------------------------------------------------

/**
 * One incremental change to the floor.
 *
 * `sequence` is a per-branch monotonic counter. A client that has seen
 * sequence 40 and receives 42 knows it missed 41 and must refetch, which is the
 * only way to be sure the floor on the counter is not quietly wrong.
 */
export interface FloorChange {
  readonly sequence: number;
  readonly branchId: string;
  readonly tableId: string;
  readonly fromStatus: TableStatus;
  readonly toStatus: TableStatus;
  readonly state: DerivedTableState;
  readonly atUtc: string;
  readonly tabId: string | null;
  readonly tableSessionId: string | null;
  readonly partySize: number | null;
  readonly nextReservationStartUtc: string | null;
  /** For the "seated by Aram just now" message. Absent degrades to "someone". */
  readonly actorName?: string | undefined;
}

export interface FloorChangePage {
  readonly branchId: string;
  /** Highest sequence in this page, or the caller's own when empty. */
  readonly lastSequence: number;
  readonly changes: readonly FloorChange[];
}

export type TabEventKind =
  | 'opened'
  | 'participantJoined'
  | 'participantLeft'
  | 'orderPlaced'
  | 'orderStatusChanged'
  | 'lineVoided'
  | 'lineComped'
  | 'paymentRecorded'
  | 'closed';

export interface TabEvent {
  readonly sequence: number;
  readonly tabId: string;
  readonly kind: TabEventKind;
  readonly atUtc: string;
  /** Shape depends on `kind`. The panel refetches rather than reconstructing. */
  readonly data: Readonly<Record<string, unknown>> | null;
}

export interface TabEventPage {
  readonly tabId: string;
  readonly lastSequence: number;
  readonly events: readonly TabEvent[];
}

// ---------------------------------------------------------------------------
// The staff floor
// ---------------------------------------------------------------------------

/**
 * The staff-only detail behind one table, kept beside the plan rather than
 * inside it.
 *
 * {@link FloorPlanData} is the shape a diner's phone renders, and party sizes,
 * session ids and tab balances have no business in a payload that ships to a
 * stranger's browser. Keeping them in a parallel list means the renderer is
 * unchanged and there is no field to accidentally draw on the diner surface.
 */
export interface StaffTableDetail {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  /** The stored state, which is what a transition's precondition is against. */
  readonly physicalStatus: TableStatus;
  readonly currentSessionId: string | null;
  readonly seatedAtUtc: string | null;
  /** How many people sat down. Null when nobody has. */
  readonly partySize: number | null;
  readonly nextReservationId: string | null;
  readonly nextReservationStartUtc: string | null;
  /** Booked party size, when the server sends it. It does not today. */
  readonly nextReservationPartySize: number | null;
  /** Next booking's start less the branch turnaround. Null when nothing is booked. */
  readonly freeUntilUtc: string | null;
  /**
   * The open tab, when one is known.
   *
   * Null from a cold floor read against the real backend: the floor payload
   * carries a session id but no tab id, and there is no lookup by table. The
   * value is filled in from a transition result within a session, and the panel
   * simply omits the balance rather than inventing one when it is null.
   */
  readonly openTabId: string | null;
  /** Present when the server versions rows. It does not today. */
  readonly rowVersion: string | null;
}

/**
 * The room and the staff detail, together.
 *
 * One call, because the floor screen redraws both on every poll and two
 * requests would let them disagree by one tick.
 */
export interface StaffFloor {
  readonly plan: FloorPlanData;
  readonly details: readonly StaffTableDetail[];
  /**
   * The branch's sequence high-water mark at the moment this was read, so an
   * incremental poll can continue from it. Zero until the stream ships.
   */
  readonly lastSequence: number;
  /** The instant the derived states were computed for, per the server. */
  readonly asOfUtc: string;
}

/** The detail for one table, or undefined. Small enough to inline everywhere. */
export function tableDetail(
  floor: StaffFloor | null | undefined,
  tableId: string | null | undefined,
): StaffTableDetail | undefined {
  if (!floor || !tableId) return undefined;
  return floor.details.find((detail) => detail.tableId === tableId);
}
