import type {
  DerivedTableState,
  FloorTable,
  SlotFloor,
  TableAvailability,
  TableUnavailableReason,
} from '@yalla/api';
import type { PlaceRoom, TableRequestKind, TablePhotoMarker, TableStatus } from './model';

/**
 * Rooms, their photos and the pins on them, for one slot.
 *
 * The rooms read says what each room looks like — its photos, in the venue's
 * order — and the slot floor says where every table stands and what state it
 * will be in **at the slot**. A table the server offers is pinned on a photo of
 * its own room (the server's rule); one with no pin, or on a photo this screen
 * does not have, is not drawn and so is not offered.
 */

/** The server's five derived states as the four colours a diner reads. */
export function statusAtSlot(state: DerivedTableState): TableStatus {
  switch (state) {
    case 'free':
      return 'free';
    case 'reservedSoon':
    case 'held':
      return 'reserved';
    case 'occupied':
      return 'occupied';
    case 'outOfService':
      return 'outOfService';
  }
}

/**
 * "2" before "10", "A2" before "A10": labels compared run by run, digits by
 * their value and the rest as case-folded text, a number before a word.
 *
 * Not `localeCompare(…, { numeric: true })`: Hermes' Collator may ignore the
 * option and compare code units, which puts table 10 before table 2.
 */
function compareLabels(a: string, b: string): number {
  const runs = (label: string) => label.match(/\d+|\D+/gu) ?? [];
  const left = runs(a);
  const right = runs(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i]!;
    const y = right[i]!;
    const xNumber = /^\d/u.test(x);
    const yNumber = /^\d/u.test(y);
    if (xNumber && yNumber) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) return difference;
    } else if (xNumber !== yNumber) {
      return xNumber ? -1 : 1;
    } else {
      const xText = x.toLowerCase();
      const yText = y.toLowerCase();
      if (xText !== yText) return xText < yText ? -1 : 1;
    }
  }
  if (left.length !== right.length) return left.length - right.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

const byLabel = (a: TablePhotoMarker, b: TablePhotoMarker) => compareLabels(a.label, b.label);

/**
 * The rooms with every table of the slot floor on the photo its pin names.
 *
 * `bookable`, when given, is the slot's own per-table verdict for this party
 * (availability's `isBookable`); without it, the venue's flag on the table.
 * `reasonOf` is the server's reason for a refusal, carried onto the pin so it
 * can say why rather than guess. `requestOf` marks a table this party can
 * have only by asking — never one it cannot book at all.
 */
export function roomsAtSlot(
  rooms: readonly PlaceRoom[],
  tables: readonly FloorTable[],
  bookable?: (tableId: string) => boolean,
  reasonOf?: (tableId: string) => TableUnavailableReason | null,
  requestOf?: (tableId: string) => TableRequestKind | null,
): PlaceRoom[] {
  const onPhoto = new Map<string, TablePhotoMarker[]>();
  for (const table of tables) {
    if (!table.pin) continue;
    const pins = onPhoto.get(table.pin.photoId) ?? [];
    const isBookable = bookable ? bookable(table.id) : table.isBookable;
    pins.push({
      tableId: table.id,
      label: table.label,
      status: statusAtSlot(table.state),
      isBookable,
      ...(reasonOf ? { unavailableReason: reasonOf(table.id) } : {}),
      ...(requestOf ? { request: isBookable ? requestOf(table.id) : null } : {}),
      // Tables have seats and no minimum party; one person may book any table.
      capacityMin: 1,
      capacityMax: table.seats,
      x: table.pin.x,
      y: table.pin.y,
    });
    onPhoto.set(table.pin.photoId, pins);
  }
  return rooms.map((room) => ({
    ...room,
    photos: room.photos.map((photo) => ({
      ...photo,
      tables: [...(onPhoto.get(photo.photoId) ?? [])].sort(byLabel),
    })),
  }));
}

/**
 * Where to open the rooms: on the photo a table is pinned on, so a diner who
 * picked table 7 on the Terrace sees the Terrace; else the first room's first
 * photo. `null` when there are no rooms.
 */
export function roomOfTable(
  rooms: readonly PlaceRoom[],
  tableId: string | null,
): { roomId: string; photoIndex: number } | null {
  if (tableId) {
    for (const room of rooms) {
      const photoIndex = room.photos.findIndex((photo) =>
        photo.tables.some((table) => table.tableId === tableId),
      );
      if (photoIndex >= 0) return { roomId: room.roomId, photoIndex };
    }
  }
  const first = rooms[0];
  return first ? { roomId: first.roomId, photoIndex: 0 } : null;
}

/** Percentages of the frame. */
export interface PhotoBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a photo is drawn inside a frame of `frameAspect` (width / height) when
 * it is scaled to fit whole: full width with bars above and below for a wider
 * photo, full height with bars at the sides for a taller one.
 *
 * Pins are placed on this box, never on the frame, so a pin at 0.2 of the
 * photo is at 0.2 of the photo whatever its shape. `null` while the photo's
 * size is unknown: then there is no honest place to put a pin yet.
 */
export function photoBox(
  size: { readonly width: number; readonly height: number } | null,
  frameAspect: number,
): PhotoBox | null {
  if (!size || size.width <= 0 || size.height <= 0 || frameAspect <= 0) return null;
  const aspect = size.width / size.height;
  if (aspect >= frameAspect) {
    const height = (frameAspect / aspect) * 100;
    return { left: 0, top: (100 - height) / 2, width: 100, height };
  }
  const width = (aspect / frameAspect) * 100;
  return { left: (100 - width) / 2, top: 0, width, height: 100 };
}

/** Refusals about the time asked for, not about any one table or the party. */
const SLOT_WIDE: readonly TableUnavailableReason[] = [
  'closed',
  'pastLeadTime',
  'tooFarAhead',
  'invalidTime',
];

/**
 * Why nothing can be booked at this slot, when the reason is the time itself:
 * the server's whole-request `rejection`, or the same time-wide reason on every
 * table. `null` when the slot is open, so "no table seats 2" is the right words.
 *
 * Without this, a venue shut at 23:30 read as "no free table seats 2 guests,
 * try another party size" (QA 20261016T2 B2).
 */
export function slotRefusal(
  floor: Pick<SlotFloor, 'rejection'> & { readonly tables: readonly TableAvailability[] },
): TableUnavailableReason | null {
  if (floor.rejection) return floor.rejection;
  const [first, ...rest] = floor.tables;
  const reason = first?.unavailableReason ?? null;
  if (!first || first.isBookable || !reason || !SLOT_WIDE.includes(reason)) return null;
  return rest.every((table) => !table.isBookable && table.unavailableReason === reason)
    ? reason
    : null;
}

/** The party does not fit the table: the refusal a hollow, dashed pin draws. */
export function isPartyFitReason(reason: TableUnavailableReason | null | undefined): boolean {
  return reason === 'tooSmall' || reason === 'tooLarge';
}
