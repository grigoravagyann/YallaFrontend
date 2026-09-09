import { describe, expect, it } from 'vitest';
import {
  AUTO_SCALE_CAP,
  computeFloorLayout,
  cutEdgesOf,
  DEFAULT_PADDING_PX,
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
 * A room drawn larger than its box has to say so.
 *
 * `scaleToClearHitRects` opens a view above the fit on purpose, and the
 * argument for it is sound: a silent mis-tap costs a diner their table at the
 * door, and pan reaches whatever is off screen. What it left out is that nobody
 * pans. The plan is cut hard against a border, tables end mid-shape at a
 * straight edge, and it reads as a rendering bug rather than as a window - so
 * the drag that would reveal the rest is never attempted. It is the same
 * failure the auto-scale itself was written against, one level up: nobody
 * pinches a floor plan that looks fine, and nobody pans one that looks broken.
 *
 * These assert the property rather than the shape of the defect, for the reason
 * `autoScale.test.ts` sets out at length: a set of "areas that open cut" is a
 * specification of today's fixtures, and the next fixture nobody has drawn yet
 * is the one it fails to cover.
 */

/** The public branch page's real box: one column at 1024px, less the padding. */
const PUBLIC_COLUMN = { width: 480, height: 516 };
const PHONE = { width: 380, height: 480 - 44 };
const TABLET = { width: 1024, height: 720 };

const FIXTURES: ReadonlyArray<readonly [string, FloorPlanData]> = [
  ['cafe', cafeFloorPlan],
  ['terrace', terraceFloorPlan],
  ['denseCluster', denseClusterFloorPlan],
  ['restaurant', restaurantFloorPlan],
  ['two', twoFloorPlan],
];

const VIEWPORTS: ReadonlyArray<readonly [string, { width: number; height: number }]> = [
  ['publicColumn', PUBLIC_COLUMN],
  ['phone', PHONE],
  ['tablet', TABLET],
];

function inputFor(plan: FloorPlanData, viewport: { width: number; height: number }) {
  return {
    canvasWidth: plan.canvasWidth,
    canvasHeight: plan.canvasHeight,
    tables: plan.tables,
    viewport,
    mode: 'diner',
    partySize: 2,
  } satisfies ComputeFloorLayoutInput;
}

/** Every case the component can actually open, at the scale it opens it. */
function* opened() {
  for (const [planName, plan] of FIXTURES) {
    for (const [viewportName, viewport] of VIEWPORTS) {
      const input = inputFor(plan, viewport);
      const zoom = scaleToClearHitRects(input, { cap: AUTO_SCALE_CAP });

      yield {
        name: `${planName} @ ${viewportName}`,
        viewport,
        zoom,
        layout: computeFloorLayout({ ...input, zoom }),
      };
    }
  }
}

describe('cutEdgesOf', () => {
  it('reports an edge cut exactly when the room is drawn past it', () => {
    for (const { name, viewport, layout } of opened()) {
      const edges = cutEdgesOf(layout, viewport);

      expect(edges.left, `${name} left`).toBe(layout.offsetX < -0.5);
      expect(edges.right, `${name} right`).toBe(
        layout.offsetX + layout.renderedWidth > viewport.width + 0.5,
      );
      expect(edges.top, `${name} top`).toBe(layout.offsetY < -0.5);
      expect(edges.bottom, `${name} bottom`).toBe(
        layout.offsetY + layout.renderedHeight > viewport.height + 0.5,
      );
    }
  });

  it('never reports a cut on a room that fits', () => {
    for (const [planName, plan] of FIXTURES) {
      for (const [viewportName, viewport] of VIEWPORTS) {
        const layout = computeFloorLayout({ ...inputFor(plan, viewport), zoom: MIN_ZOOM });
        const edges = cutEdgesOf(layout, viewport);

        // The fit letterboxes into the padding on both axes, so there is
        // nothing to fade and the fade must cost nothing.
        expect(
          [edges.left, edges.right, edges.top, edges.bottom],
          `${planName} @ ${viewportName} is fitted and must not be reported cut`,
        ).toEqual([false, false, false, false]);
        expect(layout.offsetX).toBeGreaterThanOrEqual(DEFAULT_PADDING_PX - 0.5);
        expect(layout.offsetY).toBeGreaterThanOrEqual(DEFAULT_PADDING_PX - 0.5);
      }
    }
  });

  it('reports nothing before the first layout pass', () => {
    // A 0x0 viewport is the first render, every time. Fading an unmeasured box
    // would put a gradient over an empty plan on the frame before it appears.
    const layout = computeFloorLayout(inputFor(cafeFloorPlan, { width: 0, height: 0 }));

    expect(layout.scale).toBe(0);
    expect(cutEdgesOf(layout, { width: 0, height: 0 })).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: false,
    });
  });

  /**
   * The guard that keeps the two tests above from passing vacuously.
   *
   * Both would hold if `cutEdgesOf` returned all-false forever and no fixture
   * in the matrix ever opened above the fit. This is the case the fade exists
   * for, so the matrix has to contain it.
   */
  it('the fixture matrix actually contains a room that opens cut', () => {
    const cut = [...opened()].filter(({ layout, viewport }) => {
      const edges = cutEdgesOf(layout, viewport);
      return edges.left || edges.right || edges.top || edges.bottom;
    });

    expect(
      cut.length,
      'no fixture opens above the fit far enough to be cut, so the fade is untested',
    ).toBeGreaterThan(0);

    // And every one of them opened there because the auto-scale put it there,
    // not because the geometry was already bigger than its box.
    for (const { name, zoom } of cut) {
      expect(zoom, `${name} is cut but was never scaled up`).toBeGreaterThan(MIN_ZOOM);
    }
  });
});
