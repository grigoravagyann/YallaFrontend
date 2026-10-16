import type { BranchRoom } from '../contracts/places';
import type { Photo } from '../contracts/menuAdmin';
import type { DerivedTableState, FloorPlanData, FloorTable } from '../contracts/tableFloor';

/**
 * Mock branches as the server now models them: rooms with photos, and every
 * table a pin on one of its own room's photos (or on none).
 *
 * The staff floor, the diner availability and the public page all read these,
 * so the mock answers with the server's shapes — rooms, pins and live state —
 * rather than the drawn floor plan that is gone.
 */

/** Fixtures are frozen at a fixed "now" so the `reservedSoon` windows are deterministic. */
export const MOCK_FLOOR_NOW = new Date('2026-09-04T14:30:00Z'); // 18:30 in Yerevan

const YEREVAN = 'Asia/Yerevan';

/** A room of a mock branch, with its photos in the order a diner swipes them. */
export interface MockRoom {
  readonly roomId: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly photos: readonly Photo[];
}

export interface MockRoomFloor {
  readonly plan: FloorPlanData;
  readonly rooms: readonly MockRoom[];
}

/** Interior shots; any picture will do, a pin sits on fractions of it. */
const ROOM_IMAGES = [
  'photo-1517248135467-4c7edcad34c4',
  'photo-1414235077428-338989a2e8c0',
  'photo-1466978913421-dad2ebd01d17',
  'photo-1501339847302-ac426a4a7cbb',
  'photo-1453614512568-c4024d13c247',
  'photo-1521017432531-fbd92d768814',
] as const;

function roomPhoto(photoId: string, index: number): Photo {
  const image = ROOM_IMAGES[index % ROOM_IMAGES.length]!;
  const url = (width: number) =>
    `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=80`;
  return {
    photoId,
    thumbnailUrl: url(320),
    cardUrl: url(800),
    fullUrl: url(1600),
    width: 1600,
    height: 1067,
  };
}

/** A table before it is placed in a room: everything but the room and the pin. */
export type MockTableSeed = Omit<
  FloorTable,
  'floorAreaId' | 'floorAreaName' | 'floorAreaDisplayOrder' | 'pin'
> & {
  /** The room's name. */
  readonly room: string;
  /** False leaves the table off every photo: staff see it, diners are not offered it. */
  readonly pinned?: boolean;
};

export interface MockRoomSpec {
  readonly name: string;
  /** How many photos the room has. Its pinned tables are spread across them. */
  readonly photos: number;
}

const PER_ROW = 4;

/**
 * Rooms, photos and pins for a list of tables.
 *
 * Each room's pinned tables are dealt across its photos in label order and laid
 * out on a loose grid of fractions, so no two pins on one photo overlap.
 */
