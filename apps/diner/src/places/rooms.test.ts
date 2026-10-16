import type { FloorTable } from '@yalla/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaceRoom } from './model';
import { photoBox, roomOfTable, roomsAtSlot, statusAtSlot } from './rooms';

const photo = (photoId: string, width: number | null = 1600, height: number | null = 1200) => ({
  photoId,
  url: `https://api/${photoId}/f`,
  thumbUrl: `https://api/${photoId}/t`,
  width,
  height,
  tables: [],
});

const ROOMS: readonly PlaceRoom[] = [
  { roomId: 'hall', name: 'Hall', photos: [photo('h1'), photo('h2')] },
  { roomId: 'terrace', name: 'Terrace', photos: [photo('t1')] },
];

function table(
  id: string,
  state: FloorTable['state'],
  pin: FloorTable['pin'],
  isBookable = true,
): FloorTable {
  return {
    id,
    label: id,
    seats: 4,
    floorAreaId: null,
    floorAreaName: null,
    floorAreaDisplayOrder: 0,
    isBookable,
    state,
    nextReservationStartUtc: null,
    pin,
  };
}

describe('statusAtSlot', () => {
  it('reads the five derived states as the four a diner sees', () => {
    expect(statusAtSlot('free')).toBe('free');
    expect(statusAtSlot('reservedSoon')).toBe('reserved');
    expect(statusAtSlot('held')).toBe('reserved');
    expect(statusAtSlot('occupied')).toBe('occupied');
    expect(statusAtSlot('outOfService')).toBe('outOfService');
  });
});

describe('roomsAtSlot', () => {
  const tables = [
    table('10', 'free', { photoId: 'h2', x: 0.5, y: 0.25 }),
    table('2', 'held', { photoId: 'h2', x: 0.1, y: 0.9 }),
    table('3', 'occupied', { photoId: 't1', x: 0.3, y: 0.3 }, false),
    // On no photo: never drawn, never offered.
    table('4', 'free', null),
    // On a photo of no room this screen knows: the same.
    table('5', 'free', { photoId: 'gone', x: 0.5, y: 0.5 }),
  ];

  it('puts each table on the photo its pin names, in label order, coloured at the slot', () => {
    const rooms = roomsAtSlot(ROOMS, tables);

    expect(rooms[0]!.photos[0]!.tables).toEqual([]);
    expect(rooms[0]!.photos[1]!.tables).toEqual([
      {
        tableId: '2',
        label: '2',
        status: 'reserved',
        isBookable: true,
        capacityMin: 1,
        capacityMax: 4,
        x: 0.1,
        y: 0.9,
      },
      {
        tableId: '10',
        label: '10',
        status: 'free',
        isBookable: true,
        capacityMin: 1,
        capacityMax: 4,
        x: 0.5,
        y: 0.25,
      },
    ]);
    expect(rooms[1]!.photos[0]!.tables).toMatchObject([
      { tableId: '3', status: 'occupied', isBookable: false },
    ]);
    const drawn = rooms.flatMap((room) => room.photos.flatMap((p) => p.tables));
    expect(drawn.map((t) => t.tableId).sort()).toEqual(['10', '2', '3']);
  });

  it("takes the slot's own verdict on which tables this party can book, when given one", () => {
    const rooms = roomsAtSlot(ROOMS, tables, (tableId) => tableId !== '10');
    expect(rooms[0]!.photos[1]!.tables.find((t) => t.tableId === '10')?.isBookable).toBe(false);
  });
});

describe('label order', () => {
  afterEach(() => vi.restoreAllMocks());

  it('orders labels by their numbers, then their text, without the Collator', () => {
    // Hermes' localeCompare may ignore `{ numeric: true }` and compare code
    // units: "10" before "2". Emulate that, and the order must still hold.
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
      this: string,
      other: string,
    ) {
      return this < other ? -1 : this > other ? 1 : 0;
    });
    const labels = ['10', 'A10', '2', 'Bar', 'A2', '1', 'a3'];
    const pinned = roomsAtSlot(
      ROOMS,
      labels.map((label, i) => ({
        ...table(`t${i}`, 'free', { photoId: 'h1', x: 0.5, y: 0.5 }),
        label,
      })),
    );
    expect(pinned[0]!.photos[0]!.tables.map((t) => t.label)).toEqual([
      '1',
      '2',
      '10',
      'A2',
      'a3',
      'A10',
      'Bar',
    ]);
  });
});

describe('roomOfTable', () => {
  it('finds the room and photo a table is pinned on, or the first photo of the first room', () => {
    const rooms = roomsAtSlot(ROOMS, [table('7', 'free', { photoId: 't1', x: 0.5, y: 0.5 })]);
    expect(roomOfTable(rooms, '7')).toEqual({ roomId: 'terrace', photoIndex: 0 });
    expect(roomOfTable(rooms, 'nope')).toEqual({ roomId: 'hall', photoIndex: 0 });
    expect(roomOfTable(rooms, null)).toEqual({ roomId: 'hall', photoIndex: 0 });
    expect(roomOfTable([], null)).toBeNull();
  });
});

describe('photoBox', () => {
  // The frame is 4:3; the box is where the photo is actually drawn inside it,
  // as percentages of the frame, so a pin at a fraction of the photo lands on
  // the photo and never on the bars beside it.
  it('fills a frame of its own shape', () => {
    expect(photoBox({ width: 1600, height: 1200 }, 4 / 3)).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
  });

  it('centres a wider photo between bars above and below', () => {
    // 16:9 in 4:3: full width, 75% of the height.
    expect(photoBox({ width: 1600, height: 900 }, 4 / 3)).toEqual({
      left: 0,
      top: 12.5,
      width: 100,
      height: 75,
    });
  });

  it('centres a taller photo between bars left and right', () => {
    // 3:4 in 4:3: full height, 56.25% of the width.
    expect(photoBox({ width: 900, height: 1200 }, 4 / 3)).toEqual({
      left: 21.875,
      top: 0,
      width: 56.25,
      height: 100,
    });
  });

  it('has no box for a photo whose shape is not known yet', () => {
    expect(photoBox(null, 4 / 3)).toBeNull();
    expect(photoBox({ width: 0, height: 900 }, 4 / 3)).toBeNull();
  });
});
