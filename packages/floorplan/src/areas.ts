import { AREA_MODE_MAX_WIDTH_PX, computeFloorLayout } from './layout';
import type { FloorPlanData, FloorPlanMode, FloorTable } from './types';

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

export interface AreaModeInput {
  readonly plan: FloorPlanData;
  /** Pixel box the plan will be drawn into, as measured by the caller. */
  readonly viewport: { readonly width: number; readonly height: number };
  readonly mode: FloorPlanMode;
  /** Diner mode: tables seating fewer than this are not tappable, so not counted. */
  readonly partySize?: number | undefined;
  /** `off` pins the whole room on screen — the editor and its preview need that. */
  readonly areaMode?: 'auto' | 'off' | undefined;
  readonly areaModeMaxWidthPx?: number | undefined;
  /**
   * Whether the caller can translate the switcher's labels.
   *
   * Part of the decision rather than a detail of the render: area mode adds a
   * control with words on it, and engaging it without the words would leave a
   * diner looking at raw key paths above their room.
   */
  readonly canTranslate: boolean;
}

/**
 * Should the plan show one area at a time instead of the whole room?
 *
 * Four conditions, and all four have to hold. The room must be *divided*
 * (one area is not a division), the viewport must be narrow enough that the
 * whole-room view is the problem, the caller must have copy for the switcher —
 * and, the one that actually decides it, laying the whole room out at the fit
 * must produce **overlapping tap targets**. That last one is the real
 * condition: thirty tables each owed 44pt do not fit in a 380pt phone, the
 * halos collide, a tap resolves by nearest centre, and a diner selects table 11
 * while pointing at table 12.
 *
 * Exported, and the *only* expression of the rule: `FloorPlan` calls this
 * rather than repeating the conjunction inline, so a caller that needs to know
 * in advance whether a room will fold — a page budgeting vertical space for a
 * switcher, a test asking whether a real branch survives a phone — asks the
 * same question the renderer answers, and cannot get a different answer.
 */
export function shouldUseAreaMode(input: AreaModeInput): boolean {
  const {
    plan,
    viewport,
    mode,
    partySize = 1,
    areaMode = 'auto',
    areaModeMaxWidthPx = AREA_MODE_MAX_WIDTH_PX,
    canTranslate,
  } = input;

  if (areaMode !== 'auto') return false;
  if (!canTranslate) return false;
  if (viewport.width <= 0 || viewport.width >= areaModeMaxWidthPx) return false;
  if (!hasUsableAreas(plan)) return false;

  // The probe is the whole-room layout at the fit. A table count would be a
  // guess; this is the condition that actually breaks tapping.
  return computeFloorLayout({
    canvasWidth: plan.canvasWidth,
    canvasHeight: plan.canvasHeight,
    tables: plan.tables,
    viewport,
    mode,
    partySize,
  }).hasOverlappingHitRects;
}
