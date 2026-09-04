import { describe, expect, it } from 'vitest';
import { pickTableAt } from './hitTest';
import {
  MIN_FONT_SIZE_PX,
  MIN_TAP_TARGET_PX,
  STAFF_MIN_TAP_TARGET_PX,
  computeFloorLayout,
  estimateTextWidth,
  isTableSelectable,
} from './layout';
import { cafeFloorPlan, denseClusterFloorPlan, terraceFloorPlan } from './mocks';
import type { FloorTable } from './types';

const t = (over: Partial<FloorTable> & Pick<FloorTable, 'id'>): FloorTable => ({
  label: over.id,
  seats: 2,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotationDegrees: 0,
  shape: 'rectangle',
  floorAreaName: null,
  isBookable: true,
  state: 'free',
  nextReservationStartUtc: null,
  ...over,
});

const PHONE = { width: 380, height: 700 };
const TABLET = { width: 1024, height: 768 };
const DESKTOP = { width: 1440, height: 900 };

// ---------------------------------------------------------------------------
// 1. Letterboxing, no overflow
// ---------------------------------------------------------------------------
describe('letterboxing', () => {
  it('fits a wide room inside a portrait viewport without overflow', () => {
    const layout = computeFloorLayout({
      canvasWidth: 1600,
      canvasHeight: 220,
      tables: [],
      viewport: PHONE,
      padding: 0,
    });

    expect(layout.renderedWidth).toBeLessThanOrEqual(PHONE.width);
    expect(layout.renderedHeight).toBeLessThanOrEqual(PHONE.height);
    // Width is the limiting axis for a wide room in a narrow viewport.
    expect(layout.renderedWidth).toBeCloseTo(PHONE.width, 6);
    // Centred vertically in the leftover space.
    expect(layout.offsetY).toBeCloseTo((PHONE.height - layout.renderedHeight) / 2, 6);
    expect(layout.offsetX).toBeCloseTo(0, 6);
  });

  it('fits a tall room inside a landscape viewport without overflow', () => {
    const layout = computeFloorLayout({
      canvasWidth: 220,
      canvasHeight: 1600,
      tables: [],
      viewport: TABLET,
      padding: 0,
    });

    expect(layout.renderedHeight).toBeCloseTo(TABLET.height, 6);
    expect(layout.renderedWidth).toBeLessThanOrEqual(TABLET.width);
    expect(layout.offsetX).toBeCloseTo((TABLET.width - layout.renderedWidth) / 2, 6);
    expect(layout.offsetY).toBeCloseTo(0, 6);
  });

  it('keeps every table inside the drawn room, in every fixture and viewport', () => {
    for (const plan of [cafeFloorPlan, terraceFloorPlan, denseClusterFloorPlan]) {
      for (const viewport of [PHONE, TABLET, DESKTOP]) {
        const layout = computeFloorLayout({
          canvasWidth: plan.canvasWidth,
          canvasHeight: plan.canvasHeight,
          tables: plan.tables,
          viewport,
        });
        const right = layout.offsetX + layout.renderedWidth;
        const bottom = layout.offsetY + layout.renderedHeight;

        for (const laid of layout.tables) {
          expect(laid.rect.x).toBeGreaterThanOrEqual(layout.offsetX - 0.001);
          expect(laid.rect.y).toBeGreaterThanOrEqual(layout.offsetY - 0.001);
          expect(laid.rect.x + laid.rect.width).toBeLessThanOrEqual(right + 0.001);
          expect(laid.rect.y + laid.rect.height).toBeLessThanOrEqual(bottom + 0.001);
        }
      }
    }
  });

  it('returns scale 0 rather than NaN for an unmeasured viewport', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: cafeFloorPlan.tables,
      viewport: { width: 0, height: 0 },
    });
    expect(layout.scale).toBe(0);
    expect(layout.tables).toEqual([]);
    expect(Number.isFinite(layout.offsetX)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Aspect ratio preserved
// ---------------------------------------------------------------------------
describe('aspect ratio', () => {
  it('keeps a square table square at every scale', () => {
    const square = t({ id: 'sq', width: 100, height: 100, x: 10, y: 10 });

    for (const viewport of [PHONE, TABLET, DESKTOP, { width: 200, height: 1200 }]) {
      const layout = computeFloorLayout({
        canvasWidth: 900,
        canvasHeight: 600,
        tables: [square],
        viewport,
      });
      const laid = layout.tables[0];
      expect(laid).toBeDefined();
      expect(laid!.rect.width).toBeCloseTo(laid!.rect.height, 6);
    }
  });

  it('scales both axes by the same factor', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'a', width: 200, height: 100 })],
      viewport: TABLET,
    });
    const laid = layout.tables[0]!;
    expect(laid.rect.width / laid.rect.height).toBeCloseTo(2, 6);
  });

  it('preserves the room aspect ratio across wildly different viewports', () => {
    const ratios = [PHONE, TABLET, DESKTOP].map((viewport) => {
      const l = computeFloorLayout({
        canvasWidth: 1600,
        canvasHeight: 220,
        tables: [],
        viewport,
      });
      return l.renderedWidth / l.renderedHeight;
    });
    for (const r of ratios) expect(r).toBeCloseTo(1600 / 220, 6);
  });
});

