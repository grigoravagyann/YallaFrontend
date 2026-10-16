import type { DerivedTableState, FloorTable } from '@yalla/api';
import type { PlaceRoom, TablePhotoMarker, TableStatus } from './model';

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

const byLabel = (a: TablePhotoMarker, b: TablePhotoMarker) =>
  a.label.localeCompare(b.label, undefined, { numeric: true });

/**
 * The rooms with every table of the slot floor on the photo its pin names.
 *
 * `bookable`, when given, is the slot's own per-table verdict for this party
 * (availability's `isBookable`); without it, the venue's flag on the table.
 */
export function roomsAtSlot(
  rooms: readonly PlaceRoom[],
  tables: readonly FloorTable[],
  bookable?: (tableId: string) => boolean,
): PlaceRoom[] {
  const onPhoto = new Map<string, TablePhotoMarker[]>();
  for (const table of tables) {
    if (!table.pin) continue;
    const pins = onPhoto.get(table.pin.photoId) ?? [];
    pins.push({
      tableId: table.id,
      label: table.label,
      status: statusAtSlot(table.state),
      isBookable: bookable ? bookable(table.id) : table.isBookable,
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
