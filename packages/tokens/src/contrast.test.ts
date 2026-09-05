import { describe, expect, it } from 'vitest';
import { color, subtleTextBackgrounds, textBackgrounds } from './color';
import { AA_BODY, AA_LARGE, contrastRatio } from './contrast';
import { elevation } from './elevation';
import { duration, reducedDuration } from './motion';
import { radius } from './space';
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

describe('the rule that keeps green safe', () => {
  it('brand green is deep and free-table green is bright — far apart in lightness', () => {
    // Brand green's contrast against white is more than double free green's.
    // If these ever converge, a green button beside a green table stops meaning
    // anything.
    const brand = contrastRatio(color.primary, color.surface);
    const free = contrastRatio(color.success, color.surface);
    expect(brand).toBeGreaterThan(free * 2);
  });

  it('the primary action beside a floor plan is ink, not any green', () => {
    expect(color.primaryOnFloorPlan).toBe(color.foreground);
    expect(color.primaryOnFloorPlan).not.toBe(color.primary);
  });

  it('feedback colours are the state hues — one green, one amber, one red, one blue', () => {
    expect(color.success).toBe(tableStatusStyle.free.fill);
    expect(color.warning).toBe(tableStatusStyle.reservedSoon.fill);
    expect(color.danger).toBe(tableStatusStyle.occupied.fill);
    expect(color.info).toBe(tableStatusStyle.held.fill);
  });

  it('shadows are green-tinted, never pure black', () => {
    for (const shadow of Object.values(elevation)) {
      expect(shadow.web).toContain('rgba(30, 91, 60');
      expect(shadow.native.shadowColor).toBe(color.primary);
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
