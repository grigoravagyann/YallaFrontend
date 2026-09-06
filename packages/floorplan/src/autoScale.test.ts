import { describe, expect, it } from 'vitest';
import { floorAreas } from './areas';
import {
  AUTO_SCALE_CAP,
  computeFloorLayout,
  MIN_ZOOM,
  scaleToClearHitRects,
  type ComputeFloorLayoutInput,
} from './layout';
import {
  cafeFloorPlan,
  denseClusterFloorPlan,
  restaurantFloorPlan,
  terraceFloorPlan,
  twoFloorPlan,
} from './mocks';
import type { FloorPlanData } from './types';

/**
 * The invariant that replaced two pinned defects.
 *
 * Frontend 7 pinned eight bar stools opening 2px short of the 44px tap floor;
 * Frontend 11 pinned ten two-tops opening 8% short. Both tests asserted the
 * *specific set of areas that opened broken*, which is a specification of the
 * defect: a change that fixed either one would have failed its own test and
 * read as a regression.
 *
 * So the assertion here is not a set. It is that **no area opens with
 * overlapping hit rects unless clearing it would cost more than the cap** —
 * which is a property of the component, holds for fixtures nobody has drawn
 * yet, and cannot be satisfied by writing down whatever the code currently
 * does.
 */

const PHONE = { width: 380, height: 600 };
/** The plan's real box on a 380x820 handset, less the area switcher. */
const PHONE_WITH_SWITCHER = { width: 380, height: 480 - 44 };

const FIXTURES: ReadonlyArray<readonly [string, FloorPlanData]> = [
  ['cafe', cafeFloorPlan],
  ['terrace', terraceFloorPlan],
  ['dense cluster', denseClusterFloorPlan],
  ['restaurant', restaurantFloorPlan],
  ['two floors', twoFloorPlan],
];

function input(
  plan: FloorPlanData,
  viewport: { width: number; height: number },
  extra: Partial<ComputeFloorLayoutInput> = {},
): ComputeFloorLayoutInput {
  return {
    canvasWidth: plan.canvasWidth,
    canvasHeight: plan.canvasHeight,
    tables: plan.tables,
    viewport,
    mode: 'diner',
    partySize: 2,
    ...extra,
  };
}

/** Every view the component can open: each area alone, and the whole room. */
function viewsOf(plan: FloorPlanData): readonly (string | null)[] {
  return [...floorAreas(plan).map((area) => area.name), null];
}

describe('an area never opens with colliding tap targets below the cap', () => {
  for (const [name, plan] of FIXTURES) {
    it(`holds for every view of the ${name} fixture`, () => {
      // Both party sizes, because party size decides which tables are
      // selectable and therefore which pairs can collide at all. The eight bar
      // stools of Frontend 7 seat one: at a party of two they are dimmed and
      // the area looks clean, which is precisely how that defect survived.
      for (const partySize of [1, 2]) {
        for (const areaFilter of viewsOf(plan)) {
          const base = input(plan, PHONE_WITH_SWITCHER, { areaFilter, partySize });
          const opensAt = scaleToClearHitRects(base, { cap: AUTO_SCALE_CAP });
          const opened = computeFloorLayout({ ...base, zoom: opensAt });
          const where = `${name} / ${areaFilter ?? 'whole room'} / party ${partySize}`;

          expect(opensAt, `${where} opens beyond the cap`).toBeLessThanOrEqual(AUTO_SCALE_CAP);
          expect(opensAt, `${where} opens below the fit`).toBeGreaterThanOrEqual(MIN_ZOOM);

          // The invariant. An area is allowed to open colliding *only* when the
          // cap is what stopped it — never because nobody computed the scale.
          if (opened.hasOverlappingHitRects) {
            expect(opensAt, `${where} opens broken without reaching the cap`).toBe(AUTO_SCALE_CAP);
          }
        }
      }
    });
  }
});

