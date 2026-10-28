import { describe, expect, it } from 'vitest';
import { color, subtleTextBackgrounds, textBackgrounds, tintedFills } from './color';
import { consoleColor } from './console';
import { AA_BODY, AA_LARGE, contrastRatio } from './contrast';
import { elevation } from './elevation';
import { duration, reducedDuration } from './motion';
import { radius } from './space';
import { displaySteps, typeScale } from './typography';
import { compositedFill, tableStatusLegendOrder, tableStatusStyle } from './tableState';

/**
 * The shared palette asserting things about itself.
 *
 * A contrast ratio checked once in a design review is a ratio that breaks
 * silently the first time someone nudges a hex value. Since SHURJ every
 * neutral and the action colour in `color.ts` is a `console.ts` value; these
 * tests hold the pairs the older screens draw, and hold the palette to Time to Eat.
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
    // The brand as text: the cherry is dark enough to be a line as well as a fill.
    ['primaryInk', color.primaryInk],
  ] as const;

  for (const [bgName, bg] of backgrounds) {
    for (const [fgName, fg] of foregrounds) {
      it(`${fgName} on ${bgName} clears AA for body text`, () => passesBody(fg, bg));
    }
  }

  it('subtleForeground clears AA on every ground it is allowed on', () => {
    for (const bg of subtleTextBackgrounds) passesBody(color.subtleForeground, bg);
  });

  it('Time to Eat has two text weights on the web: subtle is the muted grey', () => {
    // The pre-SHURJ palette had a third, lighter grey that failed on a tint.
    // Both remaps (`staff.css`, `.yc-legacy`) already drew it muted.
    expect(color.subtleForeground).toBe(color.mutedForeground);
    expect(color.mutedForeground).toBe(consoleColor.muted);
  });

  it('keeps the text weights in order, lightest last', () => {
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.foreground)).toBeGreaterThan(onSurface(color.mutedForeground));
    expect(onSurface(color.mutedForeground)).toBeGreaterThanOrEqual(
      onSurface(color.subtleForeground),
    );
  });

  it('every ground body text is set on is covered above', () => {
    expect(textBackgrounds).toEqual([color.surface, color.paper, color.greenTint]);
    expect(tintedFills).toEqual([color.greenTint]);
  });
});

describe('brand and feedback fills', () => {
  it('the ivory label on primary and on primaryPressed clears AA (14.47, 16.08)', () => {
    passesBody(color.primaryForeground, color.primary);
    passesBody(color.primaryForeground, color.primaryPressed);
  });

  it('white on danger and dangerPressed clears AA — a destructive button stays readable under a finger', () => {
    passesBody(color.dangerForeground, color.danger);
    passesBody(color.dangerForeground, color.dangerPressed);
  });

  it('a pressed ghost button keeps its label legible on the tint (12.47, 4.54)', () => {
    for (const tint of tintedFills) {
      passesBody(color.primaryInk, tint);
      passesBody(color.danger, tint);
    }
  });

  it('the action beside a floor plan is legible with its label on it', () => {
    passesBody(color.primaryForeground, color.primaryOnFloorPlan);
    passesBody(color.primaryForeground, color.primaryOnFloorPlanPressed);
  });

  it('successInk and warningInk clear AA as text on every ground a sentence sits on', () => {
    for (const ink of [color.successInk, color.warningInk]) {
      for (const ground of textBackgrounds) passesBody(ink, ground);
    }
    // And the fills they darken do not — which is the reason the inks exist.
    expect(contrastRatio(color.success, color.paper)).toBeLessThan(AA_BODY);
    expect(contrastRatio(color.warning, color.paper)).toBeLessThan(AA_BODY);
  });

  it("the strong edge clears the 3:1 owed by a control's boundary", () => {
    for (const ground of textBackgrounds) {
      expect(round(contrastRatio(color.borderStrong, ground))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the card edge is softer than the divider hairline', () => {
    expect(contrastRatio(color.borderSoft, color.surface)).toBeLessThan(
      contrastRatio(color.border, color.surface),
    );
  });
});

describe('the Black Cherry: one colour for the fill and the line', () => {
  it('the action is the console brand, with ivory on it', () => {
    expect(color.primary).toBe(consoleColor.brand);
    expect(color.primaryPressed).toBe(consoleColor.brandHover);
    expect(color.primaryForeground).toBe(consoleColor.brandForeground);
  });

  it('the cherry needs no darker twin: primaryInk is primary', () => {
    // The beige it replaced was 2.01:1 on white and needed a second token to
    // draw a line; the cherry is 15.39:1.
    expect(color.primaryInk).toBe(color.primary);
    expect(round(contrastRatio(color.primary, color.surface))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('primaryInk as text clears 4.5 on every text ground', () => {
    for (const ground of textBackgrounds) passesBody(color.primaryInk, ground);
  });

  it('the focus outline clears 3:1 on every ground a control sits on', () => {
    for (const ground of textBackgrounds) {
      expect(round(contrastRatio(color.focusRing, ground))).toBeGreaterThanOrEqual(AA_LARGE);
    }
    expect(color.focusRing).toBe(consoleColor.focus);
  });

  it('every neutral is a console.ts value', () => {
    expect(color.surface).toBe(consoleColor.surface);
    expect(color.paper).toBe(consoleColor.canvas);
    expect(color.foreground).toBe(consoleColor.ink);
    expect(color.border).toBe(consoleColor.line);
    expect(color.borderSoft).toBe(consoleColor.lineSoft);
    expect(color.borderStrong).toBe(consoleColor.buttonEdge);
    expect(color.greenTint).toBe(consoleColor.brandTint);
    expect(color.scrim).toBe(consoleColor.scrim);
  });

  it('no pre-SHURJ value survives in the palette', () => {
    const retired = [
      '#F4F6FA', // the cool paper
      '#131A22', // the blue-black ink
      '#55606E',
      '#646F7C',
      '#E2E8F0',
      '#EEF2F7',
      '#C4CCD8',
      '#79838F',
      '#E7ECF3',
      '#7D8896',
      '#C3B59F', // the beige accent
      '#AD9C80',
      '#6B5C45',
      '#EFECE6',
      '#3B6FD4', // the blue held
    ];
    const values = Object.values(color).map((value) => value.toUpperCase());
    for (const hex of retired) expect(values).not.toContain(hex);
    expect(values.join(' ')).not.toContain('19, 26, 34');
  });

  it('the ivory label is not white: Time to Eat keeps pure white for the page', () => {
    expect(color.primaryForeground).not.toBe('#FFFFFF');
    expect(color.paper).toBe('#FFFFFF');
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

/** Hue in degrees. Meaningless below roughly 0.15 chroma. */
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return Math.round((sector * 60 + 360) % 360);
};

