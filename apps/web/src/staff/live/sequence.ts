import type { FloorChange, StaffFloor, StaffTableDetail } from '@yalla/api';
import type { DerivedTableState } from '@yalla/floorplan';
import { findSequenceGap } from '@yalla/realtime';

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
   * A sequence number is missing, so some change never arrived — or a change
   * arrived that cannot be folded in without inventing something. Either way
   * the only safe answer is a full refetch: applying the rest would leave one
   * table drawn from a state that has since been superseded, and nothing on
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
  if (changes.length === 0) return { kind: 'unchanged', floor };

  const ordered = [...changes].sort((a, b) => a.sequence - b.sequence);

  // Contiguity, checked before anything is applied, by the same rule the tab
  // stream uses. A partially applied page is worse than an unapplied one: the
  // screen would look updated.
  const gap = findSequenceGap(
    floor.lastSequence,
    ordered.map((change) => change.sequence),
  );
  if (gap) return { kind: 'gap', ...gap };

  const details = new Map(floor.details.map((detail) => [detail.tableId, detail]));
  const states = new Map<string, DerivedTableState>();
  const changed = new Set<string>();

  for (const change of ordered) {
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
