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
    // The accent as text is `primaryInk`. `primary` is a fill and is never text.
    ['primaryInk', color.primaryInk],
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
    // same standard as the neutral one — a beige ground does not buy an
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
  it('the ink label on primary and on primaryPressed clears AA', () => {
    passesBody(color.primaryForeground, color.primary);
    passesBody(color.primaryForeground, color.primaryPressed);
  });

  it('white on danger and dangerPressed clears AA — a destructive button stays readable under a finger', () => {
    passesBody(color.dangerForeground, color.danger);
    passesBody(color.dangerForeground, color.dangerPressed);
  });

  it('a pressed ghost button keeps its label legible on either tint', () => {
    for (const tint of tintedFills) {
      passesBody(color.primaryInk, tint);
      passesBody(color.danger, tint);
    }
  });

  it('the accent used beside a floor plan is legible with its ink label on it', () => {
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

describe('the beige accent: a fill with an ink label, and an ink for every line', () => {
  /*
   * `#C3B59F` is 2.01:1 on white. It cannot be text (4.5), a border or a focus
   * edge (3), and it cannot carry a white label (2.01). So the accent is two
   * tokens: `primary` fills, `primaryInk` draws. These are the minimums each
   * pair owes; the numbers in the comments are what the chosen values measure.
   */
  it('the fill value is the brand beige, and its label is ink', () => {
    expect(color.primary).toBe('#C3B59F');
    expect(color.primaryForeground).toBe(color.foreground);
  });

  it('fill and label: ink on primary (8.70) and on primaryPressed (6.54) clear 4.5', () => {
    for (const fill of [color.primary, color.primaryPressed]) {
      expect(round(contrastRatio(color.primaryForeground, fill))).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('white is never the label on the beige — it measures 2.01', () => {
    expect(color.primaryForeground).not.toBe('#FFFFFF');
    expect(round(contrastRatio('#FFFFFF', color.primary))).toBeLessThan(AA_BODY);
  });

  it('primaryInk as text clears 4.5 on white (6.48) and on paper (5.99)', () => {
    for (const ground of [color.surface, color.paper]) {
      expect(round(contrastRatio(color.primaryInk, ground))).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('primaryInk as a border or focus edge clears 3 on every ground a control sits on', () => {
    for (const ground of [color.surface, color.paper, color.accentTint, color.greenTint]) {
      expect(round(contrastRatio(color.primaryInk, ground))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the fill itself does not clear 3 on white — which is why it is never a line', () => {
    expect(round(contrastRatio(color.primary, color.surface))).toBeLessThan(AA_LARGE);
  });

  it('primaryInk is the same hue as the fill, only darker', () => {
    expect(hueDistance(color.primaryInk, color.primary)).toBeLessThanOrEqual(5);
    expect(contrastRatio(color.primaryInk, color.surface)).toBeGreaterThan(
      contrastRatio(color.primary, color.surface),
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
/** How much less saturated the accent must be than the dullest table state. */
const MIN_CHROMA_SEPARATION = 0.25;

describe('the rule that keeps colour meaning one thing', () => {
  /*
   * The rule this palette exists to enforce: saturated colour means a table's
   * state, and the one element you are meant to act on is marked by the beige
   * fill. The beige is a warm neutral — 0.14 chroma, under the line this file
   * calls grey — so it is separated from the four chromatic states by
   * saturation, not by hue angle. Its hue (37) is 3 degrees from amber, and a
   * test that measured angles would be measuring nothing a person can see.
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

  it('the accent is a warm neutral, not a hue that competes with the room', () => {
    /*
     * A ceiling. Push the beige past 0.15 chroma and it becomes a tan, then an
     * amber — the reserved-soon colour, 3 degrees away. Below the ceiling it
     * reads as a material, not a signal.
     */
    expect(chroma(color.primary)).toBeLessThan(NEUTRAL_CHROMA);
    // The ink is the same hue darkened, so it sits right on the line (0.15).
    expect(chroma(color.primaryInk)).toBeLessThanOrEqual(NEUTRAL_CHROMA);
  });

  it('every state that carries a hue is far more saturated than the accent', () => {
    for (const state of chromaticStates) {
      expect(chroma(tableStatusStyle[state].fill) - chroma(color.primary)).toBeGreaterThan(
        MIN_CHROMA_SEPARATION,
      );
    }
  });

  it('the accent is separated from the two hueless states by value, not by chroma', () => {
    /*
     * `outOfService` and `yourPick` are greys too (0.09 and 0.06), so chroma
     * separates nothing here. Value does: yourPick is ink, 8.70:1 from the
     * beige; outOfService is handled by the ink edge in the next test.
     */
    for (const state of neutralStates) {
      expect(chroma(tableStatusStyle[state].fill)).toBeLessThan(NEUTRAL_CHROMA);
    }
    expect(
      round(contrastRatio(tableStatusStyle.yourPick.fill, color.primary)),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('the accent is not any state fill or stroke, on any surface', () => {
    for (const status of tableStatusLegendOrder) {
      expect(tableStatusStyle[status].fill).not.toBe(color.primary);
      expect(tableStatusStyle[status].fill).not.toBe(color.primaryPressed);
      expect(tableStatusStyle[status].stroke).not.toBe(color.primary);
    }
  });

  it('outOfService is separated from an accent control by its ink edge, not its fill', () => {
    /*
     * Against the composited fill, not the raw hex — a dead table is never
     * painted at full strength. `#8B95A1` at 0.7 over the canvas resolves to
     * `#AEB5BD`. The beige fill is 1.03:1 from that — the same grey to a
     * colour-deficient eye — so every accent control beside a plan draws a
     * `primaryInk` edge, which is 3.13:1 from it. Both halves are pinned.
     */
    expect(round(contrastRatio(compositedFill('outOfService'), color.primary))).toBeLessThan(1.5);
    expect(
      round(contrastRatio(compositedFill('outOfService'), color.primaryInk)),
    ).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the accent trades value separation for saturation and shape, and the trade is deliberate', () => {
    /*
     * Pinned so nobody re-derives it later: the beige is not separated from
     * the state fills by lightness. `free` green is 1.32:1 from it. What
     * separates them is saturation — asserted above — plus a shape rule the
     * floor plan already enforces: a button is a pill, a table is rectilinear.
     */
    const values = chromaticStates.map((s) =>
      contrastRatio(color.primary, tableStatusStyle[s].fill),
    );
    expect(round(Math.min(...values))).toBeLessThan(AA_LARGE);

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

  it('there is no floor-plan swap — beside a plan the accent is the same fill', () => {
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
      // Ink, not the accent. A beige shadow under a white card is a glow.
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

  it('the chart fill is a lighter step than ink, than the accent ink, and than muted text', () => {
    // The whole point: a bar recedes, a label does not.
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.dataFill)).toBeLessThan(onSurface(color.foreground));
    expect(onSurface(color.dataFill)).toBeLessThan(onSurface(color.primaryInk));
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
