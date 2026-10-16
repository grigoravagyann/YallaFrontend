import {
  MAX_ROOM_PHOTOS,
  type EditorFloorPlan,
  type EditorTablePin,
  type EditorTableStatus,
  type Photo,
  type ReplaceFloorPlanCommand,
  type TableDeletionResult,
} from '@yalla/api';

/**
 * The rooms editor's working copy, as a pure reducer.
 *
 * Rooms, their photos and every table's pin are saved together in one `PUT`
 * against the version the editor loaded (K6), so the editor holds a draft and
 * saves explicitly. Everything the server would do to a plan as a consequence
 * — a room deleted takes its tables off their pins, a photo removed takes its
 * tables off it — is done here too, so the draft on screen is the plan that
 * will be stored.
 */

export interface DraftRoom {
  /** A server id, or `new-…` for a room only this editor has seen. */
  readonly id: string;
  readonly name: string;
  readonly photos: readonly Photo[];
}

export interface DraftTable {
  readonly id: string;
  readonly label: string;
  readonly seats: number;
  readonly roomId: string | null;
  readonly isBookable: boolean;
  readonly isActive: boolean;
  /** Whether a delete would remove it rather than deactivate it. `true` for an unsaved table. */
  readonly isDeletable: boolean;
  /** The physical state the plan was read with; `null` for a table not saved yet. */
  readonly status: EditorTableStatus | null;
  /** Empty for a table not saved yet: it gets its code when the plan is saved. */
  readonly qrToken: string;
  readonly pin: EditorTablePin | null;
}

interface Snapshot {
  readonly rooms: readonly DraftRoom[];
  readonly tables: readonly DraftTable[];
}

export interface RoomsState extends Snapshot {
  readonly version: string;
  /** What the server holds, to tell an unsaved change from none. */
  readonly saved: Snapshot;
  /** For `new-…` ids. */
  readonly sequence: number;
}

export interface NewTableInput {
  readonly label: string;
  readonly seats: number;
  readonly isBookable: boolean;
}

export type RoomsAction =
  | { type: 'loaded'; plan: EditorFloorPlan }
  | { type: 'addRoom'; name: string }
  | { type: 'renameRoom'; id: string; name: string }
  | { type: 'moveRoom'; id: string; delta: -1 | 1 }
  | { type: 'removeRoom'; id: string }
  | { type: 'addPhoto'; roomId: string; photo: Photo }
  | { type: 'movePhoto'; roomId: string; photoId: string; delta: -1 | 1 }
  | { type: 'removePhoto'; roomId: string; photoId: string }
  | { type: 'addTable'; table: NewTableInput; pin: EditorTablePin }
  | { type: 'updateTable'; id: string; patch: Partial<NewTableInput> }
  | { type: 'placeTable'; id: string; pin: EditorTablePin | null }
  | { type: 'discardTable'; id: string }
  | { type: 'deleted'; result: TableDeletionResult }
  | { type: 'restoreTable'; id: string }
  | { type: 'qrReplaced'; id: string; qrToken: string };

export function initialState(): RoomsState {
  const empty: Snapshot = { rooms: [], tables: [] };
  return { ...empty, version: '', saved: empty, sequence: 0 };
}

function fromPlan(plan: EditorFloorPlan): Snapshot {
  return {
    rooms: [...plan.areas]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((area) => ({ id: area.id, name: area.name, photos: area.photos })),
    // In the order people count them — 2 before 10 — not the server's text order.
    tables: [...plan.tables]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        roomId: table.floorAreaId,
        isBookable: table.isBookable,
        isActive: table.isActive,
        isDeletable: table.isDeletable,
        status: table.status,
        qrToken: table.qrToken,
        pin: table.pin,
      })),
  };
}

/** Clamp to 0–1 and round to four places, which is well under a pixel on any photo. */
export function toFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}

const NUDGE = 0.01;

/** Where an arrow key moves a pin: a hundredth of the photo, five with shift. `null` for any other key. */
export function nudge(pin: EditorTablePin, key: string, shift: boolean): EditorTablePin | null {
  const steps: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const step = steps[key];
  if (!step) return null;
  const size = shift ? NUDGE * 5 : NUDGE;
  return {
    photoId: pin.photoId,
    x: toFraction(pin.x + step[0] * size),
    y: toFraction(pin.y + step[1] * size),
  };
}

