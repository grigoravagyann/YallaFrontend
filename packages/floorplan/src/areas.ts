import type { FloorPlanData, FloorTable } from './types';

/**
 * One floor area, as the area switcher needs it.
 *
 * The free count is the number a diner is actually scanning for. Without it
 * the choice between "Windows" and "Terrace" is arbitrary, and a diner taps
 * through three areas to find the one with a table.
 */
export interface FloorAreaSummary {
  /** `null` is the catch-all bucket for tables belonging to no area. */
  readonly name: string | null;
  readonly tableCount: number;
  readonly freeCount: number;
}

/** The name shown for tables that belong to no area. Callers translate it. */
export const UNASSIGNED_AREA: null = null;

function isFree(table: FloorTable): boolean {
  return table.state === 'free';
}

/**
 * The plan's floor areas, in the order their tables first appear.
 *
 * Source order rather than alphabetical: the backend returns tables ordered by
 * the area's `displayOrder`, which is the order the venue thinks of its own
 * room in — front to back, usually. Re-sorting would put "Terrace" before
 * "Windows" for no reason a manager would recognise.
 */
export function floorAreas(plan: FloorPlanData): readonly FloorAreaSummary[] {
  const order: (string | null)[] = [];
  const counts = new Map<string | null, { tableCount: number; freeCount: number }>();

  for (const table of plan.tables) {
    const name = table.floorAreaName;
    let entry = counts.get(name);
    if (!entry) {
      entry = { tableCount: 0, freeCount: 0 };
      counts.set(name, entry);
      order.push(name);
    }
    entry.tableCount += 1;
    if (isFree(table)) entry.freeCount += 1;
  }

  return order.map((name) => {
    const entry = counts.get(name);
    return {
      name,
      tableCount: entry?.tableCount ?? 0,
      freeCount: entry?.freeCount ?? 0,
    };
  });
}

/**
 * True when the room is divided in a way area mode can actually use.
 *
 * One area is not a division: switching between "Windows" and "Overview" shows
 * the same tables twice and adds a control that does nothing. A room like that
 * keeps rendering whole however cramped it is, and zoom is the remedy instead.
 */
export function hasUsableAreas(plan: FloorPlanData): boolean {
  return floorAreas(plan).length > 1;
}
