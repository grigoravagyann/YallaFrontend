import type { EditorFloorPlan, EditorFloorTable } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  changedPositions,
  positionsCommand,
  positionsFromAnswer,
  positionsFromPlan,
  toFraction,
} from './photoMarkers';

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
  version: 'v1',
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

  it('names only the pins that moved, placed or cleared since the last save', () => {
    const saved = new Map([
      ['t1', { x: 0.2, y: 0.3 }],
      ['t2', null],
      ['t4', { x: 0.5, y: 0.5 }],
    ]);
    const draft = new Map([
      ['t1', { x: 0.2, y: 0.3 }],
      ['t2', { x: 0.6, y: 0.1 }],
      ['t4', null],
    ]);
    expect([...changedPositions(draft, saved).entries()]).toEqual([
      ['t2', { x: 0.6, y: 0.1 }],
      ['t4', null],
    ]);
  });

  it('sends the changed pins against the cover they were placed on, and nothing about the room', () => {
    const command = positionsCommand(
      'cover-1',
      new Map([
        ['t1', null],
        ['t2', { x: 0.123456, y: 1.4 }],
      ]),
    );

    expect(command).toEqual({
      coverPhotoId: 'cover-1',
      positions: [
        { tableId: 't1', photoX: null, photoY: null },
        { tableId: 't2', photoX: 0.1235, photoY: 1 },
      ],
    });
  });

  it('reads the answer back as positions for every table it lists', () => {
    const positions = positionsFromAnswer({
      coverPhotoId: 'cover-1',
      tables: [
        { tableId: 't1', label: '1', photoX: 0.4, photoY: 0.6 },
        { tableId: 't2', label: '2', photoX: null, photoY: null },
      ],
    });
    expect([...positions.entries()]).toEqual([
      ['t1', { x: 0.4, y: 0.6 }],
      ['t2', null],
    ]);
  });

  it('clamps fractions to 0–1', () => {
    expect(toFraction(-0.5)).toBe(0);
    expect(toFraction(2)).toBe(1);
    expect(toFraction(Number.NaN)).toBe(0);
  });
});
