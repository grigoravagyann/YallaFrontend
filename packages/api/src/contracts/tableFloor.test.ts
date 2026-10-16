import { describe, expect, it } from 'vitest';
import { groupByRoom, type FloorTable } from './tableFloor';

function table(id: string, label: string, room: { id: string | null; name: string | null }) {
  return {
    id,
    label,
    seats: 2,
    floorAreaId: room.id,
    floorAreaName: room.name,
    floorAreaDisplayOrder: 0,
    pin: null,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
  } satisfies FloorTable;
}

describe('groupByRoom', () => {
  it('keeps two rooms with the same order and name apart instead of interleaving them', () => {
    const a = { id: 'room-a', name: 'Hall' };
    const b = { id: 'room-b', name: 'Hall' };
    const groups = groupByRoom([
      table('1', '1', a),
      table('2', '2', b),
      table('3', '3', a),
      table('4', '4', b),
    ]);

    expect(groups.map((group) => [group.roomId, group.tables.map((t) => t.label)])).toEqual([
      ['room-a', ['1', '3']],
      ['room-b', ['2', '4']],
    ]);
  });

  it('groups tables whose room has no id by its name, and tables in no room last', () => {
    const groups = groupByRoom([
      table('1', '1', { id: null, name: 'Bar' }),
      table('2', '2', { id: null, name: null }),
      table('3', '3', { id: null, name: 'Bar' }),
    ]);

    expect(groups.map((group) => [group.roomName, group.tables.length])).toEqual([
      ['Bar', 2],
      [null, 1],
    ]);
  });
});
