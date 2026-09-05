import type { FloorPlanData, FloorTable } from '../types';

/**
 * Fixtures are frozen at a fixed "now" so the `reservedSoon` windows are
 * deterministic in tests. The harness passes this as its clock.
 */
export const MOCK_NOW = new Date('2026-09-04T14:30:00Z'); // 18:30 in Yerevan

const YEREVAN = 'Asia/Yerevan';

function table(over: Partial<FloorTable> & Pick<FloorTable, 'id' | 'label'>): FloorTable {
  return {
    seats: 2,
    x: 0,
    y: 0,
    width: 70,
    height: 70,
    rotationDegrees: 0,
    shape: 'rectangle',
    floorAreaName: null,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
    ...over,
  };
}

/**
 * A realistic Yerevan cafe: 11 tables across two areas, mixed shapes, all five
 * derived states represented, and one `reservedSoon` whose window closes in
 * exactly 90 minutes (20:00 Yerevan).
 */
export const cafeFloorPlan: FloorPlanData = {
  branchId: 'branch-cafe-01',
  canvasWidth: 900,
  canvasHeight: 620,
  timeZoneId: YEREVAN,
  features: [
    { id: 'f-entrance', kind: 'entrance', x: 400, y: 588, width: 110, height: 32 },
    { id: 'f-bar', kind: 'bar', x: 40, y: 40, width: 60, height: 300 },
  ],
  tables: [
    // --- Bar side: 1-4 and 9-11 ---
    table({
      id: 't1',
      label: '1',
      seats: 2,
      x: 150,
      y: 60,
      width: 70,
      height: 70,
      shape: 'round',
      floorAreaName: 'Bar',
      state: 'occupied',
      occupiedSinceUtc: '2026-09-04T13:12:00Z', // 78 min at MOCK_NOW
    }),
    table({
      id: 't2',
      label: '2',
      seats: 2,
      x: 150,
      y: 170,
      width: 70,
      height: 70,
      shape: 'round',
      floorAreaName: 'Bar',
      state: 'free',
    }),
    table({
      id: 't3',
      label: '3',
      seats: 4,
      x: 150,
      y: 280,
      width: 110,
      height: 80,
      floorAreaName: 'Bar',
      state: 'held',
    }),
    table({
      id: 't4',
      label: '4',
      seats: 4,
      x: 150,
      y: 400,
      width: 110,
      height: 80,
      floorAreaName: 'Bar',
      state: 'free',
    }),
    table({
      id: 't9',
      label: '9',
      seats: 6,
      x: 320,
      y: 400,
      width: 150,
      height: 90,
      floorAreaName: 'Bar',
      state: 'free',
      rotationDegrees: 12,
    }),
    table({
      id: 't10',
      label: '10',
      seats: 2,
      x: 320,
      y: 280,
      width: 70,
      height: 70,
      shape: 'round',
      floorAreaName: 'Bar',
      state: 'outOfService',
      isBookable: false,
    }),
    table({
      id: 't11',
      label: '11',
      seats: 8,
      x: 320,
      y: 100,
      width: 180,
      height: 110,
      floorAreaName: 'Bar',
      state: 'free',
    }),

    // --- Windows: 5-8 ---
    table({
      id: 't5',
      label: '5',
      seats: 2,
      x: 700,
      y: 60,
      width: 80,
      height: 80,
      shape: 'round',
      floorAreaName: 'Windows',
      state: 'free',
    }),
    table({
      id: 't6',
      label: '6',
      seats: 4,
      x: 690,
      y: 190,
      width: 110,
      height: 85,
      floorAreaName: 'Windows',
      // The window case: free now, booked at 20:00 Yerevan = 16:00Z.
      state: 'reservedSoon',
      nextReservationStartUtc: '2026-09-04T16:00:00Z',
    }),
    table({
      id: 't7',
      label: '7',
      seats: 4,
      x: 690,
      y: 320,
      width: 110,
      height: 85,
      floorAreaName: 'Windows',
      state: 'occupied',
      occupiedSinceUtc: '2026-09-04T14:05:00Z', // 25 min
    }),
    table({
      id: 't8',
      label: '8',
      seats: 2,
      x: 700,
      y: 450,
      width: 80,
      height: 80,
      shape: 'round',
      floorAreaName: 'Windows',
      state: 'free',
      rotationDegrees: 45,
    }),
  ],
};

