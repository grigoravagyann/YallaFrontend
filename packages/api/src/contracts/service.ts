/**
 * The counter screen's contracts, for the endpoints the backend has shipped.
 *
 * Everything here is a rename of something the generated OpenAPI document
 * already describes — the eight table transitions, the derived floor, a tab's
 * totals and participants — so these shapes are checked against
 * `generated/schema.ts` by `http/staffMapping.ts` and cannot drift silently.
 *
 * Everything **guessed** against an endpoint that does not exist yet lives in
 * `contracts/ordering.ts`, alone, so that swapping in generated types later is
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
 * What the panel captured when it opened. Both halves are real.
 *
 * `expectedFromStatus` is the status the waiter was looking at. `rowVersion` is
 * the table's version from the same floor read, and **status is not a version**:
 * a table that went free → occupied → free while a command sat in the queue
 * passes a status check and lands on a sitting that has already ended. Nothing
 * on the floor screen shows that; only the version does.
 *
 * Both are sent, and the server's refusal says which one failed — see
 * {@link PreconditionFailure}. `rowVersion` stays nullable because a command
 * raised from a floor this device has not read cannot have one, and a
 * precondition the client invents would be stricter than the server's.
 */
export interface TablePrecondition {
  readonly expectedFromStatus: TableStatus;
  readonly rowVersion: string | null;
}

/**
 * Which half of the precondition failed. `Yalla.Domain.Venues.PreconditionFailure`:
 * 1 StatusChanged, 2 TableChangedAndChangedBack.
 *
 * The two mean different things to a waiter and are worded differently in the
 * conflict list. A status mismatch is on their screen — somebody seated the
 * party they were about to hold it for. A version mismatch on a *matching*
 * status is the one nothing else can show them: the table looks the same and is
 * not the same, because a whole other party has been seated, served and left
 * since they tapped.
 */
export type PreconditionFailure = 'statusChanged' | 'tableChangedAndChangedBack';

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
  /**
   * What the waiter was looking at when they tapped. Both halves are sent.
   *
   * `null` only after "apply anyway", which is precisely what that button
   * means: the waiter has looked at the table as it is now and decided their
   * action still holds.
   */
  readonly precondition?: TablePrecondition | null | undefined;
  /**
   * True when this came off the tablet's offline queue rather than from a live
   * tap.
   *
   * The server treats the two differently: a queued command **must** carry a
   * precondition, because idempotency stops it being applied twice and says
   * nothing about it being out of date.
   */
  readonly queued?: boolean | undefined;
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
  /**
   * Bookings this table still has tonight, when it has just been marked out of
   * service.
   *
   * Surfaced rather than cancelled. A broken table is the venue's doing, so
   * somebody has to phone these people — and the numbers to phone are the whole
   * reason the server sends the list.
   */
  readonly affectedReservations: readonly AffectedReservation[];
}

/**
 * A booking stranded by a table going out of service.
 * `Yalla.Application.Tables.AffectedReservation`.
 */
export interface AffectedReservation {
  readonly reservationId: string;
  /** The short code the diner quotes at the door. */
  readonly code: string;
  readonly guestName: string;
  /** What to call them on. This is the point of surfacing the list at all. */
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  /** The booked date and time as the diner sees them, from the server. */
  readonly localDate: string;
  readonly localStartTime: string;
}

/** The 409 payload, reshaped. Everything the two-conflict model branches on. */
export interface TableConflictState {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly attemptedFromStatus: TableStatus;
  readonly currentStatus: TableStatus;
  readonly currentSessionId: string | null;
  /**
   * Which half of the precondition failed, when the server said.
   *
   * `null` for a plain `table-state-conflict` — a live race, where there was no
   * precondition to fail. Set for `precondition-failed`, which is the queued
   * case, and it is the difference between "the table is occupied now" and "the
   * table is free again but has been used since you tapped".
   */
  readonly failure: PreconditionFailure | null;
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
  /** The host's stored flag: whether they may add items. */
  readonly canOrder: boolean;
  /**
   * The flag applied to the moment: approved, allowed to order, and the tab
   * still open. This is what the ordering endpoints enforce, so it is what the
   * order picker offers — a name a waiter can pick and the server then refuses
   * is worse than a name that is not there.
   */
  readonly canOrderNow: boolean;
  /** Whether they may see the table aggregate and other people's items. */
  readonly canSeeTableTotal: boolean;
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
   * The open tab on this table, when the party sitting here has one.
   *
   * Real on a cold floor read since Backend 8b. Null means there genuinely is
   * no open tab, not that this device has not learned it yet — so the tab panel
   * opens straight from the floor instead of waiting for a transition result to
   * teach it a tab id.
   */
  readonly openTabId: string | null;
  /**
   * The table's row version as it stood when this floor was read, base64.
   *
   * Sent back untouched as a command's precondition. Never parsed, never
   * compared client-side: it is the server's token and the server is the only
   * thing that knows what it means.
   */
  readonly rowVersion: string;
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
   * The branch's highest change-log sequence at the moment this was read, so an
   * incremental poll can continue from it. Zero when nothing has happened yet.
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
