import { createMockGateway } from '@yalla/api';
import {
  AUTO_SCALE_CAP,
  computeFloorLayout,
  floorAreas,
  hasUsableAreas,
  MIN_TAP_TARGET_PX,
  scaleToClearHitRects,
  shouldUseAreaMode,
} from '@yalla/floorplan';
import type { FloorPlanData } from '@yalla/floorplan/types';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Does a real thirty-table branch survive a 380pt phone?
 *
 * It does not, and the whole point of this test is that the page and the
 * renderer agree about that by asking the *same function*. `shouldUseAreaMode`
 * was extracted out of `FloorPlan`'s own render for this task precisely so the
 * question has one answer: a second rule here — "more than twenty tables and a
 * narrow screen", say — would drift from the renderer within a release, and the
 * page would budget space for a switcher that never appeared, or not budget for
 * one that did.
 *
 * The condition itself is not a table count. It is whether two tappable hit
 * regions collide once the room is fitted, because that is what actually breaks
 * tapping: at 380pt a thirty-table room scales to roughly a quarter, thirty
 * 44pt targets overlap three deep, a tap resolves by nearest centre, and a
 * diner selects table 11 while pointing at table 12 — on the screen the whole
 * product hangs on.
 */

/**
 * A phone in portrait, and the plan's own box on it.
 *
 * `public.css` gives the plan `clamp(20rem, 62vh, 30rem)`; on a 380x820 handset
 * 62vh is 508px, clamped to the 480px ceiling. The switcher takes 44px off the
 * top when area mode engages, which is why the area layouts below are measured
 * against the smaller box — measuring them against the full one would flatter
 * the result by exactly the height of the control that caused it.
 */
const PHONE = { width: 380, height: 480 };
const PHONE_WITH_SWITCHER = { width: 380, height: 480 - 44 };

let room: FloorPlanData;

beforeAll(async () => {
  // The room a real branch has, read through the same gateway the page reads —
  // not a fixture assembled here, which could be tuned until it passed.
  const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
  const plan = await gateway.getFloorPlan('b-ararat-opera');
  if (!plan) throw new Error('The 30-table fixture branch is missing from the mock world.');
  room = plan;
});

describe('a thirty-table branch on a 380pt phone', () => {
  it('is genuinely a thirty-table room, in more than one area', () => {
    // Guards the premise. A fixture that quietly shrank to eight tables would
    // make every assertion below pass for the wrong reason.
    expect(room.tables).toHaveLength(30);
    expect(hasUsableAreas(room)).toBe(true);
  });

  it('falls back to one area at a time', () => {
    expect(
      shouldUseAreaMode({
        plan: room,
        viewport: PHONE,
        mode: 'diner',
        partySize: 2,
        canTranslate: true,
      }),
    ).toBe(true);
  });

  it('renders whole on a desktop, where the room fits', () => {
    expect(
      shouldUseAreaMode({
        plan: room,
        viewport: { width: 1100, height: 800 },
        mode: 'diner',
        partySize: 2,
        canTranslate: true,
      }),
    ).toBe(false);
  });

  it('will not engage without copy for the switcher', () => {
    // Area mode adds a control with words on it. Engaging it untranslated would
    // leave a diner reading raw key paths above their room.
    expect(
      shouldUseAreaMode({
        plan: room,
        viewport: PHONE,
        mode: 'diner',
        partySize: 2,
        canTranslate: false,
      }),
    ).toBe(false);
  });

  it('never engages when the caller pinned the whole room', () => {
    expect(
      shouldUseAreaMode({
        plan: room,
        viewport: PHONE,
        mode: 'diner',
        partySize: 2,
        areaMode: 'off',
        canTranslate: true,
      }),
    ).toBe(false);
  });
});

describe('a small room on the same phone', () => {
  it('keeps rendering whole', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    // Fourteen tables on a generous grid: cramped, but the targets do not
    // collide, and folding it would add a control that improves nothing.
    const plan = await gateway.getFloorPlan('b-lumen-saryan');
    expect(plan).not.toBeNull();

    expect(
      shouldUseAreaMode({
        plan: plan!,
        viewport: PHONE,
        mode: 'diner',
        partySize: 2,
        canTranslate: true,
      }),
    ).toBe(false);
  });
});

