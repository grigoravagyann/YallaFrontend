import type { EditorFloorPlan, ReplaceFloorPlanCommand } from '@yalla/api';

/** A table's place on the cover photo, as fractions of its width and height. */
export interface PhotoPosition {
  readonly x: number;
  readonly y: number;
}

/** Table id to its position, or null when it is not on the photo. */
export type PhotoPositions = ReadonlyMap<string, PhotoPosition | null>;

/** Clamp to 0–1 and round to four places, which is well under a pixel on any cover. */
export function toFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}

/** The positions the plan already carries, for the tables still in service. */
export function positionsFromPlan(plan: EditorFloorPlan): Map<string, PhotoPosition | null> {
  const positions = new Map<string, PhotoPosition | null>();
  for (const table of plan.tables) {
    if (!table.isActive) continue;
    const x = table.photoX ?? null;
    const y = table.photoY ?? null;
    positions.set(table.id, x === null || y === null ? null : { x, y });
  }
  return positions;
}

/**
 * The entries of `positions` that differ from `saved`: the pins this page moved.
 *
 * The save applies only these to the floor plan as it is at the moment of
 * saving, so every other table keeps whatever position the server holds then —
 * including one placed from another tab since this page loaded.
 */
export function changedPositions(
  positions: PhotoPositions,
  saved: PhotoPositions,
): Map<string, PhotoPosition | null> {
  const changed = new Map<string, PhotoPosition | null>();
  for (const [tableId, position] of positions) {
    const before = saved.get(tableId) ?? null;
    if (position?.x !== before?.x || position?.y !== before?.y) {
      changed.set(tableId, position ?? null);
    }
  }
  return changed;
}

/**
 * The floor-plan `PUT` that changes nothing but where tables sit on the photo.
 *
 * The endpoint replaces the whole room, so the rest of the plan is sent back
 * exactly as it was read: same canvas, areas by name, every active table with
 * its geometry. Deactivated tables are left out, as the floor plan editor does,
 * so this save cannot resurrect one. A table missing from `positions` keeps the
 * position the plan had.
 */
export function withPhotoPositions(
  plan: EditorFloorPlan,
  positions: PhotoPositions,
): ReplaceFloorPlanCommand {
  const areaById = new Map(plan.areas.map((area) => [area.id, area.name]));
  return {
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    areas: plan.areas.map((area) => ({
      id: area.id,
      name: area.name,
      displayOrder: area.displayOrder,
    })),
    tables: plan.tables
      .filter((table) => table.isActive)
      .map((table) => {
        const position = positions.has(table.id)
          ? (positions.get(table.id) ?? null)
          : table.photoX != null && table.photoY != null
            ? { x: table.photoX, y: table.photoY }
            : null;
        return {
          id: table.id,
          label: table.label,
          seats: table.seats,
          x: table.x,
          y: table.y,
          width: table.width,
          height: table.height,
          rotationDegrees: table.rotationDegrees,
          shape: table.shape,
          floorAreaName: table.floorAreaId ? (areaById.get(table.floorAreaId) ?? null) : null,
          isBookable: table.isBookable,
          photoX: position ? toFraction(position.x) : null,
          photoY: position ? toFraction(position.y) : null,
        };
      }),
  };
}
