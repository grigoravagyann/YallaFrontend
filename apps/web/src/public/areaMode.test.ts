import { createMockGateway } from '@yalla/api';
import {
  computeFloorLayout,
  floorAreas,
  hasUsableAreas,
  MIN_TAP_TARGET_PX,
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

  it('clears the tap-target collision in every area but the dense column', () => {
    /*
     * An honest test rather than a flattering one.
     *
     * Two of the three areas come out clean. **"Windows" does not**: ten
     * two-tops at an 88-unit pitch down a wall is a tall, narrow strip, it
     * fits the 436px-high box at scale 0.43, and that puts 41px between
     * adjacent centres against a 44px floor — about 8% short. The remedy that
     * already exists is the pinch-zoom the plan ships with, and the remedy that
     * does not is a second fallback inside `@yalla/floorplan` for an area that
     * still does not fit alone.
     *
     * Asserted as the exact set rather than "at least one is fine", so that a
     * change which fixes Windows fails here and gets this comment deleted, and
     * a change which breaks Bar or Terrace fails here too.
     */
    const colliding = floorAreas(room)
      .filter((area) => fit(area.name, PHONE_WITH_SWITCHER).hasOverlappingHitRects)
      .map((area) => area.name);

    expect(colliding).toEqual(['Windows']);
  });

  it('leaves that column one pinch away rather than unusable', () => {
    // 520px of plan height clears it at the fitted zoom, which is more than a
    // phone can give the room without pushing the free-table count off screen.
    // Within the box the page does give it, the same column clears at 1.2x —
    // well inside the component's own 4x ceiling.
    expect(fit('Windows', { width: 380, height: 520 }).hasOverlappingHitRects).toBe(false);

    const zoomed = computeFloorLayout({
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
      tables: room.tables,
      viewport: PHONE_WITH_SWITCHER,
      mode: 'diner',
      partySize: 2,
      areaFilter: 'Windows',
      zoom: 1.2,
    });
    expect(zoomed.hasOverlappingHitRects).toBe(false);
  });
});
