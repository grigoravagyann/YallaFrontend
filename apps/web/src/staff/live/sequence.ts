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
 */

export type SequenceResult =
  | { readonly kind: 'unchanged'; readonly floor: StaffFloor }
  | { readonly kind: 'applied'; readonly floor: StaffFloor; readonly changed: readonly string[] }
  /**
   * A sequence number is missing, so some change never arrived. The only safe
   * answer is a full refetch: applying the rest would leave one table drawn
   * from a state that has since been superseded, and nothing on screen would
   * say which one.
   */
  | { readonly kind: 'gap'; readonly expected: number; readonly received: number };

/** The derived state a physical status maps to when nothing else is known. */
const STATE_FROM_CHANGE: Readonly<Record<string, DerivedTableState>> = {
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

    const next: StaffTableDetail = {
      ...detail,
      physicalStatus: change.toStatus,
      currentSessionId: change.tableSessionId,
      seatedAtUtc: change.toStatus === 'occupied' ? change.atUtc : null,
      partySize: change.partySize,
      nextReservationStartUtc: change.nextReservationStartUtc,
      openTabId: change.tabId ?? (change.toStatus === 'free' ? null : detail.openTabId),
    };

    details.set(change.tableId, next);
    states.set(change.tableId, change.state ?? STATE_FROM_CHANGE[change.toStatus] ?? 'free');
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
