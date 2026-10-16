import { FloorPlanChangedError, FloorPlanInvalidError } from '../contracts/errors';
import {
  MAX_ROOM_PHOTOS,
  type EditorFloorArea,
  type EditorFloorPlan,
  type EditorFloorTable,
  type EditorTablePin,
  type FloorPlanSaveResult,
  type ReplaceFloorAreaInput,
  type ReplaceFloorPlanCommand,
  type ReplaceFloorTableInput,
} from '../contracts/floorPlan';
import type { Photo } from '../contracts/menuAdmin';
import { NotFoundError } from '../errors';
import { validationFailed, type MockViolation } from './problems';

/**
 * `BranchSettingsService.ReplaceFloorPlanAsync`, in the mock.
 *
 * The same checks in the same order, refused with the same status, code,
 * fields, bounds and sentences, and nothing written for any refusal:
 *
 * 1. `expectedVersion` missing (422 `validation-failed`), then stale (409).
 * 2. Unlabelled tables, repeated labels, unnamed rooms (422 `floor-plan-invalid`).
 * 3. Repeated room names, tables naming a room the plan does not keep (same).
 * 4. Room photos: more than ten, a photo twice or in two rooms (422 `validation-failed`).
 * 5. Pins: half of one, outside 0–1, on another room's photo (same).
 * 6. A photo that is not this branch's (404).
 * 7. A table matched twice, a new table reusing a retained label, a seated
 *    table left out (422 `floor-plan-invalid`).
 */

export interface FloorPlanMockContext {
  readonly branchId: string;
  readonly url: string;
  /** Whether a table has reservations, sittings or tabs, so it is deactivated rather than deleted. */
  readonly hasHistory: (tableId: string) => boolean;
  /** The photo when it was uploaded for this branch; `undefined` otherwise. */
  readonly branchPhoto: (photoId: string) => Photo | undefined;
  readonly newId: (prefix: string) => string;
}

const key = (value: string) => value.trim().toLocaleLowerCase();

function areaIndex(areas: readonly ReplaceFloorAreaInput[], name: string): number {
  return areas.findIndex((area) => key(area.name ?? '') === key(name));
}

/** `FloorPlanRules.Validate`: labels first, then the unpinned-bookable warning. */
function validateTables(tables: readonly ReplaceFloorTableInput[]) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const unlabelled = tables.filter((t) => (t.label ?? '').trim() === '').length;
  if (unlabelled > 0) {
    errors.push(
      `${unlabelled} table(s) in the plan have no label. Every table needs the label printed on it.`,
    );
  }

  const groups = new Map<string, { label: string; count: number }>();
  for (const table of tables) {
    const label = (table.label ?? '').trim();
    const group = groups.get(key(label));
    if (group) group.count += 1;
    else groups.set(key(label), { label, count: 1 });
  }
  const duplicateLabels = [...groups.values()]
    .filter((group) => group.count > 1 && group.label.length > 0)
    .map((group) => group.label);
  if (duplicateLabels.length > 0) {
    errors.push(
      `Table labels must be unique within a branch. Repeated: ${duplicateLabels.join(', ')}.`,
    );
  }

  const unpinned = tables
    .filter((t) => t.isBookable && !t.pin?.photoId && (t.label ?? '').trim() !== '')
    .map((t) => t.label.trim());
  if (unpinned.length > 0) {
    warnings.push(
      `Bookable table(s) ${unpinned.join(', ')} are not pinned on a room photo, so diners are not offered them.`,
    );
  }

  return { errors, warnings, duplicateLabels };
}

