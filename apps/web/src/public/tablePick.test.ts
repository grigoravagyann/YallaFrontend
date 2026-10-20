import type { FloorTable, PublicRoom } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  freeCountByRoom,
  isPickable,
  largestOfferedTable,
  pickTableFor,
  roomOf,
} from './tablePick';

/**
 * "Choose for me" (public-page HANDOFF §3): on the client only, the smallest
 * free table that fits the party, in the room on screen first and then the
 * others in the venue's order. No new endpoint: the room's own answer for the
 * slot is the whole input.
 */

const photo = (id: string) => ({
  photoId: id,
  thumbnailUrl: `https://cdn.test/${id}/thumb`,
  cardUrl: `https://cdn.test/${id}/card`,
  fullUrl: `https://cdn.test/${id}/full`,
  width: 1600,
  height: 1200,
});

const ROOMS: readonly PublicRoom[] = [
  { roomId: 'hall', name: 'Hall', displayOrder: 0, photos: [photo('h1'), photo('h2')] },
  { roomId: 'terrace', name: 'Terrace', displayOrder: 1, photos: [photo('t1')] },
  { roomId: 'vip', name: 'VIP', displayOrder: 2, photos: [photo('v1')] },
];

function table(id: string, seats: number, photoId: string | null, over: Partial<FloorTable> = {}) {
  const room = ROOMS.find((candidate) =>
    candidate.photos.some((entry) => entry.photoId === photoId),
  );
  return {
    id,
    label: id,
    seats,
    floorAreaId: room?.roomId ?? null,
    floorAreaName: room?.name ?? null,
    floorAreaDisplayOrder: room?.displayOrder ?? 0,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
    pin: photoId ? { photoId, x: 0.5, y: 0.5 } : null,
    ...over,
  } satisfies FloorTable;
}

describe('choosing a table for the visitor', () => {
  it('takes only a table the server gives this party now, and free', () => {
    const picked = pickTableFor({
      tables: [
        // Too small or too large for the party: the server says so, not the seats.
        table('1', 2, 'h1', { isBookable: false }),
        table('2', 4, 'h1', { state: 'reservedSoon', isBookable: false }),
        table('3', 4, 'h1', { state: 'outOfService', isBookable: false }),
        table('4', 6, 'h1'),
      ],
      rooms: ROOMS,
      partySize: 3,
      currentRoomId: 'hall',
    });
    expect(picked?.id).toBe('4');
  });

  it('takes the smallest that fits, the label breaking a tie', () => {
    const picked = pickTableFor({
      tables: [table('12', 6, 'h1'), table('10', 4, 'h2'), table('9', 4, 'h1')],
      rooms: ROOMS,
      partySize: 4,
      currentRoomId: 'hall',
    });
    expect(picked?.id).toBe('9');
  });

  it('prefers a table with a seat for everyone over a smaller one the venue would squeeze', () => {
    const picked = pickTableFor({
      tables: [table('1', 2, 'h1'), table('2', 4, 'h1')],
      rooms: ROOMS,
      partySize: 3,
      currentRoomId: 'hall',
    });
    expect(picked?.id).toBe('2');
  });

  it('looks in the room on screen first, then the others in order', () => {
    const tables = [table('h', 6, 'h1'), table('t', 2, 't1'), table('v', 2, 'v1')];
    expect(pickTableFor({ tables, rooms: ROOMS, partySize: 2, currentRoomId: 'hall' })?.id).toBe(
      'h',
    );
    expect(pickTableFor({ tables, rooms: ROOMS, partySize: 2, currentRoomId: 'vip' })?.id).toBe(
      'v',
    );
    // Nothing free in the room on screen: the next room in the venue's order.
    expect(
      pickTableFor({
        tables: [table('h', 2, 'h1', { state: 'occupied', isBookable: false }), ...tables.slice(1)],
        rooms: ROOMS,
        partySize: 2,
        currentRoomId: 'hall',
      })?.id,
    ).toBe('t');
  });

  it('never picks a table that is on no photo, which the room does not show', () => {
    expect(
      pickTableFor({
        tables: [table('a', 2, null), table('b', 2, 'gone')],
        rooms: ROOMS,
        partySize: 2,
        currentRoomId: 'hall',
      }),
    ).toBeNull();
  });

  it('finds nothing when nothing fits', () => {
    expect(
      pickTableFor({
        tables: [table('1', 2, 'h1', { isBookable: false })],
        rooms: ROOMS,
        partySize: 8,
        currentRoomId: null,
      }),
    ).toBeNull();
  });
});

describe('what the rooms say', () => {
  const TABLES = [
    table('1', 2, 'h1'),
    table('2', 4, 'h2', { state: 'reservedSoon', isBookable: false }),
    // Free at the slot, not for this party.
    table('3', 8, 'h2', { isBookable: false }),
    table('4', 2, 't1'),
    table('5', 10, null),
  ];

  it('counts the tables a visitor can take in each room', () => {
    expect(freeCountByRoom(TABLES, ROOMS, true)).toEqual({ hall: 1, terrace: 1, vip: 0 });
  });

  it('counts every free table when the venue takes no web bookings', () => {
    expect(freeCountByRoom(TABLES, ROOMS, false)).toEqual({ hall: 2, terrace: 1, vip: 0 });
  });

  it('places a table in the room whose photo carries its pin', () => {
    expect(roomOf(TABLES[1]!, ROOMS)?.roomId).toBe('hall');
    expect(roomOf(TABLES[4]!, ROOMS)).toBeNull();
  });

  it('knows the largest table on offer, leaving out the ones on no photo', () => {
    expect(largestOfferedTable(TABLES, ROOMS)).toBe(8);
    expect(largestOfferedTable([], ROOMS)).toBeNull();
  });

  it('calls a table pickable only when the server gives it and it is free', () => {
    expect(isPickable(TABLES[0]!)).toBe(true);
    expect(isPickable(TABLES[1]!)).toBe(false);
    expect(isPickable(TABLES[2]!)).toBe(false);
  });
});