describe('what a diner can actually see and hit at 380pt', () => {
  /** Every table's smallest drawn side, in CSS pixels. */
  function narrowestTable(layout: ReturnType<typeof computeFloorLayout>): number {
    return Math.min(...layout.tables.map((table) => Math.min(table.rect.width, table.rect.height)));
  }

  function fit(areaFilter: string | null, viewport: { width: number; height: number }) {
    return computeFloorLayout({
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
      tables: room.tables,
      viewport,
      mode: 'diner',
      partySize: 2,
      areaFilter,
    });
  }

  it('is not readable whole: nine table numbers vanish and every target collides', () => {
    const whole = fit(null, PHONE);

    // Scale ~0.25. The smallest table is drawn 14px across against a 44px tap
    // floor, so the halos overlap three deep and a tap resolves by nearest
    // centre — a diner selects table 11 while pointing at table 12.
    expect(whole.hasOverlappingHitRects).toBe(true);
    expect(narrowestTable(whole)).toBeLessThan(MIN_TAP_TARGET_PX / 2);
    expect(whole.tables.filter((table) => table.labelVisible).length).toBeLessThan(
      whole.tables.length,
    );
  });

  it('is readable one area at a time: every table number is visible', () => {
    // The clearest single measure of the fallback working. Whole, nine of the
    // thirty numbers are too small to draw; per area, none are.
    for (const area of floorAreas(room)) {
      const laid = fit(area.name, PHONE_WITH_SWITCHER);
      expect(laid.tables.length, `${area.name ?? 'unassigned'} is empty`).toBeGreaterThan(0);
      expect(
        laid.tables.every((table) => table.labelVisible),
        `${area.name ?? 'unassigned'} hides a table number`,
      ).toBe(true);
    }
  });

  it('opens no area with colliding tap targets, except where the cap stops it', () => {
    /*
     * This assertion used to be `expect(colliding).toEqual(['Windows'])`.
     *
     * That is a defect written down as a specification. Ten two-tops at an
     * 88-unit pitch fitted to the 436px box put 41px between adjacent centres
     * against a 44px floor — 8% short — and the test recorded it, with a note
     * that pinch-zoom was the remedy. It is not a remedy: nobody pinches a
     * floor plan that looks fine, so the diner taps table 6, gets table 7, and
     * finds out at the door. Worse, the shape of the assertion meant *fixing*
     * Windows would fail here and read as a regression.
     *
     * What is asserted now is the property the component actually owes a
     * diner: whatever scale an area opens at, its tap targets are
     * distinguishable — unless clearing them would cost more than the cap, in
     * which case the cap is what stopped it and the plan says so by opening
     * there. No fixture is named, so an area added tomorrow is covered.
     */
    for (const area of floorAreas(room)) {
      const base = {
        canvasWidth: room.canvasWidth,
        canvasHeight: room.canvasHeight,
        tables: room.tables,
        viewport: PHONE_WITH_SWITCHER,
        mode: 'diner' as const,
        partySize: 2,
        areaFilter: area.name,
      };

      const opensAt = scaleToClearHitRects(base, { cap: AUTO_SCALE_CAP });
      const opened = computeFloorLayout({ ...base, zoom: opensAt });
      const where = area.name ?? 'unassigned';

      expect(opensAt, `${where} opens beyond the cap`).toBeLessThanOrEqual(AUTO_SCALE_CAP);
      if (opened.hasOverlappingHitRects) {
        expect(opensAt, `${where} opens broken without reaching the cap`).toBe(AUTO_SCALE_CAP);
      }
    }
  });

  it('opens the window wall above the fit, because that is what it needs', () => {
    // The specific area the old assertion pinned. It is still the one that
    // does not survive its own fit — the change is that the component now
    // computes the scale that clears it instead of leaving it to a gesture.
    const base = {
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
      tables: room.tables,
      viewport: PHONE_WITH_SWITCHER,
      mode: 'diner' as const,
      partySize: 2,
      areaFilter: 'Windows',
    };

    expect(computeFloorLayout(base).hasOverlappingHitRects).toBe(true);

    const opensAt = scaleToClearHitRects(base, { cap: AUTO_SCALE_CAP });
    expect(opensAt).toBeGreaterThan(1);
    expect(opensAt).toBeLessThan(AUTO_SCALE_CAP);
    expect(computeFloorLayout({ ...base, zoom: opensAt }).hasOverlappingHitRects).toBe(false);
  });
});