/** `PlanRoomPhotos`: which room each photo is in, or every violation at once. */
function planRoomPhotos(url: string, areas: readonly ReplaceFloorAreaInput[]): Map<string, number> {
  const violations: MockViolation[] = [];
  const roomOf = new Map<string, number>();

  areas.forEach((area, i) => {
    const photoIds = area.photoIds ?? [];
    if (photoIds.length > MAX_ROOM_PHOTOS) {
      violations.push({
        field: `areas[${i}].photoIds`,
        message: `A room holds at most ${MAX_ROOM_PHOTOS} photos.`,
        bound: 'max',
        max: MAX_ROOM_PHOTOS,
      });
    }
    photoIds.forEach((photoId, j) => {
      const field = `areas[${i}].photoIds[${j}]`;
      const other = roomOf.get(photoId);
      if (!photoId) {
        violations.push({ field, message: 'Name the photo.', bound: 'required' });
      } else if (other !== undefined) {
        violations.push({
          field,
          message:
            other === i
              ? 'This photo is in the room more than once.'
              : `This photo is already in ${areas[other]!.name.trim()}. A photo belongs to one room.`,
          bound: 'conflict',
        });
      } else {
        roomOf.set(photoId, i);
      }
    });
  });

  if (violations.length > 0) throw validationFailed(url, violations);
  return roomOf;
}

/** `BranchListingRules.PhotoPosition`: all three or none, each coordinate 0–1. */
function pinViolations(pin: EditorTablePin | null, label: string, prefix: string): MockViolation[] {
  const violations: MockViolation[] = [];
  const photoId = pin?.photoId ? pin.photoId : null;
  const x = pin ? pin.x : null;
  const y = pin ? pin.y : null;
  const parts = [
    ['photoId', photoId !== null],
    ['photoX', typeof x === 'number'],
    ['photoY', typeof y === 'number'],
  ] as const;
  const sent = parts.filter(([, present]) => present).length;
  if (sent === 1 || sent === 2) {
    for (const [field, present] of parts) {
      if (!present) {
        violations.push({
          field: prefix + field,
          message: `Table ${label} needs a photo and both coordinates to be pinned, or none of them.`,
          bound: 'required',
        });
      }
    }
  }
  for (const [field, value] of [
    ['photoX', x],
    ['photoY', y],
  ] as const) {
    if (typeof value === 'number' && (Number.isNaN(value) || value < 0 || value > 1)) {
      violations.push({
        field: prefix + field,
        message: `Table ${label}'s photo coordinates are fractions from 0 to 1.`,
        bound: 'range',
        min: 0,
        max: 1,
      });
    }
  }
  return violations;
}

/** `PlanPins`: every table's pin as it will be stored, or every violation at once. */
function planPins(
  url: string,
  tables: readonly ReplaceFloorTableInput[],
  areas: readonly ReplaceFloorAreaInput[],
  photoRoom: ReadonlyMap<string, number>,
  currentRoomPhotos: ReadonlySet<string>,
): (EditorTablePin | null)[] {
  const violations: MockViolation[] = [];
  const pins: (EditorTablePin | null)[] = [];

  tables.forEach((table, i) => {
    const label = table.label.trim();
    const broken = pinViolations(table.pin, label, `tables[${i}].`);
    if (broken.length > 0) {
      violations.push(...broken);
      pins.push(null);
      return;
    }
    const pin = table.pin?.photoId ? table.pin : null;
    if (!pin) {
      pins.push(null);
      return;
    }

    const room = table.floorAreaName == null ? -1 : areaIndex(areas, table.floorAreaName);
    const photoIn = photoRoom.get(pin.photoId);
    if (photoIn !== undefined) {
      if (photoIn === room) {
        pins.push({ photoId: pin.photoId, x: pin.x, y: pin.y });
      } else {
        pins.push(null);
        violations.push({
          field: `tables[${i}].photoId`,
          message:
            room < 0
              ? `Table ${label} is in no room, so it cannot be pinned on ${areas[photoIn]!.name.trim()}'s photo.`
              : `Table ${label} is in ${areas[room]!.name.trim()}; this photo is ${areas[photoIn]!.name.trim()}'s. Pin a table on one of its own room's photos.`,
          bound: 'conflict',
        });
      }
    } else if (currentRoomPhotos.has(pin.photoId)) {
      // A photo this plan drops from every room takes its tables off it, rather than refusing.
      pins.push(null);
    } else {
      pins.push(null);
      violations.push({
        field: `tables[${i}].photoId`,
        message: `Table ${label} is pinned on a photo that is not one of its room's photos.`,
        bound: 'conflict',
      });
    }
  });

  if (violations.length > 0) throw validationFailed(url, violations);
  return pins;
}

