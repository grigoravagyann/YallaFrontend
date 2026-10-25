import {
  MAX_ROOM_PHOTOS,
  type ReplaceFloorPlanCommand,
  type FloorPlanSaveResult,
} from '@yalla/api';
import type { TFunction } from 'i18next';

/** Two names the same to a reader: case and the spaces round them do not count. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

// The server's sentences (`FloorPlanRules.Validate`, `ReplaceFloorPlanAsync`).
const UNPINNED_BOOKABLE =
  /^Bookable table\(s\) .+ are not pinned on a room photo, so diners are not offered them\.$/u;
const UNPINNED_BY_REMOVAL =
  /^Table\(s\) (.+) were taken off photos this plan removed from every room\.$/u;
const UNPINNED_BY_MOVE =
  /^Table\(s\) (.+) were taken off photos this plan moved to another room\.$/u;

/**
 * What a save warned about, in the person's language where the warning is one
 * the editor knows, and in the server's own sentence otherwise.
 *
 * The bookable-but-unpinned warning is left out: the banner above the editor
 * says the same thing from the same draft, live.
 */
export function savedWarnings(t: TFunction, warnings: readonly string[]): string[] {
  const lines: string[] = [];
  for (const warning of warnings) {
    if (UNPINNED_BOOKABLE.test(warning)) continue;
    const removed = UNPINNED_BY_REMOVAL.exec(warning);
    const moved = UNPINNED_BY_MOVE.exec(warning);
    if (removed) lines.push(t('rooms.result.unpinnedByRemoval', { labels: removed[1] }));
    else if (moved) lines.push(t('rooms.result.unpinnedByMove', { labels: moved[1] }));
    else lines.push(warning);
  }
  return lines;
}

/**
 * What a save did that the person should hear of: tables taken out of service
 * or removed, then its warnings. `null` when there is nothing to say.
 */
export function saveResultLines(
  t: TFunction,
  result: Pick<FloorPlanSaveResult, 'deactivatedTables' | 'removedTables' | 'warnings'>,
): readonly string[] | null {
  const lines = [
    ...(result.deactivatedTables.length > 0
      ? [t('rooms.result.deactivated', { labels: result.deactivatedTables.join(', ') })]
      : []),
    ...(result.removedTables.length > 0
      ? [t('rooms.result.removed', { labels: result.removedTables.join(', ') })]
      : []),
    ...savedWarnings(t, result.warnings),
  ];
  return lines.length > 0 ? lines : null;
}

/**
 * One refused field of a save, in the person's language. The server names
 * photo and pin problems by their place in the payload — `areas[1].photoIds[3]`,
 * `tables[4].photoId` — so they are read back against the command that was
 * sent to name the room or the table.
 */
export function violationLine(
  t: TFunction,
  violation: { field: string; bound?: string | undefined },
  sent: ReplaceFloorPlanCommand | null,
): string {
  const area = /^areas\[(\d+)\]\.photoIds(\[\d+\])?$/u.exec(violation.field);
  if (area) {
    const name = sent?.areas[Number(area[1])]?.name ?? '';
    return area[2]
      ? t('rooms.error.photoInTwoRooms', { name })
      : t('rooms.error.tooManyPhotos', { name, max: MAX_ROOM_PHOTOS });
  }
  const table = /^tables\[(\d+)\]\.(photoId|photoX|photoY)$/u.exec(violation.field);
  if (table) {
    const label = sent?.tables[Number(table[1])]?.label ?? '';
    return violation.bound === 'conflict'
      ? t('rooms.error.pinOtherRoom', { label })
      : t('rooms.error.pinInvalid', { label });
  }
  return t('rooms.error.invalid');
}
