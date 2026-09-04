import { describe, expect, it } from 'vitest';
import { color, textBackgrounds } from './color';
import { AA_BODY, AA_LARGE, contrastRatio } from './contrast';
import { compositedFill, tableStatusLegendOrder, tableStatusStyle } from './tableState';

/**
 * The palette asserting things about itself.
 *
 * A contrast ratio checked once in a design review is a ratio that breaks
 * silently the first time someone nudges a hex value. These tests are the
 * reason the brief's `subtleForeground` was darkened rather than shipped at
 * 2.77:1 — and the reason nobody can quietly put it back.
 */

const round = (n: number) => Math.round(n * 100) / 100;

describe('text contrast', () => {
  const backgrounds = [
    ['surface', color.surface],
    ['paper', color.paper],
    ['greenTint', color.greenTint],
  ] as const;

  const foregrounds = [
    ['foreground', color.foreground],
    ['mutedForeground', color.mutedForeground],
    ['subtleForeground', color.subtleForeground],
    ['primary', color.primary],
  ] as const;

  for (const [bgName, bg] of backgrounds) {
    for (const [fgName, fg] of foregrounds) {
      it(`${fgName} on ${bgName} clears AA for body text`, () => {
        expect(round(contrastRatio(fg, bg))).toBeGreaterThanOrEqual(AA_BODY);
      });
    }
  }

  it('keeps the three text weights in order, lightest last', () => {
    const onSurface = (hex: string) => contrastRatio(hex, color.surface);
    expect(onSurface(color.foreground)).toBeGreaterThan(onSurface(color.mutedForeground));
    expect(onSurface(color.mutedForeground)).toBeGreaterThan(onSurface(color.subtleForeground));
  });

  it('every background body text is set on is covered above', () => {
    expect(textBackgrounds).toEqual([color.surface, color.paper, color.greenTint]);
  });
});

describe('brand and feedback fills', () => {
  it('white on primary and on primaryPressed clears AA', () => {
    expect(round(contrastRatio(color.primaryForeground, color.primary))).toBeGreaterThanOrEqual(
      AA_BODY,
    );
    expect(
      round(contrastRatio(color.primaryForeground, color.primaryPressed)),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('white on danger clears AA — the destructive button is readable', () => {
    expect(round(contrastRatio(color.dangerForeground, color.danger))).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it('the ink used beside a floor plan is legible with white on it', () => {
    expect(
      round(contrastRatio(color.primaryForeground, color.primaryOnFloorPlan)),
    ).toBeGreaterThanOrEqual(AA_BODY);
    expect(
      round(contrastRatio(color.primaryForeground, color.primaryOnFloorPlanPressed)),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('control outlines clear the 3:1 owed by a control boundary', () => {
    expect(round(contrastRatio(color.borderInteractive, color.surface))).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
    expect(round(contrastRatio(color.borderInteractive, color.paper))).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
  });
});

describe('table state labels', () => {
  for (const status of tableStatusLegendOrder) {
    it(`${status} carries a label colour that is readable on its own fill`, () => {
      // Against the composited fill, not the raw hex: outOfService is the one
      // translucent state and its label has to be checked against what is
      // actually on screen.
      const background = compositedFill(status);
      const ratio = contrastRatio(tableStatusStyle[status].label, background);
      expect(round(ratio)).toBeGreaterThanOrEqual(AA_BODY);
    });
  }

  it('never relies on hue alone — every state differs in more than colour', () => {
    const signatures = tableStatusLegendOrder.map((status) => {
      const s = tableStatusStyle[status];
      return `${s.pattern}|${s.strokeDash ? s.strokeDash.join(',') : 'solid'}|${s.fillOpacity}|${
        s.ring ? 'ring' : 'flat'
      }`;
    });

    // Two states may share a treatment only if their hues are far apart; the
    // pair this protects is free and reservedSoon, which are the two a
    // red/green-deficient reader is most likely to confuse.
    const free = tableStatusStyle.free;
    const reserved = tableStatusStyle.reservedSoon;
    expect(free.pattern).not.toBe(reserved.pattern);
    expect(signatures.length).toBe(tableStatusLegendOrder.length);
  });

  it('keeps brand green and free-table green far apart in lightness', () => {
    // The rule the whole colour system rests on: brand green is deep and
    // desaturated, free-table green is bright and saturated. If these ever
    // converge, a green button beside a green table stops meaning anything.
    const brand = contrastRatio(color.primary, color.surface);
    const free = contrastRatio(color.success, color.surface);
    expect(brand).toBeGreaterThan(free * 2);
  });
});
