import { describe, expect, it } from 'vitest';
import { floorAreas, hasUsableAreas } from './areas';
import {
  computeFloorLayout,
  MAX_ZOOM,
  MIN_FONT_SIZE_PX,
  MIN_ZOOM,
  type LaidOutTable,
} from './layout';
import { cafeFloorPlan, denseClusterFloorPlan, restaurantFloorPlan, twoFloorPlan } from './mocks';

/**
 * The rules that make a real restaurant usable on a phone.
 *
 * Every one of these is a claim the eleven-table cafe fixture could not have
 * falsified: it fits, so nothing overlapped and nothing needed zoom. The
 * 30-table fixture is the one that breaks, which is why it exists.
 */

const PHONE = { width: 380, height: 600 };
const TABLET = { width: 1024, height: 768 };

function layout(
  plan: typeof restaurantFloorPlan,
  viewport: { width: number; height: number },
  extra: Partial<Parameters<typeof computeFloorLayout>[0]> = {},
) {
  return computeFloorLayout({
    canvasWidth: plan.canvasWidth,
    canvasHeight: plan.canvasHeight,
    tables: plan.tables,
    viewport,
    ...extra,
  });
}

function overlaps(a: LaidOutTable, b: LaidOutTable): boolean {
  return (
    a.hitRect.x < b.hitRect.x + b.hitRect.width &&
    b.hitRect.x < a.hitRect.x + a.hitRect.width &&
    a.hitRect.y < b.hitRect.y + b.hitRect.height &&
    b.hitRect.y < a.hitRect.y + a.hitRect.height
  );
}

function countOverlappingPairs(tables: readonly LaidOutTable[]): number {
  const tappable = tables.filter((t) => t.selectable);
  let pairs = 0;
  for (let i = 0; i < tappable.length; i += 1) {
    for (let j = i + 1; j < tappable.length; j += 1) {
      const a = tappable[i];
      const b = tappable[j];
      if (a && b && overlaps(a, b)) pairs += 1;
    }
  }
  return pairs;
}

describe('a real restaurant does not survive a phone', () => {
  it('reports overlapping hit rects at 380pt and none at 1024pt', () => {
    expect(restaurantFloorPlan.tables).toHaveLength(30);
    expect(layout(restaurantFloorPlan, PHONE).hasOverlappingHitRects).toBe(true);
    expect(layout(restaurantFloorPlan, TABLET).hasOverlappingHitRects).toBe(false);
  });

  it('leaves the eleven-table cafe alone on the same phone', () => {
    // The whole mechanism has to stay invisible for a room that fits, or it
    // adds a control that does nothing to most venues.
    expect(layout(cafeFloorPlan, PHONE).hasOverlappingHitRects).toBe(false);
  });

  it('does not fire on a single-area room, which area mode cannot help', () => {
    expect(layout(denseClusterFloorPlan, PHONE).hasOverlappingHitRects).toBe(true);
    // ...but there is nothing to divide it by, so the component must not offer
    // area mode. Zoom is the remedy there.
    expect(hasUsableAreas(denseClusterFloorPlan)).toBe(false);
    expect(hasUsableAreas(restaurantFloorPlan)).toBe(true);
  });
});

