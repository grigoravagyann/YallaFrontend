import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan';
import type { StaffFloor, TableActionKind, TableConflictState, TableStatus } from '@yalla/api';
import {
  initialCommandState,
  isQueueable,
  isTableAction,
  type CommandState,
  type ConflictEntry,
  type NewCommand,
  type QueuedCommand,
} from './types';

/**
 * The command queue, as a pure function.
 *
 * Everything that decides whether a waiter's tap is lost, applied twice, or
 * quietly turned into the wrong thing lives here, with no IndexedDB, no fetch
 * and no React. That is not tidiness — it is the only way this behaviour is
 * testable at all. The failure modes are a dropped seat on a Friday and a
 * double round of drinks, and neither reproduces reliably in a browser.
 *
 * Three invariants the rest of the screen depends on:
 *
 * 1. **Nothing is ever silently dropped.** A command leaves the queue by being
 *    applied, or by moving to the conflict list where a person decides. There
 *    is no path that discards one on the device's own judgment.
 * 2. **Everything visible derives from the queue.** The pending badge, the
 *    optimistic floor and the conflict count are computed from `queue` and
 *    `conflicts` below, never tracked alongside them. Two sources would drift,
 *    and the one that drifts is always the one on screen.
 * 3. **Order is preserved per scope.** Replay is by `seq`, so a free that
 *    followed a seat can never overtake it.
 */

export type CommandAction =
  /**
   * Restored from IndexedDB at startup.
   *
   * Both lists together, not the queue alone. A conflicted command is no longer
   * *in* the queue — that is what moving it to the conflict list means — so
   * restoring the queue and then replaying `conflicted` for each saved entry
   * finds nothing to move and silently drops every one of them. The waiter comes
   * back after a tablet reboot to a floor that has quietly forgotten three
   * decisions it was waiting on.
   */
  | {
      readonly type: 'hydrated';
      readonly queue: readonly QueuedCommand[];
      readonly conflicts: readonly ConflictEntry[];
    }
  | {
      readonly type: 'enqueued';
      readonly command: NewCommand;
      readonly atMs: number;
      /** The browser said there was no connection when the waiter tapped. */
      readonly takenOffline: boolean;
    }
  | { readonly type: 'syncStarted' }
  | { readonly type: 'syncFinished' }
  /** The server applied it. */
  | { readonly type: 'applied'; readonly id: string }
  /** The server had already applied it and replayed the original response. */
  | { readonly type: 'replayed'; readonly id: string }
  /** The send failed for a reason that is not the command's fault. Stays queued. */
  | { readonly type: 'deferred'; readonly id: string }
  | {
      readonly type: 'conflicted';
      readonly id: string;
      readonly observed: TableConflictState | null;
      readonly reason: ConflictEntry['reason'];
      readonly atMs: number;
    }
  | { readonly type: 'discardConflict'; readonly id: string }
  /** "Apply anyway": back to the queue with no precondition. */
  | { readonly type: 'retryConflict'; readonly id: string; readonly atMs: number };