/** Below this a colour is a grey. */
const NEUTRAL_CHROMA = 0.15;

describe('the rule that keeps colour meaning one thing', () => {
  /*
   * Saturated colour means a table's state; the one element you are meant to
   * act on is the cherry. The cherry and the waiting burgundy are one family,
   * so held is told from a button by its dotted edge and its place on a plan,
   * and the bright states are told from the cherry by lightness.
   */
  const chromaticStates = ['free', 'reservedSoon', 'held', 'occupied'] as const;
  const neutralStates = ['outOfService', 'yourPick'] as const;

  it('the two lists below cover all six states — nothing is quietly skipped', () => {
    expect([...chromaticStates, ...neutralStates].sort()).toEqual(
      [...tableStatusLegendOrder].sort(),
    );
  });

  it('every state that carries a hue actually carries one', () => {
    // The burgundy held is the dullest at 0.35; the rest are 0.49 and up.
    for (const state of chromaticStates) {
      expect(chroma(tableStatusStyle[state].fill)).toBeGreaterThan(0.3);
    }
  });

  it('the two hueless states are greys', () => {
    for (const state of neutralStates) {
      expect(chroma(tableStatusStyle[state].fill)).toBeLessThan(NEUTRAL_CHROMA);
    }
  });

  it('held is the waiting burgundy, never blue', () => {
    expect(tableStatusStyle.held.fill).toBe(consoleColor.waiting);
    expect(color.info).toBe(consoleColor.waiting);
    const h = hue(tableStatusStyle.held.fill);
    expect(h < 190 || h > 260).toBe(true);
  });

  it('the cherry is told from every bright state by lightness (2.75 to 7.43)', () => {
    for (const status of ['free', 'reservedSoon', 'occupied', 'outOfService'] as const) {
      expect(round(contrastRatio(color.primary, compositedFill(status)))).toBeGreaterThanOrEqual(
        2.5,
      );
    }
  });

  it('the dark states that share its value differ in treatment instead', () => {
    // Held (1.27:1 from the cherry) is dotted; yourPick (1.07:1) is ringed.
    expect(tableStatusStyle.held.strokeDash).not.toBeNull();
    expect(tableStatusStyle.yourPick.ring).not.toBeNull();
  });

  it('the action is not any state fill or stroke, on any surface', () => {
    for (const status of tableStatusLegendOrder) {
      expect(tableStatusStyle[status].fill).not.toBe(color.primary);
      expect(tableStatusStyle[status].fill).not.toBe(color.primaryPressed);
      expect(tableStatusStyle[status].stroke).not.toBe(color.primary);
    }
  });

  it('a table and a button differ in shape: the plan is rectilinear, a button a pill', () => {
    expect(radius.table).toBeLessThanOrEqual(2);
    expect(radius.pill).toBeGreaterThan(100);
  });
});

describe('the action has exactly one job', () => {
  it('yourPick is the charcoal, deliberately not the cherry', () => {
    expect(tableStatusStyle.yourPick.fill).toBe(color.foreground);
    expect(tableStatusStyle.yourPick.fill).not.toBe(color.primary);
    expect(tableStatusStyle.yourPick.ring).not.toBeNull();
  });

  it('there is no floor-plan swap — beside a plan the action is the same fill', () => {
    expect(color.primaryOnFloorPlan).toBe(color.primary);
    expect(color.primaryOnFloorPlanPressed).toBe(color.primaryPressed);
  });

  it('feedback colours are the state hues — one green, one amber, one red, one burgundy', () => {
    expect(color.success).toBe(tableStatusStyle.free.fill);
    expect(color.warning).toBe(tableStatusStyle.reservedSoon.fill);
    expect(color.danger).toBe(tableStatusStyle.occupied.fill);
    expect(color.info).toBe(tableStatusStyle.held.fill);
  });

  it('no feedback colour is the action — a toast reports, it is not a button', () => {
    for (const feedback of [color.success, color.warning, color.danger, color.info]) {
      expect(feedback).not.toBe(color.primary);
    }
  });

  it('shadows are charcoal-tinted and light — a card is held by its edge, not a glow', () => {
    for (const shadow of Object.values(elevation)) {
      expect(shadow.web).toContain('rgba(45, 41, 39');
      // The text colour, not the cherry. A cherry shadow under a white card is a glow.
      expect(shadow.native.shadowColor).toBe(color.foreground);
      expect(shadow.native.shadowColor).not.toBe(color.primary);
      // Low alpha on a white ground. A heavier shadow turns a grid of cards
      // into a grid of buttons.
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
