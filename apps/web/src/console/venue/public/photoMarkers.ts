import type {
  EditorFloorPlan,
  SaveTablePhotoPositionsCommand,
  TablePhotoPositions,
} from '@yalla/api';

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

/** The positions a save answered with: every active table at the branch, placed or not. */
export function positionsFromAnswer(
  answer: TablePhotoPositions,
): Map<string, PhotoPosition | null> {
  const positions = new Map<string, PhotoPosition | null>();
  for (const table of answer.tables) {
    positions.set(
      table.tableId,
      table.photoX === null || table.photoY === null ? null : { x: table.photoX, y: table.photoY },
    );
  }
  return positions;
}

/**
 * The entries of `positions` that differ from `saved`: the pins this page moved.
 *
 * Only these are sent. The server changes only the tables a save lists, so
 * every other table keeps whatever pin it has then — including one placed from
 * another tab since this page loaded.
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
 * The one call a pin save makes (K7): the changed pins, against the cover they
 * were placed on. A cover changed since is refused by the server with nothing
 * written, which is the whole reason the id travels with the pins.
 */
export function positionsCommand(
  coverPhotoId: string,
  changed: PhotoPositions,
): SaveTablePhotoPositionsCommand {
  return {
    coverPhotoId,
    positions: [...changed].map(([tableId, position]) => ({
      tableId,
      photoX: position ? toFraction(position.x) : null,
      photoY: position ? toFraction(position.y) : null,
    })),
  };
}