/**
 * Awkward fixture 1: a terrace strip.
 *
 * 1600x220 against a portrait phone letterboxes hard — the room ends up a thin
 * band with large empty margins above and below. Exists to keep anyone from
 * "fixing" the letterboxing by stretching to fill.
 */
export const terraceFloorPlan: FloorPlanData = {
  branchId: 'branch-terrace-01',
  canvasWidth: 1600,
  canvasHeight: 220,
  timeZoneId: YEREVAN,
  features: [{ id: 'f-entrance', kind: 'entrance', x: 10, y: 90, width: 30, height: 60 }],
  tables: Array.from({ length: 9 }, (_, i) =>
    table({
      id: `tr${i + 1}`,
      label: String(i + 1),
      seats: i % 3 === 0 ? 4 : 2,
      x: 90 + i * 165,
      y: 70,
      width: i % 3 === 0 ? 120 : 80,
      height: 80,
      shape: i % 2 === 0 ? 'round' : 'rectangle',
      floorAreaName: 'Terrace',
      state: i === 4 ? 'occupied' : i === 7 ? 'reservedSoon' : 'free',
      ...(i === 7 ? { nextReservationStartUtc: '2026-09-04T15:15:00Z' } : {}),
      ...(i === 4 ? { occupiedSinceUtc: '2026-09-04T13:50:00Z' } : {}),
    }),
  ),
};

/**
 * Awkward fixture 2: a dense cluster of two-seaters.
 *
 * The fixture that proves nearest-centre hit resolution actually works. With
 * naive paint-order hit testing, taps in the gaps land on the wrong table.
 */
export const denseClusterFloorPlan: FloorPlanData = {
  branchId: 'branch-dense-01',
  canvasWidth: 900,
  canvasHeight: 600,
  timeZoneId: YEREVAN,
  features: [{ id: 'f-entrance', kind: 'entrance', x: 700, y: 570, width: 110, height: 30 }],
  // 16 two-seaters at a 70-unit pitch, packed into one corner of a normal room.
  // On a 380pt phone these draw at ~22px — half the 44pt tap floor — so every
  // hit rect expands and neighbours overlap by ~16px. That overlap is the whole
  // point: it is what nearest-centre resolution has to get right.
  tables: Array.from({ length: 16 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const states = ['free', 'free', 'occupied', 'free', 'reservedSoon', 'free'] as const;
    const state = states[i % states.length] ?? 'free';
    return table({
      id: `dc${i + 1}`,
      label: String(i + 1),
      seats: 2,
      x: 60 + col * 70,
      y: 60 + row * 70,
      width: 55,
      height: 55,
      shape: i % 2 === 0 ? 'round' : 'rectangle',
      floorAreaName: 'Hall',
      state,
      ...(state === 'reservedSoon' ? { nextReservationStartUtc: '2026-09-04T15:40:00Z' } : {}),
      ...(state === 'occupied' ? { occupiedSinceUtc: '2026-09-04T13:30:00Z' } : {}),
    });
  }),
};

/**
 * The case this package did not survive: a real restaurant.
 *
 * Thirty tables across three areas in a 1400x1000 room. On a 380pt phone the
 * room scales to roughly a quarter, every table draws well under the 44pt tap
 * floor, and the expanded hit regions overlap three and four deep — so a tap
 * resolves to the nearest centre and a diner selects table 11 while pointing
 * at table 12. This is the fixture that makes `hasOverlappingHitRects` true at
 * phone width and false on a tablet, and therefore the one that drives area
 * mode.
 *
 * Mixed shapes and a rotated row on the terrace, because a room that is all
 * axis-aligned rectangles hides the rotation bugs.
 */
