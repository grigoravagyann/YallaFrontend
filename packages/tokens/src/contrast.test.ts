import { describe, expect, it } from 'vitest';
import { color, subtleTextBackgrounds, textBackgrounds } from './color';
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

  it('subtleForeground is not allowed on greenTint, and the token set says so', () => {
    // Documented rule, not an accident: if this ever passes, the darkening that
    // made it pass has compressed muted and subtle into one weight, and the
    // rule can be dropped along with this test.
    expect(subtleTextBackgrounds).not.toContain(color.greenTint);
    expect(round(contrastRatio(color.subtleForeground, color.greenTint))).toBeLessThan(AA_BODY);
  });

  it('keeps the three text weights in order, lightest last', () => {
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.foreground)).toBeGreaterThan(onSurface(color.mutedForeground));
    expect(onSurface(color.mutedForeground)).toBeGreaterThan(onSurface(color.subtleForeground));
  });

  it('every ground body text is set on is covered above', () => {
    expect(textBackgrounds).toEqual([color.surface, color.paper, color.greenTint]);
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

  it('a pressed ghost button keeps its label legible on the green tint', () => {
    passesBody(color.primary, color.greenTint);
    passesBody(color.danger, color.greenTint);
  });

  it('the ink used beside a floor plan is legible with white on it', () => {
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

/** Chroma as max-min over 255: 0 is a perfect grey, 1 is a pure hue. */
const chroma = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return round((Math.max(r, g, b) - Math.min(r, g, b)) / 255);
};

describe('the rule that keeps colour meaning one thing', () => {
  /*
   * The rule this palette exists to enforce: colour means table state, and
   * nothing else in the product is coloured. It replaces the old rule, which
   * kept a brand green and a free-table green apart by lightness and swapped
   * the button to ink beside a floor plan. That worked, and it needed an
   * exception on every screen that mattered. These tests assert the stronger
   * version, which needs none.
   */
  const chromaticStates = ['free', 'reservedSoon', 'held', 'occupied'] as const;

  it('the accent is achromatic — it cannot be mistaken for any state', () => {
    expect(chroma(color.primary)).toBeLessThan(0.1);
    expect(chroma(color.primaryPressed)).toBeLessThan(0.15);
  });

  it('every state that carries a hue actually carries one', () => {
    for (const state of chromaticStates) {
      expect(chroma(tableStatusStyle[state].fill)).toBeGreaterThan(0.4);
    }
  });

  it('the accent is not any state fill, on any surface', () => {
    for (const status of tableStatusLegendOrder) {
      if (status === 'yourPick') continue;
      expect(tableStatusStyle[status].fill).not.toBe(color.primary);
      expect(tableStatusStyle[status].fill).not.toBe(color.primaryPressed);
    }
  });

  it('outOfService is the other neutral, and lightness keeps it apart from the accent', () => {
    // Both are close to grey, so hue cannot separate them. Nothing else has to:
    // one is a near-black control and the other a pale dead table.
    expect(chroma(color.outOfService)).toBeLessThan(0.15);
    expect(round(contrastRatio(color.outOfService, color.primary))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('yourPick is the accent, and its ring is what tells them apart', () => {
    // The one state that is deliberately the accent colour: it marks the table
    // the diner's next action applies to. It never co-occurs with a button in
    // the same role, and it is the only state carrying a ring.
    expect(tableStatusStyle.yourPick.fill).toBe(color.primary);
    expect(tableStatusStyle.yourPick.ring).not.toBeNull();
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

  it('shadows are ink-tinted and light — a card is separated by elevation, not a line', () => {
    for (const shadow of Object.values(elevation)) {
      expect(shadow.web).toContain('rgba(19, 26, 34');
      expect(shadow.native.shadowColor).toBe(color.primary);
      // Low alpha on a near-white ground. A heavier shadow turns a grid of
      // cards into a grid of buttons.
      expect(shadow.native.shadowOpacity).toBeLessThanOrEqual(0.12);
    }
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