function clampPin(pin: EditorTablePin): EditorTablePin {
  return { photoId: pin.photoId, x: toFraction(pin.x), y: toFraction(pin.y) };
}

/** Which room holds a photo, if any. */
export function roomOfPhoto(rooms: readonly DraftRoom[], photoId: string): DraftRoom | null {
  return rooms.find((room) => room.photos.some((photo) => photo.photoId === photoId)) ?? null;
}

function move<T>(items: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function mapTables(
  tables: readonly DraftTable[],
  test: (table: DraftTable) => boolean,
  change: (table: DraftTable) => DraftTable,
): readonly DraftTable[] {
  return tables.map((table) => (test(table) ? change(table) : table));
}

export function reducer(state: RoomsState, action: RoomsAction): RoomsState {
  switch (action.type) {
    case 'loaded': {
      const snapshot = fromPlan(action.plan);
      return {
        ...snapshot,
        saved: snapshot,
        version: action.plan.version,
        sequence: state.sequence,
      };
    }

    case 'addRoom': {
      const name = action.name.trim();
      if (!name) return state;
      const id = `new-room-${state.sequence + 1}`;
      return {
        ...state,
        sequence: state.sequence + 1,
        rooms: [...state.rooms, { id, name, photos: [] }],
      };
    }

    case 'renameRoom':
      return {
        ...state,
        rooms: state.rooms.map((room) =>
          room.id === action.id ? { ...room, name: action.name } : room,
        ),
      };

    case 'moveRoom':
      return {
        ...state,
        rooms: move(
          state.rooms,
          state.rooms.findIndex((room) => room.id === action.id),
          action.delta,
        ),
      };

    case 'removeRoom':
      // Its photos go with it, and its tables stay with no room and no pin —
      // what the server does to a room a plan leaves out.
      return {
        ...state,
        rooms: state.rooms.filter((room) => room.id !== action.id),
        tables: mapTables(
          state.tables,
          (table) => table.roomId === action.id,
          (table) => ({ ...table, roomId: null, pin: null }),
        ),
      };

    case 'addPhoto': {
      const target = state.rooms.find((room) => room.id === action.roomId);
      if (!target || target.photos.length >= MAX_ROOM_PHOTOS) return state;
      // A photo belongs to one room: the same picture twice would put a table in both.
      if (roomOfPhoto(state.rooms, action.photo.photoId)) return state;
      return {
        ...state,
        rooms: state.rooms.map((room) =>
          room.id === action.roomId ? { ...room, photos: [...room.photos, action.photo] } : room,
        ),
      };
    }

    case 'movePhoto':
      return {
        ...state,
        rooms: state.rooms.map((room) =>
          room.id === action.roomId
            ? {
                ...room,
                photos: move(
                  room.photos,
                  room.photos.findIndex((photo) => photo.photoId === action.photoId),
                  action.delta,
                ),
              }
            : room,
        ),
      };

    case 'removePhoto':
      return {
        ...state,
        rooms: state.rooms.map((room) =>
          room.id === action.roomId
            ? { ...room, photos: room.photos.filter((photo) => photo.photoId !== action.photoId) }
            : room,
        ),
        tables: mapTables(
          state.tables,
          (table) => table.pin?.photoId === action.photoId,
          (table) => ({ ...table, pin: null }),
        ),
      };

    case 'addTable': {
      const room = roomOfPhoto(state.rooms, action.pin.photoId);
      if (!room) return state;
      const id = `new-table-${state.sequence + 1}`;
      return {
        ...state,
        sequence: state.sequence + 1,
        tables: [
          ...state.tables,
          {
            id,
            label: action.table.label.trim(),
            seats: action.table.seats,
            roomId: room.id,
            isBookable: action.table.isBookable,
            isActive: true,
            isDeletable: true,
            status: null,
            qrToken: '',
            pin: clampPin(action.pin),
          },
        ],
      };
    }

    case 'updateTable':
      return {
        ...state,
        tables: mapTables(
          state.tables,
          (table) => table.id === action.id,
          (table) => ({ ...table, ...action.patch }),
        ),
      };

    case 'placeTable': {
      const pin = action.pin ? clampPin(action.pin) : null;
      // A pin is on one of the table's own room's photos: placing it on
      // another room's picture moves the table to that room.
      const room = pin ? roomOfPhoto(state.rooms, pin.photoId) : null;
      if (pin && !room) return state;
      return {
        ...state,
        tables: mapTables(
          state.tables,
          (table) => table.id === action.id,
          (table) => ({ ...table, pin, roomId: room ? room.id : table.roomId }),
        ),
      };
    }

    case 'discardTable':
      return { ...state, tables: state.tables.filter((table) => table.id !== action.id) };

    case 'deleted': {
      // Already done on the server, so done to the baseline as well: it is
      // not a change waiting to be saved.
      const apply = (tables: readonly DraftTable[]) =>
        action.result.deleted
          ? tables.filter((table) => table.id !== action.result.tableId)
          : mapTables(
              tables,
              (table) => table.id === action.result.tableId,
              (table) => ({ ...table, isActive: false }),
            );
      return {
        ...state,
        tables: apply(state.tables),
        saved: { ...state.saved, tables: apply(state.saved.tables) },
      };
    }

    case 'qrReplaced': {
      // Its own guarded action, already done on the server.
      const apply = (tables: readonly DraftTable[]) =>
        mapTables(
          tables,
          (table) => table.id === action.id,
          (table) => ({ ...table, qrToken: action.qrToken }),
        );
      return {
        ...state,
        tables: apply(state.tables),
        saved: { ...state.saved, tables: apply(state.saved.tables) },
      };
    }

    case 'restoreTable':
      return {
        ...state,
        tables: mapTables(
          state.tables,
          (table) => table.id === action.id,
          (table) => ({ ...table, isActive: true }),
        ),
      };
  }
}

/** Has the server seen this id? An invented one is sent as no id at all. */
export function isServerId(id: string): boolean {
  return !id.startsWith('new-');
}

function commandOf(snapshot: Snapshot, version: string): ReplaceFloorPlanCommand {
  const nameOf = new Map(snapshot.rooms.map((room) => [room.id, room.name.trim()]));
  return {
    expectedVersion: version,
    areas: snapshot.rooms.map((room, index) => ({
      ...(isServerId(room.id) ? { id: room.id } : {}),
      name: room.name.trim(),
      displayOrder: index,
      photoIds: room.photos.map((photo) => photo.photoId),
    })),
    // A deactivated table is left out: sending it would bring it back into service.
    // `qrToken` is never sent; only the explicit regenerate action changes it.
    tables: snapshot.tables
      .filter((table) => table.isActive)
      .map((table) => ({
        ...(isServerId(table.id) ? { id: table.id } : {}),
        label: table.label.trim(),
        seats: table.seats,
        floorAreaName: table.roomId ? (nameOf.get(table.roomId) ?? null) : null,
        isBookable: table.isBookable,
        pin: table.pin,
      })),
  };
}

/** The one `PUT`, against the version the editor loaded. */
export function toSaveCommand(state: RoomsState): ReplaceFloorPlanCommand {
  return commandOf(state, state.version);
}

export function isDirty(state: RoomsState): boolean {
  return (
    JSON.stringify(commandOf(state, state.version)) !==
    JSON.stringify(commandOf(state.saved, state.version))
  );
}

/** Bookable tables on no photo: saved, but diners can neither see nor book them. */
export function bookableUnpinned(state: RoomsState): readonly DraftTable[] {
  return state.tables.filter((table) => table.isActive && table.isBookable && !table.pin);
}

/** Labels used more than once among the tables in service. The server refuses these. */
export function duplicateLabels(state: RoomsState): readonly string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const table of state.tables) {
    if (!table.isActive) continue;
    const label = table.label.trim();
    const key = label.toLocaleLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  return [...counts.values()]
    .filter((entry) => entry.count > 1 && entry.label !== '')
    .map((entry) => entry.label);
}

/** Room names used more than once, ignoring case and spaces at the ends. The server refuses these. */
export function duplicateRoomNames(state: RoomsState): readonly string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const room of state.rooms) {
    const name = room.name.trim();
    const key = name.toLocaleLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }
  return [...counts.values()]
    .filter((entry) => entry.count > 1 && entry.name !== '')
    .map((entry) => entry.name);
}

/** One past the highest number in use, so a run of clicks numbers a room. */
export function nextLabel(state: RoomsState): string {
  const numbers = state.tables
    .map((table) => Number.parseInt(table.label, 10))
    .filter((value) => Number.isFinite(value));
  return String(numbers.length > 0 ? Math.max(...numbers) + 1 : state.tables.length + 1);
}