export const restaurantFloorPlan: FloorPlanData = {
  branchId: 'branch-restaurant-01',
  canvasWidth: 1400,
  canvasHeight: 1000,
  timeZoneId: YEREVAN,
  features: [
    { id: 'f-entrance', kind: 'entrance', x: 650, y: 968, width: 120, height: 32 },
    { id: 'f-bar', kind: 'bar', x: 60, y: 60, width: 70, height: 380 },
    { id: 'f-kitchen', kind: 'kitchen', x: 1180, y: 60, width: 160, height: 200 },
  ],
  tables: [
    // Windows: ten two-tops down the left wall, tight pitch.
    ...Array.from({ length: 10 }, (_, i) =>
      table({
        id: `rw${i + 1}`,
        label: String(i + 1),
        seats: 2,
        x: 190,
        y: 70 + i * 88,
        width: 74,
        height: 68,
        shape: i % 2 === 0 ? 'round' : 'rectangle',
        floorAreaName: 'Windows',
        state: i === 2 ? 'occupied' : i === 6 ? 'reservedSoon' : 'free',
        ...(i === 6 ? { nextReservationStartUtc: '2026-09-04T15:20:00Z' } : {}),
        ...(i === 2 ? { occupiedSinceUtc: '2026-09-04T13:40:00Z' } : {}),
      }),
    ),
    // Bar: eight stools along the counter, the smallest things in the room.
    ...Array.from({ length: 8 }, (_, i) =>
      table({
        id: `rb${i + 1}`,
        label: String(11 + i),
        seats: 1,
        x: 420 + i * 96,
        y: 120,
        width: 56,
        height: 56,
        shape: 'round',
        floorAreaName: 'Bar',
        isBookable: i !== 7,
        state: i === 1 || i === 5 ? 'occupied' : 'free',
        ...(i === 1 || i === 5 ? { occupiedSinceUtc: '2026-09-04T14:05:00Z' } : {}),
      }),
    ),
    // Terrace: twelve tables on a grid, the back row rotated off-axis.
    ...Array.from({ length: 12 }, (_, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const states = ['free', 'free', 'occupied', 'free', 'held', 'outOfService'] as const;
      const state = states[i % states.length] ?? 'free';
      return table({
        id: `rt${i + 1}`,
        label: String(19 + i),
        seats: col === 3 ? 6 : 4,
        x: 430 + col * 220,
        y: 420 + row * 180,
        width: col === 3 ? 150 : 110,
        height: 100,
        rotationDegrees: row === 2 ? 20 : 0,
        shape: col % 2 === 0 ? 'rectangle' : 'round',
        floorAreaName: 'Terrace',
        isBookable: state !== 'outOfService',
        state,
        ...(state === 'occupied' ? { occupiedSinceUtc: '2026-09-04T13:15:00Z' } : {}),
      });
    }),
  ],
};

/**
 * Two floors, which is not one contiguous room.
 *
 * The areas sit far apart in canvas space with a wide empty band between them,
 * so the whole-room view is mostly nothing. It exists to check that Overview
 * does something sensible when the geometry is not a single rectangle, and
 * that fitting one area to its own bounds is a real improvement rather than a
 * rounding difference — each floor alone fills the viewport, where together
 * they each get less than half of it.
 */
export const twoFloorPlan: FloorPlanData = {
  branchId: 'branch-twofloor-01',
  canvasWidth: 1000,
  canvasHeight: 1500,
  timeZoneId: YEREVAN,
  features: [{ id: 'f-entrance', kind: 'entrance', x: 60, y: 40, width: 100, height: 28 }],
  tables: [
    ...Array.from({ length: 7 }, (_, i) =>
      table({
        id: `gf${i + 1}`,
        label: String(i + 1),
        seats: i === 6 ? 6 : 2,
        x: 90 + (i % 3) * 260,
        y: 110 + Math.floor(i / 3) * 170,
        width: i === 6 ? 190 : 120,
        height: 110,
        shape: i % 2 === 0 ? 'rectangle' : 'round',
        floorAreaName: 'Ground floor',
        state: i === 1 ? 'occupied' : 'free',
        ...(i === 1 ? { occupiedSinceUtc: '2026-09-04T13:55:00Z' } : {}),
      }),
    ),
    // A 700-unit gap: the stairwell. Nothing is drawn between the two floors.
    ...Array.from({ length: 6 }, (_, i) =>
      table({
        id: `uf${i + 1}`,
        label: String(8 + i),
        seats: 4,
        x: 120 + (i % 3) * 280,
        y: 1120 + Math.floor(i / 3) * 190,
        width: 140,
        height: 120,
        shape: 'rectangle',
        floorAreaName: 'Upstairs',
        state: i === 4 ? 'reservedSoon' : 'free',
        ...(i === 4 ? { nextReservationStartUtc: '2026-09-04T15:30:00Z' } : {}),
      }),
    ),
  ],
};

export const mockFloorPlans = {
  cafe: cafeFloorPlan,
  terrace: terraceFloorPlan,
  dense: denseClusterFloorPlan,
  restaurant: restaurantFloorPlan,
  twoFloor: twoFloorPlan,
} as const;

export type MockFloorPlanKey = keyof typeof mockFloorPlans;
