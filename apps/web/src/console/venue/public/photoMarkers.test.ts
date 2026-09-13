import type { EditorFloorPlan, EditorFloorTable } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { positionsFromPlan, toFraction, withPhotoPositions } from './photoMarkers';

function table(over: Partial<EditorFloorTable>): EditorFloorTable {
  return {
    id: 't1',
    label: '1',
    seats: 2,
    x: 10,
    y: 20,
    width: 80,
    height: 80,
    rotationDegrees: 0,
    shape: 'round',
    floorAreaId: 'a1',
    isBookable: true,
    isActive: true,
    qrToken: 'qr-1',
    ...over,
  };
}

const PLAN: EditorFloorPlan = {
  branchId: 'b1',
  floorWidth: 1000,
  floorHeight: 800,
  areas: [{ id: 'a1', name: 'Hall', displayOrder: 0 }],
  tables: [
    table({ id: 't1', label: '1', photoX: 0.2, photoY: 0.3 }),
    table({ id: 't2', label: '2', floorAreaId: null }),
    table({ id: 't3', label: '3', isActive: false, photoX: 0.9, photoY: 0.9 }),
  ],
};

describe('table photo positions', () => {
  it('reads positions for active tables only', () => {
    const positions = positionsFromPlan(PLAN);
    expect([...positions.entries()]).toEqual([
      ['t1', { x: 0.2, y: 0.3 }],
      ['t2', null],
    ]);
  });

  it('sends the room back unchanged apart from the positions', () => {
    const command = withPhotoPositions(
      PLAN,
      new Map([
        ['t1', null],
        ['t2', { x: 0.123456, y: 1.4 }],
      ]),
    );

    expect(command.floorWidth).toBe(1000);
    expect(command.areas).toEqual([{ id: 'a1', name: 'Hall', displayOrder: 0 }]);
    // The deactivated table stays retired.
    expect(command.tables.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(command.tables[0]).toMatchObject({
      label: '1',
      x: 10,
      y: 20,
      floorAreaName: 'Hall',
      photoX: null,
      photoY: null,
    });
    expect(command.tables[1]).toMatchObject({ floorAreaName: null, photoX: 0.1235, photoY: 1 });
    expect(command.tables[0]).not.toHaveProperty('qrToken');
  });

  it('keeps the stored position of a table the draft does not mention', () => {
    const command = withPhotoPositions(PLAN, new Map());
    expect(command.tables[0]).toMatchObject({ photoX: 0.2, photoY: 0.3 });
  });

  it('clamps fractions to 0–1', () => {
    expect(toFraction(-0.5)).toBe(0);
    expect(toFraction(2)).toBe(1);
    expect(toFraction(Number.NaN)).toBe(0);
  });
});