describe('areaFilter', () => {
  it('returns only that area, fitted to its own bounds', () => {
    const windows = layout(restaurantFloorPlan, PHONE, { areaFilter: 'Windows' });

    expect(windows.tables).toHaveLength(10);
    expect(windows.tables.every((t) => t.table.floorAreaName === 'Windows')).toBe(true);
    expect(windows.areaFilter).toBe('Windows');

    // Fitting ten tables to their own bounds rather than to the whole 1400x1000
    // room is the entire point: they get drawn far larger.
    const whole = layout(restaurantFloorPlan, PHONE);
    const wholeWindow = whole.tables.find((t) => t.id === 'rw1');
    const areaWindow = windows.tables.find((t) => t.id === 'rw1');
    expect(areaWindow!.rect.width).toBeGreaterThan(wholeWindow!.rect.width * 1.5);
  });

  it('letterboxes the area rather than stretching it', () => {
    // Windows is a tall narrow strip; in a 380x600 box it must keep its aspect
    // ratio and leave margin on the wide axis.
    const windows = layout(restaurantFloorPlan, PHONE, { areaFilter: 'Windows' });
    expect(windows.renderedHeight).toBeGreaterThan(windows.renderedWidth);
    expect(windows.renderedWidth).toBeLessThanOrEqual(PHONE.width);
    expect(windows.renderedHeight).toBeLessThanOrEqual(PHONE.height);
    expect(windows.offsetX).toBeGreaterThan(0);
  });

  it('fixes the overlap it exists to fix, where geometry allows', () => {
    expect(layout(restaurantFloorPlan, PHONE).hasOverlappingHitRects).toBe(true);

    // Ten window tables and twelve terrace tables each clear completely once
    // they stop sharing the room with thirty.
    for (const area of ['Windows', 'Terrace']) {
      expect(layout(restaurantFloorPlan, PHONE, { areaFilter: area }).hasOverlappingHitRects).toBe(
        false,
      );
    }

    /*
     * The bar does not clear on the fit alone: eight stools at a 96-unit pitch
     * across a 380pt phone draw 42px apart against a 44px floor. That used to
     * be asserted here as `true` with a note that pinch-zoom was the remedy,
     * which pinned the defect as the specification — a diner does not pinch a
     * plan that looks fine, so in practice they mis-tapped.
     *
     * What is asserted now is that *area mode alone is not the whole answer for
     * this room* — the fact the component needs — and, below, that the
     * component therefore does not open it at the fit.
     */
    expect(layout(restaurantFloorPlan, PHONE, { areaFilter: 'Bar' }).hasOverlappingHitRects).toBe(
      true,
    );
  });

  it('yields an empty layout for an area with no tables, not a divide-by-zero', () => {
    const none = layout(restaurantFloorPlan, PHONE, { areaFilter: 'Roof garden' });
    expect(none.tables).toEqual([]);
    expect(none.scale).toBe(0);
    expect(Number.isNaN(none.offsetX)).toBe(false);
  });

  it('handles a venue whose areas are far apart in space', () => {
    // Two floors with a 700-unit stairwell between them. Together each floor
    // gets under half the viewport; alone, each fills it.
    const whole = layout(twoFloorPlan, PHONE);
    const ground = layout(twoFloorPlan, PHONE, { areaFilter: 'Ground floor' });

    const wholeFirst = whole.tables.find((t) => t.id === 'gf1');
    const areaFirst = ground.tables.find((t) => t.id === 'gf1');
    // 1.4x here rather than the 2.2x the Windows strip gains: the ground floor
    // is a wide short block, so fitting it alone is bounded by width, and the
    // empty stairwell it sheds was vertical. A real improvement, not the whole
    // gap closed.
    expect(areaFirst!.rect.width / wholeFirst!.rect.width).toBeGreaterThan(1.35);
    expect(ground.tables).toHaveLength(7);
  });
});

describe('floor area summaries', () => {
  it("counts free tables per area, in the venue's own order", () => {
    const areas = floorAreas(restaurantFloorPlan);
    expect(areas.map((a) => a.name)).toEqual(['Windows', 'Bar', 'Terrace']);

    const windows = areas[0]!;
    expect(windows.tableCount).toBe(10);
    // One occupied, one reservedSoon: eight free.
    expect(windows.freeCount).toBe(8);

    const total = areas.reduce((n, a) => n + a.tableCount, 0);
    expect(total).toBe(restaurantFloorPlan.tables.length);
  });
});

