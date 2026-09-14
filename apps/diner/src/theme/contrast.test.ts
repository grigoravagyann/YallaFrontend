import { contrastRatio } from '@yalla/tokens';
import { describe, expect, it } from 'vitest';
import { badgeColors, badgeVariants, type BadgeTone, type BadgeVariant } from './badges';
import { colors, glyphColors, textColors } from './colors';

/**
 * WCAG AA for the diner palette.
 *
 * A contrast ratio checked once by eye is a ratio that breaks the first time a
 * hex value is nudged. These hold every pairing the palette promises: each
 * badge in both tones, each text colour on each ground a sentence sits on, and
 * the glyphs that stand on their own at 3:1.
 */

const AA_TEXT = 4.5;
const AA_GLYPH = 3;

/** The grounds text is set on. `surfaceMuted` is the notice and banner fill. */
const grounds = {
  surface: colors.surface,
  background: colors.background,
  surfaceMuted: colors.surfaceMuted,
} as const;

/** `rgba(r,g,b,a)` laid over an opaque hex, as the eye sees it. */
function over(translucent: string, opaque: string): string {
  const match = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/u.exec(
    translucent.replace(/\s/gu, ''),
  );
  if (!match) throw new RangeError(`Not an rgba colour: ${translucent}`);
  const [, r, g, b, a] = match;
  const alpha = Number(a);
  const base = opaque.replace('#', '');
  const channels = [Number(r), Number(g), Number(b)].map((value, i) => {
    const under = Number.parseInt(base.slice(i * 2, i * 2 + 2), 16);
    return Math.round(value * alpha + under * (1 - alpha));
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

describe('badges', () => {
  const cases = (Object.keys(badgeVariants) as BadgeVariant[]).flatMap((variant) =>
    (['solid', 'soft'] as const satisfies readonly BadgeTone[]).map(
      (tone) => [variant, tone] as const,
    ),
  );

  it.each(cases)('%s (%s) labels clear 4.5:1 on their own fill', (variant, tone) => {
    const { background, foreground } = badgeColors(variant, tone);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('covers every variant', () => {
    expect(cases).toHaveLength(Object.keys(badgeVariants).length * 2);
  });
});

describe('text', () => {
  const cases = Object.entries(textColors).flatMap(([name, value]) =>
    Object.entries(grounds).map(([ground, fill]) => [name, ground, value, fill] as const),
  );

  it.each(cases)('%s clears 4.5:1 on %s', (_name, _ground, value, fill) => {
    expect(contrastRatio(value, fill)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each([
    ['successInk', colors.successInk, colors.successSoft],
    ['warningInk', colors.warningInk, colors.warningSoft],
    ['errorInk', colors.errorInk, colors.errorSoft],
    ['infoInk', colors.infoInk, colors.infoSoft],
  ] as const)('%s clears 4.5:1 on its own soft tint', (_name, ink, soft) => {
    expect(contrastRatio(ink, soft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('white clears 4.5:1 on the success, error and info inks used as solid fills', () => {
    for (const fill of [colors.successInk, colors.errorInk, colors.infoInk]) {
      expect(contrastRatio(colors.onImage, fill)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('dark text clears 4.5:1 on the orange fill, which never carries white', () => {
    expect(contrastRatio(colors.text, colors.warning)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(colors.onImage, colors.warning)).toBeLessThan(AA_TEXT);
  });

  it('keeps the bright state fills and textSubtle out of the text colours', () => {
    const allowed = Object.values(textColors) as string[];
    for (const banned of [
      colors.success,
      colors.warning,
      colors.error,
      colors.info,
      colors.textSubtle,
    ]) {
      expect(allowed).not.toContain(banned);
    }
  });

  it('white captions clear 4.5:1 on the photo scrim over a white photo', () => {
    expect(
      contrastRatio(colors.onImage, over(colors.overlayDark, colors.surface)),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('glyphs', () => {
  const cases = Object.entries(glyphColors).flatMap(([name, value]) =>
    Object.entries(grounds).map(([ground, fill]) => [name, ground, value, fill] as const),
  );

  it.each(cases)('%s clears 3:1 on %s', (_name, _ground, value, fill) => {
    expect(contrastRatio(value, fill)).toBeGreaterThanOrEqual(AA_GLYPH);
  });

  it('the rating star is the warning ink', () => {
    expect(glyphColors.ratingStar).toBe(colors.warningInk);
  });

  it('a white glyph on the glass circle clears 3:1 even over a white photo', () => {
    expect(
      contrastRatio(colors.onImage, over(colors.glass, colors.surface)),
    ).toBeGreaterThanOrEqual(AA_GLYPH);
  });
});
