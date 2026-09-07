import { describe, expect, it } from 'vitest';
import { color, subtleTextBackgrounds, textBackgrounds, tintedFills } from './color';
import { AA_BODY, AA_LARGE, contrastRatio } from './contrast';
import { elevation } from './elevation';
import { duration, reducedDuration } from './motion';
import { radius } from './space';
import { displaySteps, typeScale } from './typography';
import { compositedFill, tableStatusLegendOrder, tableStatusStyle } from './tableState';

/**
 * The palette asserting things about itself.
 *
 * A contrast ratio checked once in a design review is a ratio that breaks
 * silently the first time someone nudges a hex value. These tests are the
 * reason the brief's `subtleForeground` and `mutedForeground` were darkened
 * rather than shipped under AA — and the reason nobody can quietly put them
 * back.
 */

const round = (n: number) => Math.round(n * 100) / 100;
const passesBody = (fg: string, bg: string) =>
  expect(round(contrastRatio(fg, bg))).toBeGreaterThanOrEqual(AA_BODY);

describe('text contrast', () => {
  const backgrounds = [
    ['surface', color.surface],
    ['paper', color.paper],
    ['greenTint', color.greenTint],
    ['accentTint', color.accentTint],
  ] as const;

  const foregrounds = [
    ['foreground', color.foreground],
    ['mutedForeground', color.mutedForeground],
    ['primary', color.primary],
  ] as const;

  for (const [bgName, bg] of backgrounds) {
    for (const [fgName, fg] of foregrounds) {
      it(`${fgName} on ${bgName} clears AA for body text`, () => passesBody(fg, bg));
    }
  }

  it('subtleForeground clears AA on the grounds tertiary text is allowed on', () => {
    for (const bg of subtleTextBackgrounds) passesBody(color.subtleForeground, bg);
  });

  it('subtleForeground is banned from both tinted fills, and the token set says so', () => {
    // Documented rule, not an accident: if this ever passes, the darkening that
    // made it pass has compressed muted and subtle into one weight, and the
    // rule can be dropped along with this test. The accent tint is held to the
    // same standard as the neutral one — a violet ground does not buy an
    // exception.
    for (const tint of tintedFills) {
      expect(subtleTextBackgrounds).not.toContain(tint);
      expect(round(contrastRatio(color.subtleForeground, tint))).toBeLessThan(AA_BODY);
    }
  });

  it('keeps the three text weights in order, lightest last', () => {
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.foreground)).toBeGreaterThan(onSurface(color.mutedForeground));
    expect(onSurface(color.mutedForeground)).toBeGreaterThan(onSurface(color.subtleForeground));
  });

  it('every ground body text is set on is covered above', () => {
    expect(textBackgrounds).toEqual([
      color.surface,
      color.paper,
      color.greenTint,
      color.accentTint,
    ]);
  });
});

describe('brand and feedback fills', () => {
  it('white on primary and on primaryPressed clears AA', () => {
    passesBody(color.primaryForeground, color.primary);
    passesBody(color.primaryForeground, color.primaryPressed);
  });

  it('white on danger and dangerPressed clears AA — a destructive button stays readable under a finger', () => {
    passesBody(color.dangerForeground, color.danger);
    passesBody(color.dangerForeground, color.dangerPressed);
  });

  it('a pressed ghost button keeps its label legible on either tint', () => {
    for (const tint of tintedFills) {
      passesBody(color.primary, tint);
      passesBody(color.danger, tint);
    }
  });

  it('the accent used beside a floor plan is legible with white on it', () => {
    passesBody(color.primaryForeground, color.primaryOnFloorPlan);
    passesBody(color.primaryForeground, color.primaryOnFloorPlanPressed);
  });

  it('control outlines clear the 3:1 owed by a control boundary', () => {
    expect(round(contrastRatio(color.borderInteractive, color.surface))).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
    expect(round(contrastRatio(color.borderInteractive, color.paper))).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
  });

  it('the card edge is softer than the divider hairline', () => {
    expect(contrastRatio(color.borderSoft, color.surface)).toBeLessThan(
      contrastRatio(color.border, color.surface),
    );
  });
});

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** Chroma as max-min over 255: 0 is a perfect grey, 1 is a pure hue. */
const chroma = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return round((Math.max(r, g, b) - Math.min(r, g, b)) / 255);
};

/** Hue in degrees. Meaningless below roughly 0.15 chroma — see `NEUTRAL_CHROMA`. */
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return Math.round((sector * 60 + 360) % 360);
};