// ---------------------------------------------------------------------------
// 3. Minimum tap target
// ---------------------------------------------------------------------------
describe('minimum tap target', () => {
  it('expands the hit rect of a tiny table while leaving the drawn rect small', () => {
    const layout = computeFloorLayout({
      canvasWidth: 4000,
      canvasHeight: 4000,
      tables: [t({ id: 'small', x: 2000, y: 2000, width: 60, height: 60 })],
      viewport: PHONE,
    });
    const laid = layout.tables[0]!;

    // Drawn tiny...
    expect(laid.rect.width).toBeLessThan(MIN_TAP_TARGET_PX);
    // ...but reachable.
    expect(laid.hitRect.width).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    expect(laid.hitRect.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    expect(laid.hitExpanded).toBe(true);
  });

  it('centres the expanded hit rect on the table', () => {
    const layout = computeFloorLayout({
      canvasWidth: 4000,
      canvasHeight: 4000,
      tables: [t({ id: 'small', x: 2000, y: 2000, width: 60, height: 60 })],
      viewport: PHONE,
    });
    const laid = layout.tables[0]!;
    expect(laid.hitRect.x + laid.hitRect.width / 2).toBeCloseTo(laid.center.x, 6);
    expect(laid.hitRect.y + laid.hitRect.height / 2).toBeCloseTo(laid.center.y, 6);
  });

  it('does not shrink a table that already exceeds the minimum', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'big', x: 100, y: 100, width: 300, height: 200 })],
      viewport: DESKTOP,
    });
    const laid = layout.tables[0]!;
    expect(laid.hitExpanded).toBe(false);
    expect(laid.hitRect.width).toBeCloseTo(laid.rect.width, 6);
  });

  it('uses a larger floor in staff mode', () => {
    const args = {
      canvasWidth: 4000,
      canvasHeight: 4000,
      tables: [t({ id: 'small', x: 2000, y: 2000, width: 60, height: 60 })],
      viewport: TABLET,
    } as const;

    const diner = computeFloorLayout({ ...args, mode: 'diner' });
    const staff = computeFloorLayout({ ...args, mode: 'staff' });

    expect(diner.tables[0]!.hitRect.width).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    expect(staff.tables[0]!.hitRect.width).toBeGreaterThanOrEqual(STAFF_MIN_TAP_TARGET_PX);
    expect(staff.tables[0]!.hitRect.width).toBeGreaterThan(diner.tables[0]!.hitRect.width);
  });

  it('every table in the dense cluster is reachable on a phone', () => {
    const layout = computeFloorLayout({
      canvasWidth: denseClusterFloorPlan.canvasWidth,
      canvasHeight: denseClusterFloorPlan.canvasHeight,
      tables: denseClusterFloorPlan.tables,
      viewport: PHONE,
    });
    for (const laid of layout.tables) {
      expect(laid.hitRect.width).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
      expect(laid.hitRect.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Overlapping hit rects resolve to nearest centre
// ---------------------------------------------------------------------------
describe('overlapping hit regions', () => {
  const layout = computeFloorLayout({
    canvasWidth: denseClusterFloorPlan.canvasWidth,
    canvasHeight: denseClusterFloorPlan.canvasHeight,
    tables: denseClusterFloorPlan.tables,
    viewport: PHONE,
    mode: 'staff', // everything selectable, so nothing is filtered out
  });

  it('actually produces overlapping hit rects (the fixture earns its keep)', () => {
    let overlaps = 0;
    const rects = layout.tables.map((l) => l.hitRect);
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]!;
        const b = rects[j]!;
        const hit =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        if (hit) overlaps += 1;
      }
    }
    expect(overlaps).toBeGreaterThan(0);
  });

  it('resolves a tap to the nearest table centre, not to paint order', () => {
    for (const laid of layout.tables) {
      const picked = pickTableAt(laid.center, layout.tables);
      expect(picked?.id).toBe(laid.id);
    }
  });

  it('resolves a point between two tables to the closer one', () => {
    const [a, b] = layout.tables;
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    // 30% of the way from a to b — unambiguously nearer a.
    const probe = {
      x: a!.center.x + (b!.center.x - a!.center.x) * 0.3,
      y: a!.center.y + (b!.center.y - a!.center.y) * 0.3,
    };
    expect(pickTableAt(probe, layout.tables)?.id).toBe(a!.id);
  });

  it('is independent of the order tables arrive in', () => {
    const reversed = { ...layout, tables: [...layout.tables].reverse() };
    for (const laid of layout.tables) {
      expect(pickTableAt(laid.center, reversed.tables)?.id).toBe(laid.id);
    }
  });

  it('prefers a direct hit on a drawn shape over a neighbour halo', () => {
    // A big table beside a tiny one whose expanded halo reaches into it.
    const big = t({ id: 'big', x: 0, y: 0, width: 400, height: 400 });
    const tiny = t({ id: 'tiny', x: 420, y: 180, width: 20, height: 20 });
    const l = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [big, tiny],
      viewport: TABLET,
      mode: 'staff',
    });
    const bigLaid = l.tables.find((x) => x.id === 'big')!;
    const insideBigEdge = {
      x: bigLaid.rect.x + bigLaid.rect.width - 2,
      y: bigLaid.center.y,
    };
    expect(pickTableAt(insideBigEdge, l.tables)?.id).toBe('big');
  });

  it('returns null when the tap misses everything', () => {
    expect(pickTableAt({ x: -500, y: -500 }, layout.tables)).toBeNull();
  });

  it('ignores unselectable tables unless asked to include them', () => {
    const dinerLayout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'busy', x: 100, y: 100, width: 200, height: 200, state: 'occupied' })],
      viewport: TABLET,
      mode: 'diner',
      partySize: 2,
    });
    const busy = dinerLayout.tables[0]!;
    expect(pickTableAt(busy.center, dinerLayout.tables)).toBeNull();
    expect(pickTableAt(busy.center, dinerLayout.tables, { includeUnselectable: true })?.id).toBe(
      'busy',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Label visibility
// ---------------------------------------------------------------------------
describe('label visibility', () => {
  it('hides the label when the drawn table cannot fit it at the minimum size', () => {
    const layout = computeFloorLayout({
      canvasWidth: 6000,
      canvasHeight: 6000,
      tables: [t({ id: 'tiny', label: '12', x: 3000, y: 3000, width: 60, height: 60 })],
      viewport: PHONE,
    });
    const laid = layout.tables[0]!;
    expect(laid.rect.width).toBeLessThan(estimateTextWidth('12', MIN_FONT_SIZE_PX));
    expect(laid.labelVisible).toBe(false);
  });

  it('shows the label when the table is comfortably large', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'roomy', label: '7', x: 100, y: 100, width: 200, height: 150 })],
      viewport: DESKTOP,
    });
    expect(layout.tables[0]!.labelVisible).toBe(true);
  });

  it('never drops the font below the minimum when a label is shown', () => {
    for (const viewport of [PHONE, TABLET, DESKTOP]) {
      const layout = computeFloorLayout({
        canvasWidth: cafeFloorPlan.canvasWidth,
        canvasHeight: cafeFloorPlan.canvasHeight,
        tables: cafeFloorPlan.tables,
        viewport,
      });
      for (const laid of layout.tables) {
        expect(laid.labelFontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
      }
    }
  });

  it('the same table gains its label as the viewport grows', () => {
    const table = t({ id: 'x', label: '11', x: 1000, y: 1000, width: 90, height: 90 });
    const args = { canvasWidth: 3000, canvasHeight: 3000, tables: [table] } as const;

    const onPhone = computeFloorLayout({ ...args, viewport: PHONE });
    const onDesktop = computeFloorLayout({ ...args, viewport: DESKTOP });

    expect(onPhone.tables[0]!.labelVisible).toBe(false);
    expect(onDesktop.tables[0]!.labelVisible).toBe(true);
  });

  it('a wider label is dropped sooner than a narrow one at the same size', () => {
    const narrow = t({ id: 'n', label: '1', x: 0, y: 0, width: 100, height: 100 });
    const wide = t({ id: 'w', label: '188', x: 200, y: 0, width: 100, height: 100 });
    // Sized so the drawn table (~21px) fits "1" at 11pt but not "188".
    const layout = computeFloorLayout({
      canvasWidth: 3600,
      canvasHeight: 3600,
      tables: [narrow, wide],
      viewport: TABLET,
    });
    const n = layout.tables.find((x) => x.id === 'n')!;
    const w = layout.tables.find((x) => x.id === 'w')!;
    expect(n.rect.width).toBeCloseTo(w.rect.width, 6);
    expect(n.labelVisible).toBe(true);
    expect(w.labelVisible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Rotation
// ---------------------------------------------------------------------------
describe('rotation', () => {
  it('rotates corners about the table centre', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'r', x: 100, y: 100, width: 200, height: 100, rotationDegrees: 90 })],
      viewport: DESKTOP,
      padding: 0,
    });
    const laid = layout.tables[0]!;

    // Every corner stays the same distance from the centre as before rotating.
    const halfDiagonal = Math.hypot(laid.rect.width / 2, laid.rect.height / 2);
    for (const corner of laid.corners) {
      expect(Math.hypot(corner.x - laid.center.x, corner.y - laid.center.y)).toBeCloseTo(
        halfDiagonal,
        6,
      );
    }

    // A 90-degree rotation swaps the footprint's width and height.
    const xs = laid.corners.map((c) => c.x);
    const ys = laid.corners.map((c) => c.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(laid.rect.height, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(laid.rect.width, 6);
  });

  it('leaves the centre where it was', () => {
    const base = { canvasWidth: 900, canvasHeight: 600, viewport: DESKTOP } as const;
    const plain = computeFloorLayout({
      ...base,
      tables: [t({ id: 'a', x: 100, y: 100, width: 200, height: 100 })],
    });
    const spun = computeFloorLayout({
      ...base,
      tables: [t({ id: 'a', x: 100, y: 100, width: 200, height: 100, rotationDegrees: 37 })],
    });
    expect(spun.tables[0]!.center.x).toBeCloseTo(plain.tables[0]!.center.x, 6);
    expect(spun.tables[0]!.center.y).toBeCloseTo(plain.tables[0]!.center.y, 6);
  });

  it('leaves the label unrotated — the layout exposes no label rotation at all', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'r', x: 100, y: 100, width: 200, height: 150, rotationDegrees: 45 })],
      viewport: DESKTOP,
    });
    const laid = layout.tables[0]!;
    // The label is positioned at the centre and carries no angle: the renderer
    // draws it outside the rotation group, so a 45-degree table stays readable.
    expect(laid).not.toHaveProperty('labelRotation');
    expect(laid.center).toEqual({
      x: laid.rect.x + laid.rect.width / 2,
      y: laid.rect.y + laid.rect.height / 2,
    });
  });

  it('expands the hit rect to the rotated footprint, not the unrotated rect', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables: [t({ id: 'r', x: 100, y: 100, width: 200, height: 60, rotationDegrees: 45 })],
      viewport: DESKTOP,
    });
    const laid = layout.tables[0]!;
    // A 45-degree long table is taller in screen space than its unrotated height.
    expect(laid.hitRect.height).toBeGreaterThan(laid.rect.height);
  });
});

