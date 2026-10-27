import type { DerivedTableState, FloorChange, StaffFloor, StaffTableDetail } from '@yalla/api';

/**
 * Applying the branch's change stream to the floor already on screen.
 *
 * Pure, because this is the part that decides whether the room a waiter is
 * looking at is the room that exists, and that is not something to find out on
 * a Friday. The transport is elsewhere; this only knows how to fold a page of
 * changes into a floor and how to notice that it cannot.
 *
 * ## What a change does not carry
 *
 * `BranchChange` is an audit row: two statuses, a session, an actor, a time.
 * It has **no derived state, no party size, no next booking and no tab id** —
 * so folding one in can only update what it actually says, and anything it does
 * not say has to either survive untouched or force a refetch. Guessing here
 * would put a wrong number under a waiter's thumb with nothing on screen
 * admitting it was a guess.
 */

export type SequenceResult =
  | { readonly kind: 'unchanged'; readonly floor: StaffFloor }
  | { readonly kind: 'applied'; readonly floor: StaffFloor; readonly changed: readonly string[] }
  /**
   * A change arrived that cannot be folded in without inventing something —
   * a table this screen has never seen, a freed table with a booking coming,
   * a booking a block cancelled. The only safe answer is a full refetch:
   * applying the rest would leave one table drawn from a guess, and nothing on
   * screen would say which one.
   */
  | { readonly kind: 'gap'; readonly expected: number; readonly received: number };

/**
 * The state to draw for a physical status.
 *
 * Exact for three of the four. **Free is the exception**: the server draws a
 * physically free table as `reservedSoon` once its next booking is inside the
 * branch's turnaround buffer, and the client has the booking time but not the
 * buffer. So a table that becomes free *and has a booking* is not folded in at
 * all — see below.
 */
const STATE_FROM_STATUS: Readonly<Record<string, DerivedTableState>> = {
  free: 'free',
  held: 'held',
  occupied: 'occupied',
  outOfService: 'outOfService',
};