/** Shortest way round the wheel, so 350 and 10 are 20 apart, not 340. */
const hueDistance = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

/** Above this a colour has a hue worth comparing; below it, it is a grey. */
const NEUTRAL_CHROMA = 0.15;
/** Degrees of separation the accent owes the nearest state hue. */
const MIN_HUE_SEPARATION = 40;

describe('the rule that keeps colour meaning one thing', () => {
  /*
   * The rule this palette exists to enforce: chroma means a table's state or
   * the one element you are meant to act on, and nothing else is coloured.
   *
   * The previous version of this block asserted the accent was *achromatic* —
   * ink was the accent, so separation from the six states was free. Moving to
   * violet gives that guarantee back its teeth: it now has to be measured, not
   * assumed, and it is measured against every one of the six states rather
   * than the four that happen to carry a hue.
   */
  const chromaticStates = ['free', 'reservedSoon', 'held', 'occupied'] as const;
  const neutralStates = ['outOfService', 'yourPick'] as const;

  it('the two lists below cover all six states — nothing is quietly skipped', () => {
    expect([...chromaticStates, ...neutralStates].sort()).toEqual(
      [...tableStatusLegendOrder].sort(),
    );
  });

  it('every state that carries a hue actually carries one', () => {
    for (const state of chromaticStates) {
      expect(chroma(tableStatusStyle[state].fill)).toBeGreaterThan(0.4);
    }
  });

  it('the accent carries a hue of its own, and it is not the loud one', () => {
    /*
     * A ceiling, not a floor. `#7C3AED` — the violet every tool reaches for
     * first — measures 0.70 chroma and 5.70:1 with white on it. This one is
     * 0.56 and 6.99:1. The ceiling is what stops the accent being nudged back
     * toward the default: past it the button starts shouting over the room it
     * sits beside, and white stops clearing AA on it comfortably.
     */
    expect(chroma(color.primary)).toBeGreaterThan(0.4);
    expect(chroma(color.primary)).toBeLessThan(0.6);
    expect(round(contrastRatio(color.primaryForeground, color.primary))).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it('the accent is 40+ degrees from every state that carries a hue', () => {
    /*
     * The guarantee that lets the primary button sit on a floor screen without
     * an exception. `held` blue at hue 220 is the near miss: the accent is at
     * 261, which is 41 degrees away. That single degree of headroom is not
     * slack, it is the constraint — the blue is the reason this violet is not
     * bluer.
     */
    for (const state of chromaticStates) {
      expect(hueDistance(color.primary, tableStatusStyle[state].fill)).toBeGreaterThanOrEqual(
        MIN_HUE_SEPARATION,
      );
    }
  });

  it('the accent is separated from the two hueless states by chroma, not by angle', () => {
    /*
     * `outOfService` and `yourPick` both sit near hue 213 on paper, which is 48
     * degrees from the accent — but their chroma is 0.09 and 0.06, so that
     * angle describes nothing a person can see. Chroma is the real separation
     * and it is enormous: a saturated violet against a dead grey and a
     * near-black.
     */
    for (const state of neutralStates) {
      expect(chroma(tableStatusStyle[state].fill)).toBeLessThan(NEUTRAL_CHROMA);
    }
    expect(chroma(color.primary)).toBeGreaterThan(NEUTRAL_CHROMA * 2);
  });

  it('the accent is not any state fill or stroke, on any surface', () => {
    for (const status of tableStatusLegendOrder) {
      expect(tableStatusStyle[status].fill).not.toBe(color.primary);
      expect(tableStatusStyle[status].fill).not.toBe(color.primaryPressed);
      expect(tableStatusStyle[status].stroke).not.toBe(color.primary);
    }
  });

  it('outOfService recedes from the accent at the opacity it is actually drawn at', () => {
    /*
     * Against the composited fill, not the raw hex — a dead table is never
     * painted at full strength. `#8B95A1` at 0.7 over the canvas resolves to
     * `#AEB5BD`, which is 3.38:1 from the accent. The raw grey is 2.30:1 and
     * comparing against it would be measuring a colour nobody ever sees.
     */
    expect(
      round(contrastRatio(compositedFill('outOfService'), color.primary)),
    ).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the accent trades value separation for hue separation, and the trade is deliberate', () => {
    /*
     * The guarantee that did NOT survive the move off ink, pinned here so
     * nobody re-derives it later.
     *
     * Ink was 17.52:1 on white, so every state fill was separated from the
     * accent by lightness alone and the palette got that for free. Violet is
     * not: `occupied` red is 1.25:1 from it, the same value in greyscale, and
     * `held` blue is 1.47:1. What replaces lightness is 40+ degrees of hue —
     * asserted above — plus a shape rule the floor plan already enforces: a
     * button is a pill, a table is rectilinear, and no amount of colour
     * confusion turns one into the other.
     */
    const values = chromaticStates.map((s) =>
      contrastRatio(color.primary, tableStatusStyle[s].fill),
    );
    expect(round(Math.min(...values))).toBeLessThan(AA_LARGE);

    const angles = chromaticStates.map((s) => hueDistance(color.primary, tableStatusStyle[s].fill));
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);

    expect(radius.table).toBeLessThanOrEqual(2);
    expect(radius.pill).toBeGreaterThan(100);
  });
});

describe('the accent has exactly one job', () => {
  it('yourPick is ink, deliberately not the accent', () => {
    /*
     * The one state that used to *be* the accent, back when the accent was ink.
     * It stays ink, and that is the version with the strongest separation
     * available: the table a diner has chosen and the button that confirms the
     * choice now differ in hue rather than in shape and position alone, so the
     * two can sit on the same sheet without either explaining itself.
     */
    expect(tableStatusStyle.yourPick.fill).toBe(color.foreground);
    expect(tableStatusStyle.yourPick.fill).not.toBe(color.primary);
    expect(tableStatusStyle.yourPick.ring).not.toBeNull();
    expect(round(contrastRatio(tableStatusStyle.yourPick.fill, color.primary))).toBeGreaterThan(
      1.5,
    );
  });

  it('the floor-plan swap is gone — the accent needs no exception', () => {
    expect(color.primaryOnFloorPlan).toBe(color.primary);
    expect(color.primaryOnFloorPlanPressed).toBe(color.primaryPressed);
  });

  it('feedback colours are the state hues — one green, one amber, one red, one blue', () => {
    expect(color.success).toBe(tableStatusStyle.free.fill);
    expect(color.warning).toBe(tableStatusStyle.reservedSoon.fill);
    expect(color.danger).toBe(tableStatusStyle.occupied.fill);
    expect(color.info).toBe(tableStatusStyle.held.fill);
  });

  it('no feedback colour is the accent — a toast reports, it is not a button', () => {
    for (const feedback of [color.success, color.warning, color.danger, color.info]) {
      expect(feedback).not.toBe(color.primary);
    }
  });

  it('shadows are ink-tinted and light — a card is separated by elevation, not a line', () => {
    for (const shadow of Object.values(elevation)) {
      expect(shadow.web).toContain('rgba(19, 26, 34');
      // Ink, not the accent. A violet shadow under a white card is a glow.
      expect(shadow.native.shadowColor).toBe(color.foreground);
      expect(shadow.native.shadowColor).not.toBe(color.primary);
      // Low alpha on a near-white ground. A heavier shadow turns a grid of
      // cards into a grid of buttons.
      expect(shadow.native.shadowOpacity).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('charts are neutral, and the accent marks what is current', () => {
  /*
   * The fix for the one thing the all-ink accent got wrong. Filling a progress
   * bar or a sparkline with `#131A22` produces a black block that reads as a
   * redaction rather than a measure, and it spends the strongest value in the
   * system on data nobody is being asked to act on.
   */
  it('the default chart fill is neutral — not a state, not the accent', () => {
    expect(chroma(color.dataFill)).toBeLessThan(NEUTRAL_CHROMA);
    expect(color.dataFill).not.toBe(color.primary);
    for (const status of tableStatusLegendOrder) {
      expect(color.dataFill).not.toBe(tableStatusStyle[status].fill);
    }
  });

  it('a bar clears 3:1 on the page and against its own track', () => {
    // A chart is a meaningful graphic, so it owes 3:1 — and it owes it against
    // the track it sits inside, not only against the card behind it.
    for (const ground of [color.surface, color.paper, color.dataTrack]) {
      expect(round(contrastRatio(color.dataFill, ground))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the chart fill is a lighter step than ink, than the accent, and than muted text', () => {
    // The whole point: a bar recedes, a button does not.
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.dataFill)).toBeLessThan(onSurface(color.foreground));
    expect(onSurface(color.dataFill)).toBeLessThan(onSurface(color.primary));
    expect(onSurface(color.dataFill)).toBeLessThan(onSurface(color.mutedForeground));
  });

  it('the accent is reserved for the active bar and nothing else in a chart', () => {
    expect(color.dataFillActive).toBe(color.primary);
    expect(color.dataTrack).not.toBe(color.primary);
    expect(color.dataFill).not.toBe(color.dataFillActive);
  });

  it('the track is lighter than the fill it holds', () => {
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.dataTrack)).toBeLessThan(onSurface(color.dataFill));
  });
});

describe('table state labels', () => {
  for (const status of tableStatusLegendOrder) {
    it(`${status} carries a label colour that is readable on its own fill`, () => {
      // Against the composited fill, not the raw hex: outOfService is the one
      // translucent state and its label has to be checked against what is
      // actually on screen.
      passesBody(tableStatusStyle[status].label, compositedFill(status));
    });
  }

  it('never relies on hue alone — free and reservedSoon differ in treatment', () => {
    // The pair a red/green-deficient reader is most likely to confuse.
    expect(tableStatusStyle.free.pattern).not.toBe(tableStatusStyle.reservedSoon.pattern);
    expect(tableStatusStyle.held.strokeDash).not.toBeNull();
    expect(tableStatusStyle.outOfService.fillOpacity).toBeLessThan(1);
    expect(tableStatusStyle.yourPick.ring).not.toBeNull();
  });

  it('all six states survive greyscale — no two share a treatment', () => {
    /*
     * The stronger version of the rule above, and the one that matters on a
     * terrace in July. Hue is stripped and what is left has to still name six
     * different things: a pattern, a dash, a border weight, an opacity, a ring.
     * `free` and `occupied` are why this test exists — both are a flat
     * unpatterned fill, and until `occupied` took a heavier edge in its own hue
     * the two most common states on a floor screen were separable by colour
     * alone.
     */
    const signature = (status: (typeof tableStatusLegendOrder)[number]) => {
      const s = tableStatusStyle[status];
      return [
        s.pattern,
        s.strokeDash ? s.strokeDash.join(',') : 'solid',
        s.strokeWidth,
        s.fillOpacity,
        s.ring ? 'ring' : 'no-ring',
      ].join('|');
    };

    const signatures = tableStatusLegendOrder.map(signature);
    expect(new Set(signatures).size).toBe(tableStatusLegendOrder.length);
  });
});

describe('shape and motion', () => {
  it('radius is a hierarchy: the floor plan stays rectilinear and controls are pills', () => {
    expect(radius.table).toBeLessThan(radius.soft);
    expect(radius.soft).toBeLessThan(radius.card);
    expect(radius.card).toBeLessThan(radius.sheet);
    expect(radius.sheet).toBeLessThan(radius.cardAccent);
    expect(radius.cardAccent).toBeLessThan(radius.pill);
    expect(radius.table).toBeLessThanOrEqual(2);
  });

  it('reduced motion resolves every duration to zero', () => {
    for (const key of Object.keys(duration) as (keyof typeof duration)[]) {
      expect(reducedDuration[key]).toBe(0);
    }
  });
});

describe('numbers are the hero', () => {
  for (const [surface, scale] of Object.entries(typeScale)) {
    it(`${surface}'s metric is larger than every step in its body scale`, () => {
      // The figure a person reads from furthest away has to be the largest
      // thing on the screen. If a heading ever outgrows it, the card stops
      // leading with its number and starts leading with its title.
      for (const size of Object.values(scale.size)) {
        expect(scale.metric.size).toBeGreaterThan(size);
      }
    });

    it(`${surface}'s metric leads tighter than its body text`, () => {
      // At 44px, body leading is a gap rather than a line.
      expect(scale.metric.lineHeight / scale.metric.size).toBeLessThan(1.3);
    });
  }

  it('the staff metric does not outgrow the room it sits beside', () => {
    // The floor plan is the hero on that surface, not a counter next to it.
    expect(typeScale.staff.metric.size).toBeLessThan(typeScale.console.metric.size);
  });

  it('a metric is set in ink, never in the accent', () => {
    // A number is read, not pressed. If the biggest thing on the dashboard is
    // also the most saturated, the accent stops meaning "act here".
    expect(color.foreground).not.toBe(color.primary);
  });
});

describe('one family, hierarchy from size and weight', () => {
  it('no step is set in the display face', () => {
    // The serif is retired from the scale but still built and exported: a
    // serif heading over a metric card is two design directions fighting.
    expect(displaySteps).toEqual([]);
  });

  it('a card corner is deliberate but not a lozenge', () => {
    expect(radius.card).toBeGreaterThan(radius.soft);
    expect(radius.card).toBeLessThan(radius.sheet);
  });
});