export function commandReducer(state: CommandState, action: CommandAction): CommandState {
  switch (action.type) {
    case 'hydrated': {
      // `nextSeq` has to clear the conflicts too: "apply anyway" gives an entry
      // a fresh sequence number, and one that collided with a queued command's
      // would make the replay order ambiguous.
      const highest = [...action.queue, ...action.conflicts.map((entry) => entry.command)].reduce(
        (max, command) => Math.max(max, command.seq),
        0,
      );
      return {
        ...state,
        queue: [...action.queue].sort((a, b) => a.seq - b.seq),
        conflicts: [...action.conflicts],
        nextSeq: highest + 1,
      };
    }

    case 'enqueued': {
      const kind = action.command.body.kind;

      // A payment never enters the queue. The caller is expected to have
      // disabled the action already; refusing here as well means the rule holds
      // even if a future screen forgets, and it holds in a place that is tested.
      if (!isQueueable(kind)) return state;

      // The same tap twice — a double press, a re-render — is one command. The
      // id is the server's idempotency key, so this also means a retry cannot
      // become a second round of drinks.
      if (state.queue.some((queued) => queued.id === action.command.id)) return state;

      const queued: QueuedCommand = {
        id: action.command.id,
        kind,
        scope: action.command.scope,
        seq: state.nextSeq,
        takenAtMs: action.atMs,
        attempts: 0,
        takenOffline: action.takenOffline,
        precondition: action.command.precondition,
        subject: action.command.subject,
        body: action.command.body,
      };

      return { ...state, queue: [...state.queue, queued], nextSeq: state.nextSeq + 1 };
    }

    case 'syncStarted':
      return { ...state, syncing: true };

    case 'syncFinished':
      return { ...state, syncing: false };

    case 'applied':
    case 'replayed':
      // Identical handling, and deliberately so: a replay means the server
      // already has it. Treating it as anything but success would leave a
      // command queued forever, retrying something that is already done.
      return { ...state, queue: state.queue.filter((command) => command.id !== action.id) };

    case 'deferred':
      return {
        ...state,
        queue: state.queue.map((command) =>
          command.id === action.id ? { ...command, attempts: command.attempts + 1 } : command,
        ),
      };

    case 'conflicted': {
      const command = state.queue.find((queued) => queued.id === action.id);
      if (!command) return state;
      return {
        ...state,
        // Out of the queue, so the optimistic floor reverts to server truth on
        // the next render. Into the conflict list, so it is not lost.
        queue: state.queue.filter((queued) => queued.id !== action.id),
        conflicts: [
          ...state.conflicts,
          {
            command,
            detectedAtMs: action.atMs,
            observed: action.observed,
            reason: action.reason,
          },
        ],
      };
    }

    case 'discardConflict':
      return {
        ...state,
        conflicts: state.conflicts.filter((entry) => entry.command.id !== action.id),
      };

    case 'retryConflict': {
      const entry = state.conflicts.find((candidate) => candidate.command.id === action.id);
      if (!entry) return state;

      return {
        ...state,
        conflicts: state.conflicts.filter((candidate) => candidate.command.id !== action.id),
        queue: [
          ...state.queue,
          {
            ...entry.command,
            // Re-sent with no precondition. That is what the button says, and
            // it is the only honest reading of "apply anyway": the waiter has
            // looked at the current state and decided their action still holds.
            precondition: null,
            // A new position in the replay order. It was taken before the
            // commands ahead of it, but it is being applied after them, and
            // pretending otherwise would replay it into the wrong past.
            seq: state.nextSeq,
            attempts: 0,
          },
        ],
        nextSeq: state.nextSeq + 1,
      };
    }

    default:
      return state;
  }
}

export { initialCommandState };

// ---------------------------------------------------------------------------
// Selectors — everything on screen, derived
// ---------------------------------------------------------------------------

/** The header badge. Never a counter kept beside the queue. */
export function pendingCount(state: CommandState): number {
  return state.queue.length;
}

export function conflictCount(state: CommandState): number {
  return state.conflicts.length;
}

/** Replay order: `seq`, always. */
export function replayOrder(state: CommandState): readonly QueuedCommand[] {
  return [...state.queue].sort((a, b) => a.seq - b.seq);
}

// ---------------------------------------------------------------------------
// The optimistic floor
// ---------------------------------------------------------------------------

/** What each transition leaves the table looking like. */
const RESULT_STATE: Readonly<Record<TableActionKind, DerivedTableState>> = {
  seatWalkIn: 'occupied',
  seatReservation: 'occupied',
  seatHeldParty: 'occupied',
  hold: 'held',
  releaseHold: 'free',
  freeTable: 'free',
  outOfService: 'outOfService',
  returnToService: 'free',
};

/** The physical status each transition produces, for chaining preconditions. */
const RESULT_STATUS: Readonly<Record<TableActionKind, TableStatus>> = {
  seatWalkIn: 'occupied',
  seatReservation: 'occupied',
  seatHeldParty: 'occupied',
  hold: 'held',
  releaseHold: 'free',
  freeTable: 'free',
  outOfService: 'outOfService',
  returnToService: 'free',
};

export interface OptimisticFloor {
  readonly plan: FloorPlanData;
  /**
   * Tables whose drawn state comes from an unsent command rather than from the
   * server. Every one of them is marked on screen.
   */
  readonly pendingTableIds: ReadonlySet<string>;
}

/**
 * The floor with unsent commands applied, and every one of them marked.
 *
 * The rule this exists to keep: **never render a synced state that is not
 * real**. A tablet that draws a table as occupied because it queued a seat, and
 * looks exactly like a tablet that knows the server agrees, is worse than one
 * that is visibly behind — the waiter stops being able to tell which tables the
 * kitchen can see.
 *
 * So the state is applied, because a waiter who seats a party and watches the
 * table stay white will seat it again; and it is marked, because they have to
 * know it has not landed.
 */
export function optimisticFloor(
  plan: FloorPlanData,
  queue: readonly QueuedCommand[],
): OptimisticFloor {
  const pending = new Map<string, DerivedTableState>();

  for (const command of [...queue].sort((a, b) => a.seq - b.seq)) {
    if (!isTableAction(command.kind)) continue;
    const tableId = command.subject.tableId;
    if (!tableId) continue;
    pending.set(tableId, RESULT_STATE[command.kind]);
  }

  if (pending.size === 0) return { plan, pendingTableIds: new Set() };

  return {
    plan: {
      ...plan,
      tables: plan.tables.map((table) => {
        const next = pending.get(table.id);
        return next === undefined ? table : { ...table, state: next };
      }),
    },
    pendingTableIds: new Set(pending.keys()),
  };
}