// ---------------------------------------------------------------------------
// 7 & 8. Selectability per mode
// ---------------------------------------------------------------------------
describe('diner mode selectability', () => {
  const tables: FloorTable[] = [
    t({ id: 'free2', seats: 2, state: 'free' }),
    t({ id: 'free4', seats: 4, state: 'free' }),
    t({ id: 'free8', seats: 8, state: 'free' }),
    t({ id: 'soon4', seats: 4, state: 'reservedSoon' }),
    t({ id: 'held4', seats: 4, state: 'held' }),
    t({ id: 'busy4', seats: 4, state: 'occupied' }),
    t({ id: 'oos4', seats: 4, state: 'outOfService' }),
    t({ id: 'nobook4', seats: 4, state: 'free', isBookable: false }),
  ];

  const selectableFor = (partySize: number) =>
    tables
      .filter((x) => isTableSelectable(x, 'diner', partySize))
      .map((x) => x.id)
      .sort();

  it('party of 2 can pick any bookable free or reservedSoon table', () => {
    expect(selectableFor(2)).toEqual(['free2', 'free4', 'free8', 'soon4']);
  });

  it('party of 4 loses the two-seater', () => {
    expect(selectableFor(4)).toEqual(['free4', 'free8', 'soon4']);
  });

  it('party of 8 is left with only the eight-seater', () => {
    expect(selectableFor(8)).toEqual(['free8']);
  });

  it('never offers held, occupied, out-of-service or non-bookable tables', () => {
    for (const partySize of [1, 2, 4, 8]) {
      const ids = selectableFor(partySize);
      expect(ids).not.toContain('held4');
      expect(ids).not.toContain('busy4');
      expect(ids).not.toContain('oos4');
      expect(ids).not.toContain('nobook4');
    }
  });

  it('marks unselectable tables as dimmed in the layout', () => {
    const layout = computeFloorLayout({
      canvasWidth: 900,
      canvasHeight: 600,
      tables,
      viewport: TABLET,
      mode: 'diner',
      partySize: 4,
    });
    expect(layout.tables.find((x) => x.id === 'busy4')!.dimmed).toBe(true);
    expect(layout.tables.find((x) => x.id === 'free2')!.dimmed).toBe(true);
    expect(layout.tables.find((x) => x.id === 'free4')!.dimmed).toBe(false);
  });
});

describe('staff mode selectability', () => {
  it('marks every table tappable regardless of state, party size or bookability', () => {
    const layout = computeFloorLayout({
      canvasWidth: cafeFloorPlan.canvasWidth,
      canvasHeight: cafeFloorPlan.canvasHeight,
      tables: cafeFloorPlan.tables,
      viewport: TABLET,
      mode: 'staff',
      partySize: 8,
    });

    expect(layout.tables).toHaveLength(11);
    for (const laid of layout.tables) {
      expect(laid.selectable).toBe(true);
      expect(laid.dimmed).toBe(false);
    }
  });

  it('includes the out-of-service and non-bookable tables', () => {
    const oos = cafeFloorPlan.tables.find((x) => x.state === 'outOfService')!;
    expect(isTableSelectable(oos, 'staff', 8)).toBe(true);
    expect(oos.isBookable).toBe(false);
  });
});