export function applyFloorChanges(
  floor: StaffFloor,
  changes: readonly FloorChange[],
): SequenceResult {
  /*
   * Not contiguity (review S1). `Sequence` is one IDENTITY across every
   * branch, with holes from rolled-back inserts, and the server answers every
   * row of this branch after the sequence asked for: a hole is another
   * branch's row, never a missing one. What matters is order, and that a row
   * the floor already has — it was read after the row was written — is not
   * applied twice (S2). Each row once, in order.
   */
  const seen = new Set<number>();
  const ordered = [...changes]
    .filter((change) => change.sequence > floor.lastSequence)
    .sort((a, b) => a.sequence - b.sequence)
    .filter((change) => !seen.has(change.sequence) && Boolean(seen.add(change.sequence)));
  if (ordered.length === 0) return { kind: 'unchanged', floor };

  const details = new Map(floor.details.map((detail) => [detail.tableId, detail]));
  const states = new Map<string, DerivedTableState>();
  const changed = new Set<string>();

  for (const change of ordered) {
    // A pre-order at this table's booking changed (signal 6): created, edited,
    // sent, marked not coming, put on the tab, its ticket moved, the guest on
    // the way. A same-status row about the booking, not the table, and it
    // carries nothing the floor folds: the rail is read again
    // (`readsPreOrderRail`) and the table is left as it is. First, before the
    // checks below: a pre-order's table is usually free with that booking
    // next, and a whole-floor read per guest edit or kitchen move is the
    // flood S9 removed (review S1). The admission fold would also clear a
    // scan's waiting flag.
    if (change.signal === 'preOrderChanged') continue;
    // A takeaway order moved (signal 8, 2026-10-26): a row about the counter,
    // with no table, read again by the stream's handler. Nothing here to fold,
    // and a whole-floor read per order placed or collected would be the flood
    // again. A row with no table under a signal this build does not know is
    // passed over too: there is no table to draw differently.
    if (change.signal === 'takeawayChanged' || change.tableId === null) continue;
    const detail = details.get(change.tableId);
    // A table the client has never seen means the plan itself changed under us
    // — a table was added in the editor. Geometry does not arrive on this
    // stream, so this is a refetch, not something to patch around.
    if (!detail) {
      return { kind: 'gap', expected: floor.lastSequence + 1, received: change.sequence };
    }

    // A table that has just been freed and has a booking coming. Whether the
    // server would draw it `free` or `reservedSoon` depends on the branch's
    // turnaround buffer, which is not on any payload this screen reads — and
    // drawing a bookable table as plainly free is how a party gets walked into
    // somebody's 20:00. Refetch instead; it is one request and it is right.
    if (change.toStatus === 'free' && detail.nextReservationStartUtc !== null) {
      return { kind: 'gap', expected: floor.lastSequence + 1, received: change.sequence };
    }

    const occupied = change.toStatus === 'occupied';

    /*
     * About the table's tab (unverified guests): a scan waiting to be let in,
     * admitted, or turned away. The row names the tab, so it folds in: the
     * waiting flag follows the signal, the tab is the row's while one waits,
     * and a turned-away tab is gone. A row that keeps the status
     * (Occupied→Occupied) leaves the sitting alone — it is not a new one.
     * A whole-floor read for each would cost every tablet a request per
     * phantom scan, which is the flood this feature exists to stop (S9).
     */
    // A booking here was cancelled because its guest was blocked for no-shows
    // (guest record, 2026-10-20). The row says which booking, not what the
    // table's next one is now: only a read of the floor knows.
    //
    // A booking event at this table — made, approved, declined, moved,
    // cancelled, a no-show marked or withdrawn (signal 5). The row's status is
    // what the save saw, not a transition: only a read of the floor says what
    // the table's next booking is now (wire §0a).
    //
    // A signal this build does not know: read, never guessed at — and never
    // folded as an admission, which would clear a scan's waiting flag.
    //
    // The table was handed to another waiter (signal 7, 2026-10-24): the row
    // does not say to whom, the floor read does (`serverName`).
    //
    // The table's tab was written off (signal 9, 2026-10-27): the row's status
    // is the table's own, not a transition, and only a read says the tab is gone.
    if (
      change.signal === 'bookingCancelledByBlock' ||
      change.signal === 'bookingChanged' ||
      change.signal === 'tableTransferred' ||
      change.signal === 'tabWrittenOff' ||
      change.signal === 'unknown'
    ) {
      return { kind: 'gap', expected: floor.lastSequence + 1, received: change.sequence };
    }
    if (change.signal) {
      const awaiting = change.signal === 'tabAwaitingAdmission';
      const sameStatus = change.fromStatus === change.toStatus;
      const signalled: StaffTableDetail = {
        ...detail,
        physicalStatus: change.toStatus,
        currentSessionId: change.tableSessionId ?? detail.currentSessionId,
        seatedAtUtc: sameStatus ? detail.seatedAtUtc : occupied ? change.atUtc : null,
        partySize: occupied ? detail.partySize : null,
        openTabId:
          change.signal === 'tabAdmissionRejected' || !occupied
            ? null
            : (change.tabId ?? detail.openTabId),
        openTabAwaitingAdmission: awaiting,
      };
      details.set(change.tableId, signalled);
      states.set(change.tableId, STATE_FROM_STATUS[change.toStatus] ?? 'free');
      changed.add(change.tableId);
      continue;
    }

    const next: StaffTableDetail = {
      ...detail,
      physicalStatus: change.toStatus,
      currentSessionId: change.tableSessionId,
      seatedAtUtc: occupied ? change.atUtc : null,
      // Not on the change. Cleared when the table empties, because a party size
      // left over from the last sitting is worse than none; kept otherwise,
      // because the change does not claim it moved.
      partySize: occupied ? detail.partySize : null,
      // Likewise: a freed table's tab is not named here, and a tab id that
      // outlived its sitting would open somebody else's bill.
      openTabId: change.toStatus === 'free' ? null : detail.openTabId,
      // The version this change produced is unknown — `BranchChange` does not
      // carry it. Clearing it means the next command on this table sends a
      // status precondition and no version, which is weaker than the floor read
      // would give but is never *wrong*. The next full read restores it.
      rowVersion: detail.rowVersion,
    };

    details.set(change.tableId, next);
    states.set(change.tableId, STATE_FROM_STATUS[change.toStatus] ?? 'free');
    changed.add(change.tableId);
  }

  const last = ordered[ordered.length - 1];

  return {
    kind: 'applied',
    floor: {
      plan: {
        ...floor.plan,
        tables: floor.plan.tables.map((table) => {
          const state = states.get(table.id);
          if (state === undefined) return table;
          const detail = details.get(table.id);
          return {
            ...table,
            state,
            occupiedSinceUtc: detail?.seatedAtUtc ?? null,
            nextReservationStartUtc: detail?.nextReservationStartUtc ?? null,
          };
        }),
      },
      // Mapped over the original list rather than rebuilt from the plan, so a
      // table with no detail row stays without one instead of inheriting
      // somebody else's session id.
      details: floor.details.map((detail) => details.get(detail.tableId) ?? detail),
      lastSequence: last?.sequence ?? floor.lastSequence,
      asOfUtc: last?.atUtc ?? floor.asOfUtc,
    },
    changed: [...changed],
  };
}

/**
 * The most recent change to one table, for the "seated by Aram just now"
 * message a live race produces.
 */
export function latestChangeFor(
  changes: readonly FloorChange[],
  tableId: string,
): FloorChange | undefined {
  return [...changes]
    .filter((change) => change.tableId === tableId)
    .sort((a, b) => b.sequence - a.sequence)[0];
}