/**
 * The physical status a table will be in once the queue has drained.
 *
 * Used to build the *next* command's precondition. Without it, seating a walk-in
 * offline and then freeing the same table would capture `free` as the free's
 * precondition — the status the server still reports — and the free would land
 * in the conflict list for no reason at all.
 */
export function projectedStatus(
  floor: StaffFloor | null,
  queue: readonly QueuedCommand[],
  tableId: string,
): TableStatus | null {
  const server =
    floor?.details.find((detail) => detail.tableId === tableId)?.physicalStatus ?? null;

  let status = server;
  for (const command of [...queue].sort((a, b) => a.seq - b.seq)) {
    if (command.subject.tableId !== tableId) continue;
    if (!isTableAction(command.kind)) continue;
    status = RESULT_STATUS[command.kind];
  }
  return status;
}

/**
 * Does this command's precondition still hold?
 *
 * The check that turns a stale queued command into a conflict instead of an
 * action applied to the wrong world. It runs against the freshly-read floor
 * immediately before sending, and against nothing else — a command with no
 * precondition (an order, or one the waiter chose to apply anyway) always
 * passes, because the client must never be stricter than the server.
 */
export function preconditionHolds(command: QueuedCommand, floor: StaffFloor | null): boolean {
  if (!command.precondition) return true;
  if (!floor) return true;

  const tableId = command.subject.tableId;
  if (!tableId) return true;

  const detail = floor.details.find((candidate) => candidate.tableId === tableId);
  // A table the floor no longer lists is not a precondition failure to decide
  // here: let the server answer, and let its 404 or 409 be the reason.
  if (!detail) return true;

  return detail.physicalStatus === command.precondition.expectedFromStatus;
}

/** The conflict the local check found, shaped like the server's own payload. */
export function localConflict(
  command: QueuedCommand,
  floor: StaffFloor | null,
): TableConflictState | null {
  const tableId = command.subject.tableId;
  if (!tableId || !command.precondition) return null;
  const detail = floor?.details.find((candidate) => candidate.tableId === tableId);
  if (!detail) return null;

  return {
    tableId,
    tableLabel: detail.label,
    attemptedFromStatus: command.precondition.expectedFromStatus,
    currentStatus: detail.physicalStatus,
    currentSessionId: detail.currentSessionId,
    // The local check only compares statuses. The version is the server's to
    // judge — a client that decided a table "changed and changed back" from a
    // version it cannot interpret would be inventing a refusal.
    failure: 'statusChanged',
  };
}

// ---------------------------------------------------------------------------
// Two kinds of conflict
// ---------------------------------------------------------------------------

/**
 * How long after the tap a refusal still counts as a race.
 *
 * Generous on purpose. A slow request on a bad connection is still the same
 * gesture, and the cost of being wrong in this direction — a conflict entry a
 * waiter has to dismiss — is far smaller than the cost of the other direction,
 * which is a stale command silently discarded with a one-line message.
 */
export const LIVE_RACE_WINDOW_MS = 10_000;

/**
 * Is this a live race, or a queued command that arrived too late?
 *
 * The two produce the same 409 and are handled completely differently, so the
 * difference has to be drawn on the client — the server cannot know how long a
 * command sat on a tablet before it was sent.
 *
 * **A live race** is somebody taking the table in the seconds the panel was
 * open. The command was sent on its first attempt, moments after the tap, and
 * the waiter is still standing there looking at the panel. The right answer is
 * to redraw the floor and say who took it, in one sentence. It is a normal
 * Friday, not a failure.
 *
 * **A stale command** was deferred at least once, or was taken long enough ago
 * that the floor has genuinely moved on since. Nobody is standing in front of
 * the panel, the decision was made about a world that no longer exists, and
 * only a person can say whether it still holds. That goes to the conflict list.
 */
export function isLiveRace(entry: ConflictEntry): boolean {
  return (
    // Only a `table-state-conflict`. A 422 is the server saying the move is not
    // legal from where the table actually is, which no amount of redrawing the
    // floor makes true. A `precondition-failed` is by definition a command that
    // waited — the server only checks a precondition the client sent because it
    // had been queued — so it can never be the gesture somebody is still
    // standing in front of. Both belong in the list where a person decides.
    entry.reason === 'conflict' &&
    entry.command.attempts === 0 &&
    entry.detectedAtMs - entry.command.takenAtMs <= LIVE_RACE_WINDOW_MS
  );
}
