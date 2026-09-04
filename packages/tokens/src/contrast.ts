/**
 * WCAG 2.1 relative luminance and contrast.
 *
 * Lives in the tokens package, not in a test helper, because it is what lets the
 * palette assert things about itself. A contrast ratio that is checked once by
 * hand in a design review is a ratio that silently breaks the first time someone
 * nudges a hex value; a ratio the package computes is one a test can hold.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** `#RGB` or `#RRGGBB`, with or without the hash. */
export function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  if (!/^[0-9a-fA-F]{6}$/u.test(full)) {
    throw new RangeError(`Not a hex colour: ${hex}`);
  }

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast ratio between two opaque colours, 1 to 21.
 *
 * Opaque is the operative word, and the reason this system uses solid fills
 * rather than tinted transparency: the contrast of a translucent colour depends
 * on whatever ends up behind it, so it cannot be checked once and trusted.
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large text and UI boundaries. */
export const AA_BODY = 4.5;
export const AA_LARGE = 3;

export function meetsBodyContrast(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_BODY;
}

/**
 * The more legible of two candidates against a background.
 *
 * Used to pick the label colour for each table state rather than assuming
 * white-on-colour: white fails on the free-table green and passes on occupied
 * red, and guessing wrong there is a table label nobody can read on a terrace.
 */
export function bestForeground(background: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? '#000000';
  let bestRatio = -1;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}