export function roomFloor(input: {
  readonly branchId: string;
  readonly branchName?: string;
  readonly timeZoneId?: string;
  readonly rooms: readonly MockRoomSpec[];
  readonly tables: readonly MockTableSeed[];
}): MockRoomFloor {
  const { branchId } = input;
  const rooms: MockRoom[] = input.rooms.map((spec, order) => {
    const roomId = `${branchId}-room-${order + 1}`;
    return {
      roomId,
      name: spec.name,
      displayOrder: order,
      photos: Array.from({ length: spec.photos }, (_, i) =>
        roomPhoto(`${roomId}-photo-${i + 1}`, order + i),
      ),
    };
  });

  const placed: FloorTable[] = [];
  for (const room of rooms) {
    const inRoom = input.tables.filter((table) => table.room === room.name);
    const pinned = inRoom.filter((table) => table.pinned !== false);
    const perPhoto = Math.max(1, Math.ceil(pinned.length / Math.max(1, room.photos.length)));

    for (const seed of inRoom) {
      const { room: _room, pinned: _pinned, ...table } = seed;
      const index = pinned.indexOf(seed);
      const photo = index >= 0 ? room.photos[Math.floor(index / perPhoto)] : undefined;
      const slot = index % perPhoto;
      const rows = Math.max(1, Math.ceil(perPhoto / PER_ROW));
      placed.push({
        ...table,
        floorAreaId: room.roomId,
        floorAreaName: room.name,
        floorAreaDisplayOrder: room.displayOrder,
        pin: photo
          ? {
              photoId: photo.photoId,
              x: round(0.15 + ((slot % PER_ROW) + 0.5) * (0.7 / PER_ROW)),
              y: round(0.2 + (Math.floor(slot / PER_ROW) + 0.5) * (0.6 / rows)),
            }
          : null,
      });
    }
  }

  return {
    plan: {
      branchId,
      ...(input.branchName ? { branchName: input.branchName } : {}),
      timeZoneId: input.timeZoneId ?? YEREVAN,
      tables: placed,
    },
    rooms,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function table(
  over: Partial<MockTableSeed> & Pick<MockTableSeed, 'id' | 'label' | 'room'>,
): MockTableSeed {
  return {
    seats: 2,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
    ...over,
  };
}

/**
 * A realistic Yerevan cafe: 11 tables across two rooms, all five derived states
 * represented, one `reservedSoon` whose window closes at 20:00 Yerevan, and one
 * out-of-service table on no photo.
 */
export const cafeRoomFloor: MockRoomFloor = roomFloor({
  branchId: 'branch-cafe-01',
  rooms: [
    { name: 'Bar', photos: 2 },
    { name: 'Windows', photos: 1 },
  ],
  tables: [
    table({
      id: 't1',
      label: '1',
      room: 'Bar',
      state: 'occupied',
      occupiedSinceUtc: '2026-09-04T13:12:00Z', // 78 min at MOCK_FLOOR_NOW
    }),
    table({ id: 't2', label: '2', room: 'Bar' }),
    table({ id: 't3', label: '3', seats: 4, room: 'Bar', state: 'held' }),
    table({ id: 't4', label: '4', seats: 4, room: 'Bar' }),
    table({ id: 't9', label: '9', seats: 6, room: 'Bar' }),
    table({
      id: 't10',
      label: '10',
      room: 'Bar',
      state: 'outOfService',
      isBookable: false,
      pinned: false,
    }),
    table({ id: 't11', label: '11', seats: 8, room: 'Bar' }),
    table({ id: 't5', label: '5', room: 'Windows' }),
    table({
      id: 't6',
      label: '6',
      seats: 4,
      room: 'Windows',
      // Free now, booked at 20:00 Yerevan = 16:00Z.
      state: 'reservedSoon',
      nextReservationStartUtc: '2026-09-04T16:00:00Z',
    }),
    table({
      id: 't7',
      label: '7',
      seats: 4,
      room: 'Windows',
      state: 'occupied',
      occupiedSinceUtc: '2026-09-04T14:05:00Z', // 25 min
    }),
    table({ id: 't8', label: '8', room: 'Windows' }),
  ],
});

/** The cafe's tables, for tests that only need the list. */
export const cafeFloorPlan: FloorPlanData = cafeRoomFloor.plan;

/** Thirty tables across three rooms: a real restaurant, several photos a room. */
export function restaurantRoomFloor(branchId: string): MockRoomFloor {
  const terrace: readonly DerivedTableState[] = [
    'free',
    'free',
    'occupied',
    'free',
    'held',
    'outOfService',
  ];
  return roomFloor({
    branchId,
    rooms: [
      { name: 'Windows', photos: 2 },
      { name: 'Bar', photos: 1 },
      { name: 'Terrace', photos: 3 },
    ],
    tables: [
      ...Array.from({ length: 10 }, (_, i) =>
        table({
          id: `${branchId}-rw${i + 1}`,
          label: String(i + 1),
          room: 'Windows',
          state: i === 2 ? 'occupied' : i === 6 ? 'reservedSoon' : 'free',
          ...(i === 6 ? { nextReservationStartUtc: '2026-09-04T15:20:00Z' } : {}),
          ...(i === 2 ? { occupiedSinceUtc: '2026-09-04T13:40:00Z' } : {}),
        }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        table({
          id: `${branchId}-rb${i + 1}`,
          label: String(11 + i),
          seats: 1,
          room: 'Bar',
          isBookable: i !== 7,
          state: i === 1 || i === 5 ? 'occupied' : 'free',
          ...(i === 1 || i === 5 ? { occupiedSinceUtc: '2026-09-04T14:05:00Z' } : {}),
        }),
      ),
      ...Array.from({ length: 12 }, (_, i) => {
        const state = terrace[i % terrace.length] ?? 'free';
        return table({
          id: `${branchId}-rt${i + 1}`,
          label: String(19 + i),
          seats: i % 4 === 3 ? 6 : 4,
          room: 'Terrace',
          isBookable: state !== 'outOfService',
          state,
          ...(state === 'occupied' ? { occupiedSinceUtc: '2026-09-04T13:15:00Z' } : {}),
        });
      }),
    ],
  });
}

/**
 * The public rooms read: rooms that have a photo, each photo with the tables
 * pinned on it by label, states collapsed to the four a diner sees.
 */
export function publicRooms(
  rooms: readonly MockRoom[],
  tables: readonly FloorTable[],
): BranchRoom[] {
  return rooms
    .filter((room) => room.photos.length > 0)
    .map((room) => ({
      roomId: room.roomId,
      name: room.name,
      displayOrder: room.displayOrder,
      photos: room.photos.map((photo) => ({
        photo,
        tables: tables
          .filter((table) => table.pin?.photoId === photo.photoId)
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
          .map((table) => ({
            tableId: table.id,
            label: table.label,
            seats: table.seats,
            isBookable: table.isBookable,
            // The server's collapse: reserved soon and held are "reserved";
            // occupied and out of service keep their own names.
            status:
              table.state === 'free'
                ? ('free' as const)
                : table.state === 'reservedSoon' || table.state === 'held'
                  ? ('reserved' as const)
                  : table.state === 'outOfService'
                    ? ('outOfService' as const)
                    : ('occupied' as const),
            x: table.pin!.x,
            y: table.pin!.y,
          })),
      })),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
