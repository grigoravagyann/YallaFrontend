import type { LaidOutTable } from './layout';
import type { Point, Rect } from './types';

function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Resolve a tap to a table.
 *
 * In a dense cluster of two-seaters the expanded 44pt hit rects necessarily
 * overlap — that is the cost of guaranteeing a reachable tap target. When they
 * do, the tap must go to the table whose *centre* is nearest, not to whichever
 * happens to be painted last. Paint order is an accident of array order and
 * would make the same tap select different tables depending on how the backend
 * happened to sort its response.
 *
 * A table whose drawn shape directly contains the point always wins over one
 * that only catches it via an expanded region, so a deliberate tap on a large
 * table is never stolen by a small neighbour's halo.
 *
 * @param candidates Laid-out tables; only `selectable` ones are considered
 * unless `includeUnselectable` is set.
 */
export function pickTableAt(
  point: Point,
  candidates: readonly LaidOutTable[],
  options: { readonly includeUnselectable?: boolean } = {},
): LaidOutTable | null {
  const eligible = options.includeUnselectable
    ? candidates
    : candidates.filter((t) => t.selectable);

  let best: LaidOutTable | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIsDirect = false;

  for (const candidate of eligible) {
    const direct = containsPoint(candidate.rect, point);
    const withinHit = direct || containsPoint(candidate.hitRect, point);
    if (!withinHit) continue;

    // A direct hit on the drawn shape outranks any halo hit.
    if (bestIsDirect && !direct) continue;

    const distance = distanceSquared(point, candidate.center);
    if (direct && !bestIsDirect) {
      best = candidate;
      bestDistance = distance;
      bestIsDirect = true;
      continue;
    }
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      bestIsDirect = direct;
    }
  }

  return best;
}