describe('zoom', () => {
  it('scales geometry and text together', () => {
    const one = layout(restaurantFloorPlan, PHONE, { areaFilter: 'Terrace' });
    const two = layout(restaurantFloorPlan, PHONE, { areaFilter: 'Terrace', zoom: 2 });

    const a = one.tables.find((t) => t.id === 'rt1')!;
    const b = two.tables.find((t) => t.id === 'rt1')!;

    expect(two.scale).toBeCloseTo(one.scale * 2, 5);
    expect(b.rect.width).toBeCloseTo(a.rect.width * 2, 5);
    // Text grows with the room. It is floored, not fixed — that was the bug:
    // magnifying rectangles around permanently 11px labels.
    expect(b.labelFontSize).toBeGreaterThan(a.labelFontSize);
  });

  it('never lets text fall below the floor, however small the room draws', () => {
    const tiny = layout(restaurantFloorPlan, { width: 200, height: 200 });
    for (const table of tiny.tables) {
      expect(table.labelFontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
    }
  });

  it('clamps at both ends', () => {
    expect(layout(restaurantFloorPlan, PHONE, { zoom: 0.2 }).zoom).toBe(MIN_ZOOM);
    expect(layout(restaurantFloorPlan, PHONE, { zoom: 99 }).zoom).toBe(MAX_ZOOM);
    expect(layout(restaurantFloorPlan, PHONE, { zoom: 2.5 }).zoom).toBe(2.5);
  });

  it('reveals a label the fitted layout had to drop', () => {
    // A bar stool at 380pt draws well under the size its label needs.
    const stool = (zoom: number) =>
      layout(restaurantFloorPlan, PHONE, { zoom }).tables.find((t) => t.id === 'rb1')!;

    expect(stool(1).labelVisible).toBe(false);

    // Somewhere between the fit and 4x the drawn size clears the minimum, and
    // once it does the label must appear rather than stay hidden.
    const revealed = [1.5, 2, 2.5, 3, 3.5, 4].find((z) => stool(z).labelVisible);
    expect(revealed).toBeDefined();

    const at = stool(revealed!);
    expect(at.rect.width).toBeGreaterThanOrEqual(at.table.label.length * MIN_FONT_SIZE_PX * 0.62);
  });

  it('un-overlaps the dense cluster by zooming in', () => {
    const dense = (zoom: number) =>
      computeFloorLayout({
        canvasWidth: denseClusterFloorPlan.canvasWidth,
        canvasHeight: denseClusterFloorPlan.canvasHeight,
        tables: denseClusterFloorPlan.tables,
        viewport: PHONE,
        zoom,
      });

    expect(countOverlappingPairs(dense(1).tables)).toBeGreaterThan(0);
    // At 2x the drawn tables clear the tap floor on their own, so the expansion
    // that caused the collisions stops happening.
    expect(countOverlappingPairs(dense(2).tables)).toBe(0);
    expect(dense(2).hasOverlappingHitRects).toBe(false);
  });
});

describe('pan', () => {
  it('cannot move the room out of the viewport', () => {
    const far = layout(restaurantFloorPlan, PHONE, { zoom: 3, panX: 99_999, panY: -99_999 });

    // The room still covers the padded viewport on both axes, however hard it
    // is shoved. There is never dead space at an edge, which is the state that
    // reads as "the plan broke".
    const padding = 12;
    expect(far.offsetX).toBeLessThanOrEqual(padding + 0.001);
    expect(far.offsetX + far.renderedWidth).toBeGreaterThanOrEqual(PHONE.width - padding - 0.001);
    expect(far.offsetY).toBeLessThanOrEqual(padding + 0.001);
    expect(far.offsetY + far.renderedHeight).toBeGreaterThanOrEqual(PHONE.height - padding - 0.001);
  });

  it('is locked at the fit, where there is nowhere to go', () => {
    const fitted = layout(restaurantFloorPlan, PHONE, { panX: 500, panY: 500 });
    expect(fitted.panX).toBe(0);
    expect(fitted.panY).toBe(0);
  });

  it('moves the room by exactly the pan it was given, within bounds', () => {
    const still = layout(restaurantFloorPlan, PHONE, { zoom: 2 });
    const moved = layout(restaurantFloorPlan, PHONE, { zoom: 2, panX: 20 });
    expect(moved.offsetX - still.offsetX).toBeCloseTo(20, 5);
  });

  it('locks the letterboxed axis and frees the overflowing one', () => {
    // Windows fitted alone is taller than wide: at 1x neither axis overflows,
    // and at 2x the tall axis gains room to move while the short one gains
    // less. Both stay clamped to their own overflow.
    const zoomed = layout(restaurantFloorPlan, PHONE, {
      areaFilter: 'Windows',
      zoom: 2,
      panY: 99_999,
    });
    const overflowY = Math.max(0, zoomed.renderedHeight - (PHONE.height - 24)) / 2;
    expect(zoomed.panY).toBeCloseTo(overflowY, 5);
  });
});