/** Lowest `displayOrder` first, then by name — the server's read order. */
export function sortAreas(areas: readonly EditorFloorArea[]): EditorFloorArea[] {
  return [...areas].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

/** By label, as the server reads them. */
export function sortTables(tables: readonly EditorFloorTable[]): EditorFloorTable[] {
  return [...tables].sort((a, b) => a.label.localeCompare(b.label));
}

export function applyFloorPlan(
  existing: EditorFloorPlan,
  command: ReplaceFloorPlanCommand,
  context: FloorPlanMockContext,
): FloorPlanSaveResult {
  const { url } = context;

  if (typeof command.expectedVersion !== 'string' || command.expectedVersion.trim() === '') {
    throw validationFailed(url, [
      {
        field: 'expectedVersion',
        message:
          "Send the version of the floor plan you loaded, so a save cannot overwrite somebody else's.",
        bound: 'required',
      },
    ]);
  }
  if (command.expectedVersion !== existing.version) {
    throw new FloorPlanChangedError({ url, currentVersion: existing.version });
  }

  const areasInput = command.areas ?? [];
  const tablesInput = command.tables ?? [];
  const validation = validateTables(tablesInput);
  const errors = [...validation.errors];
  const invalid = () =>
    new FloorPlanInvalidError({ url, errors, duplicateLabels: validation.duplicateLabels });

  const unnamedAreas = areasInput.filter((area) => (area.name ?? '').trim() === '').length;
  if (unnamedAreas > 0) errors.push(`${unnamedAreas} area(s) in the plan have no name.`);
  if (errors.length > 0) throw invalid();

  const areaGroups = new Map<string, { name: string; count: number }>();
  for (const area of areasInput) {
    const group = areaGroups.get(key(area.name));
    if (group) group.count += 1;
    else areaGroups.set(key(area.name), { name: area.name.trim(), count: 1 });
  }
  const duplicateAreas = [...areaGroups.values()].filter((g) => g.count > 1).map((g) => g.name);
  if (duplicateAreas.length > 0) {
    errors.push(
      `Area names must be unique within a branch. Repeated: ${duplicateAreas.join(', ')}.`,
    );
  }
  const unknownAreas = tablesInput
    .filter((t) => t.floorAreaName != null && areaIndex(areasInput, t.floorAreaName) < 0)
    .map((t) => `${t.label} -> ${t.floorAreaName}`);
  if (unknownAreas.length > 0) {
    errors.push(`Tables reference areas that are not in the plan: ${unknownAreas.join(', ')}.`);
  }
  if (errors.length > 0) throw invalid();

  // Photos and pins: every field-named rule, then whose photos they are.
  const photoRoom = planRoomPhotos(url, areasInput);
  const currentRoomPhotos = new Set(
    existing.areas.flatMap((area) => area.photos.map((photo) => photo.photoId)),
  );
  const pins = planPins(url, tablesInput, areasInput, photoRoom, currentRoomPhotos);
  for (const photoId of photoRoom.keys()) {
    if (!context.branchPhoto(photoId)) throw new NotFoundError({ url });
  }

  // Areas: by id, then by name; anything else is new.
  const keptAreas: EditorFloorArea[] = [];
  for (const input of areasInput) {
    const match =
      (input.id ? existing.areas.find((a) => a.id === input.id) : undefined) ??
      existing.areas.find((a) => key(a.name) === key(input.name));
    keptAreas.push({
      id: match?.id ?? context.newId(`area-${context.branchId}`),
      name: input.name.trim(),
      displayOrder: input.displayOrder,
      photos: (input.photoIds ?? []).map((photoId) => context.branchPhoto(photoId)!),
    });
  }
  const areaIdByName = new Map(keptAreas.map((area) => [key(area.name), area.id]));
  const keptAreaIds = new Set(keptAreas.map((area) => area.id));
  const photosByArea = new Map(
    keptAreas.map((area) => [area.id, new Set(area.photos.map((photo) => photo.photoId))]),
  );

  // Tables: by id, then by label; anything else is new.
  const matched = new Set<string>();
  const updates: { index: number; input: ReplaceFloorTableInput; table: EditorFloorTable }[] = [];
  const creates: { index: number; input: ReplaceFloorTableInput }[] = [];
  tablesInput.forEach((input, index) => {
    const label = input.label.trim();
    const table =
      (input.id ? existing.tables.find((t) => t.id === input.id) : undefined) ??
      existing.tables.find((t) => key(t.label) === key(label));
    if (table && matched.has(table.id)) {
      errors.push(`Table ${label} is matched by more than one entry in the plan.`);
      return;
    }
    if (table) {
      matched.add(table.id);
      updates.push({ index, input, table });
    } else {
      creates.push({ index, input });
    }
  });

  const omitted = existing.tables.filter((t) => !matched.has(t.id));
  const retainedLabels = new Set(
    omitted.filter((t) => context.hasHistory(t.id)).map((t) => key(t.label)),
  );
  const clashing = creates
    .filter((c) => retainedLabels.has(key(c.input.label)))
    .map((c) => c.input.label.trim());
  if (clashing.length > 0) {
    errors.push(
      `Label(s) ${clashing.join(', ')} belong to tables with history that this plan omits. ` +
        'Those tables are deactivated, not deleted, and keep their labels - reuse them by keeping the table (with its id) instead.',
    );
  }
  const seated = omitted.filter((t) => t.status === 'occupied').map((t) => t.label);
  if (seated.length > 0) {
    errors.push(
      `Table(s) ${seated.join(', ')} have a party seated at them and cannot be removed from the plan. ` +
        'Free them first, or keep them in the plan.',
    );
  }
  if (errors.length > 0) throw invalid();

  const deactivated: string[] = [];
  const removed: string[] = [];
  const tables: EditorFloorTable[] = [];

  for (const table of omitted) {
    if (!context.hasHistory(table.id)) {
      removed.push(table.label);
      continue;
    }
    const floorAreaId =
      table.floorAreaId && keptAreaIds.has(table.floorAreaId) ? table.floorAreaId : null;
    const keepsPin =
      table.pin !== null &&
      floorAreaId !== null &&
      (photosByArea.get(floorAreaId)?.has(table.pin.photoId) ?? false);
    tables.push({ ...table, isActive: false, floorAreaId, pin: keepsPin ? table.pin : null });
    deactivated.push(table.label);
  }

  const areaIdOf = (name: string | null | undefined) =>
    name == null ? null : (areaIdByName.get(key(name)) ?? null);

  for (const { index, input, table } of updates) {
    tables.push({
      ...table,
      label: input.label.trim(),
      seats: input.seats,
      floorAreaId: areaIdOf(input.floorAreaName),
      isBookable: input.isBookable,
      isActive: true,
      pin: pins[index] ?? null,
    });
  }
  for (const { index, input } of creates) {
    const id = context.newId(`tbl-${context.branchId}-new`);
    tables.push({
      id,
      label: input.label.trim(),
      seats: input.seats,
      floorAreaId: areaIdOf(input.floorAreaName),
      isBookable: input.isBookable,
      isActive: true,
      isDeletable: !context.hasHistory(id),
      status: 'free',
      qrToken: `qr-${id}`,
      pin: pins[index] ?? null,
    });
  }

  const warnings = [...validation.warnings];
  const unpinnedByRemoval = tablesInput
    .filter((input, index) => input.pin?.photoId && pins[index] === null)
    .map((input) => input.label.trim());
  if (unpinnedByRemoval.length > 0) {
    warnings.push(
      `Table(s) ${unpinnedByRemoval.join(', ')} were taken off photos this plan removed from every room.`,
    );
  }

  return {
    plan: {
      branchId: existing.branchId,
      areas: sortAreas(keptAreas),
      tables: sortTables(tables),
      // The only place the version moves.
      version: String((Number.parseInt(existing.version, 10) || 0) + 1),
    },
    warnings,
    deactivatedTables: deactivated,
    removedTables: removed,
  };
}
