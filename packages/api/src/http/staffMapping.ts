import type { components } from '../generated/schema';
import type {
  StaffTab,
  StaffTableDetail,
  StaffTabStatus,
  TabParticipantStaffStatus,
  TabSettlementMode,
  TableActionResult,
  TableConflictState,
  TableStatus,
  TableWarning,
} from '../contracts/service';
import { derivedTableState } from './mapping';

type Schemas = components['schemas'];
type FloorState = Schemas['Yalla.Application.Floor.BranchFloorState'];
type ChangeResult = Schemas['Yalla.Application.Tables.TableStateChangeResult'];
type StaffView = Schemas['Yalla.Application.Tabs.TabStaffView'];

/**
 * Wire shapes to counter-screen shapes.
 *
 * Separate from `mapping.ts` because that file is on the diner's critical path
 * and nothing about voids and balances belongs in the bundle a stranger's phone
 * downloads.
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
const SETTLEMENT_MODE: Readonly<Record<number, TabSettlementMode>> = {
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

// --- Floor ------------------------------------------------------------------

/**
 * The staff-only detail behind each table.
 *
 * Two fields the server does not send today are `null` rather than guessed:
 * `openTabId`, because the floor payload carries a session id and no tab id;
 * and `rowVersion`, because tables are not versioned. Both are read by the
 * panel and by the command queue, and both degrade to "we do not know" instead
 * of to a value that would make the precondition stricter than the server's.
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
    nextReservationPartySize: null,
    freeUntilUtc: table.freeUntilUtc ?? null,
    openTabId: null,
    rowVersion: null,
  }));
}

// --- Transitions ------------------------------------------------------------

function warnings(source: ChangeResult['warnings']): readonly TableWarning[] {
  return (source ?? []).map((warning) => ({
    code: warning.code,
    message: warning.message,
  }));
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
  };
}

/**
 * The 409 body's `context`, reshaped.
 *
 * Returns `null` rather than a partly-filled object when the payload is not the
 * table conflict we expect. A conflict screen that says a table is `free`
 * because a field was missing is worse than one that says it cannot tell.
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

  const attempted = context['attemptedFromStatus'];
  const attemptedStatus =
    typeof attempted === 'number'
      ? tableStatus(attempted)
      : typeof attempted === 'string'
        ? attempted.charAt(0).toLowerCase() + attempted.slice(1)
        : 'free';

  const changedBy = context['changedByName'] ?? context['actorName'];

  return {
    tableId,
    tableLabel: typeof context['tableLabel'] === 'string' ? context['tableLabel'] : '',
    attemptedFromStatus: attemptedStatus as TableStatus,
    currentStatus: current as TableStatus,
    currentSessionId:
      typeof context['currentSessionId'] === 'string' ? context['currentSessionId'] : null,
    ...(typeof changedBy === 'string' ? { changedBy } : {}),
  };
}

// --- Tabs -------------------------------------------------------------------

/**
 * The staff tab view.
 *
 * `lines` and `shares` are empty: the server's staff view carries participants
 * and totals and nothing else, because ordering has not shipped. Empty is the
 * truth, and the panel says "no items yet" rather than drawing a bill that is
 * missing rows.
 */
export function staffTabFromView(view: StaffView): StaffTab {
  return {
    id: view.tabId,
    branchId: view.branchId,
    tableId: view.diningTableId,
    tableLabel: view.tableLabel,
    status: TAB_STATUS[view.status] ?? 'open',
    settlementMode: SETTLEMENT_MODE[view.settlementMode] ?? 'hostPaysEverything',
    openedAtUtc: view.openedAtUtc,
    closedAtUtc: view.closedAtUtc ?? null,
    participants: view.participants.map((participant) => ({
      id: participant.participantId,
      displayName: participant.displayName || null,
      isHost: participant.participantId === view.hostParticipantId,
      status: PARTICIPANT_STATUS[participant.status] ?? 'approved',
      canOrder: participant.canOrder,
    })),
    totals: {
      subtotalDram: view.totals.subtotalAmd,
      serviceChargeDram: view.totals.serviceChargeAmd,
      totalDram: view.totals.totalAmd,
      paidDram: view.totals.paidAmd,
      remainingDram: view.totals.remainingAmd,
    },
    lines: [],
    shares: [],
  };
}