describe('the two areas that were pinned broken', () => {
  it("opens the restaurant's bar above the fit, and clear", () => {
    // Frontend 7's eight stools: 42px between centres against a 44px floor.
    // A party of one, because that is who can sit at them — at a party of two
    // they are dimmed, uncollidable, and the defect is invisible.
    const base = input(restaurantFloorPlan, PHONE, { areaFilter: 'Bar', partySize: 1 });
    expect(computeFloorLayout(base).hasOverlappingHitRects).toBe(true);

    const opensAt = scaleToClearHitRects(base);
    expect(opensAt).toBeGreaterThan(MIN_ZOOM);
    expect(opensAt).toBeLessThanOrEqual(AUTO_SCALE_CAP);
    expect(computeFloorLayout({ ...base, zoom: opensAt }).hasOverlappingHitRects).toBe(false);
  });

  it("opens the restaurant's window wall above the fit, and clear", () => {
    // Frontend 11's ten two-tops: 41px against 44, in the box the page gives.
    const base = input(restaurantFloorPlan, PHONE_WITH_SWITCHER, { areaFilter: 'Windows' });
    expect(computeFloorLayout(base).hasOverlappingHitRects).toBe(true);

    const opensAt = scaleToClearHitRects(base);
    expect(opensAt).toBeGreaterThan(MIN_ZOOM);
    expect(computeFloorLayout({ ...base, zoom: opensAt }).hasOverlappingHitRects).toBe(false);
  });
});

describe('the cap', () => {
  /**
   * A room drawn closer together than a fingertip at any scale we are willing
   * to open at. Twenty two-tops at a 20-unit pitch down one wall: clearing this
   * needs about 2.8x, and at 2.8x a diner sees a third of the row.
   */
  const impossible: FloorPlanData = {
    branchId: 'b-impossible',
    branchName: 'Tighter than a fingertip',
    canvasWidth: 1200,
    canvasHeight: 800,
    timeZoneId: 'Asia/Yerevan',
    tables: Array.from({ length: 20 }, (_, i) => ({
      id: `t-${i}`,
      label: String(i + 1),
      seats: 2,
      x: 40 + i * 20,
      y: 400,
      width: 16,
      height: 16,
      rotationDegrees: 0,
      shape: 'round' as const,
      floorAreaName: 'Row',
      isBookable: true,
      state: 'free' as const,
      nextReservationStartUtc: null,
    })),
  };

  it('opens at the cap rather than throwing or running away', () => {
    const base = input(impossible, PHONE, { areaFilter: 'Row' });
    expect(computeFloorLayout(base).hasOverlappingHitRects).toBe(true);

    const opensAt = scaleToClearHitRects(base);
    expect(opensAt).toBe(AUTO_SCALE_CAP);

    // Still colliding at the cap — and that is the honest outcome, not a bug.
    // What must not happen is a throw, a NaN, or an unbounded scale.
    const opened = computeFloorLayout({ ...base, zoom: opensAt });
    expect(opened.hasOverlappingHitRects).toBe(true);
    expect(Number.isFinite(opened.scale)).toBe(true);
    expect(opened.tables).toHaveLength(20);
  });

  it('is honoured when the caller lowers it', () => {
    const base = input(restaurantFloorPlan, PHONE, { areaFilter: 'Bar', partySize: 1 });
    expect(scaleToClearHitRects(base, { cap: 1.05 })).toBe(1.05);
  });
});

describe('staff mode', () => {
  it('is left at fit-to-viewport, cap or no cap', () => {
    /*
     * Not an oversight. A waiter needs the whole room in one glance and taps it
     * with context a stranger has none of — they know which table they just
     * seated. Opening their screen zoomed in to satisfy a tap-target rule would
     * trade the thing that screen is for against a problem it does not have.
     *
     * The component enforces this; here we show that the staff floor *would*
     * otherwise be a candidate, so the exemption is doing real work.
     */
    const base = input(restaurantFloorPlan, PHONE, { mode: 'staff', areaFilter: 'Bar' });
    expect(computeFloorLayout(base).hasOverlappingHitRects).toBe(true);
    expect(scaleToClearHitRects(base)).toBeGreaterThan(MIN_ZOOM);
  });
});

describe('rooms that already fit', () => {
  it('costs nothing and returns the fit unchanged', () => {
    for (const [name, plan] of FIXTURES) {
      const base = input(plan, { width: 1400, height: 1000 }, {});
      expect(computeFloorLayout(base).hasOverlappingHitRects, name).toBe(false);
      expect(scaleToClearHitRects(base), name).toBe(MIN_ZOOM);
    }
  });

  it('yields the fit for an empty area rather than searching to the cap', () => {
    const base = input(restaurantFloorPlan, PHONE, { areaFilter: 'Roof garden' });
    expect(scaleToClearHitRects(base)).toBe(MIN_ZOOM);
  });
});
