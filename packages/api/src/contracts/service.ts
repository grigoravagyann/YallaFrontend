/**
 * The counter screen's contracts, for the endpoints the backend has shipped.
 *
 * Everything here is a rename of something the generated OpenAPI document
 * already describes — the eight table transitions, the derived floor, a tab's
 * totals and participants — so these shapes are checked against
 * `generated/schema.ts` by `http/staffMapping.ts` and cannot drift silently.
 *
 * Everything **guessed** against an endpoint that does not exist yet lives in
 * `contracts/unshipped.ts`, alone, so that swapping in generated types later is
 * one module changing. That file imports from this one and never the reverse:
 * guesses may depend on knowns, not the other way round.
 */

import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';

// ---------------------------------------------------------------------------
// Table actions
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
// The tab, as the shipped staff view describes it
// ---------------------------------------------------------------------------

/** `Yalla.Application.Tabs.TabTotalsView`. */
export interface TabTotals {
  readonly subtotalDram: number;
  readonly serviceChargeDram: number;
  readonly totalDram: number;
  readonly paidDram: number;
  /** The number a waiter reads at a glance. Rendered largest on the panel. */
  readonly remainingDram: number;
}

/** `closing` means the bill has been asked for. It is not `closed`. */
export type StaffTabStatus = 'open' | 'closing' | 'closed' | 'abandoned';

export type TabParticipantStaffStatus = 'pendingApproval' | 'approved' | 'removed';

/**
 * `Yalla.Domain.Enums.SettlementMode`: 1 HostPaysEverything,
 * 2 EveryonePaysOwnItems, 3 AnyonePaysAnyAmount.
 *
 * Named as the server names them. Shortening these on the client is how a
 * screen ends up saying "even split" for a mode that means "anyone pays any
 * amount" — the copy does the translating, not the type.
 */
export type SettlementMode = 'hostPaysEverything' | 'everyonePaysOwnItems' | 'anyonePaysAnyAmount';

export const SETTLEMENT_MODES: readonly SettlementMode[] = [
  'hostPaysEverything',
  'everyonePaysOwnItems',
  'anyonePaysAnyAmount',
];

export interface TabStaffParticipant {
  readonly id: string;
  readonly displayName: string | null;
  readonly isHost: boolean;
  readonly status: TabParticipantStaffStatus;
  /** The host's flag: whether they may add items. Drives the order picker. */
  readonly canOrder: boolean;
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
