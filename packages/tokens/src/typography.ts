/**
 * Two faces, three scripts, three scales.
 *
 * The hard constraint is script coverage: the type must set Armenian, Cyrillic
 * and Latin. Armenian in a fallback face is the fastest way for this product to
 * look foreign and badly translated in the city it launches in, which rules out
 * most typefaces a designer would reach for first — Fraunces, Nunito and
 * Quicksand among them.
 *
 * The Noto superfamily keeps the serif-display and clean-body pairing while
 * covering all three scripts:
 *
 * - **Yalla Serif** — Noto Serif merged with Noto Serif Armenian. Display only,
 *   at 600 and 700. This carries the old-world warmth the style asks for.
 * - **Yalla Sans**  — Noto Sans merged with Noto Sans Armenian. Body, at 400,
 *   500 and 700.
 *
 * Each is merged rather than stacked because neither half is sufficient alone
 * (Google's Latin faces have no Armenian and no `֏`; the Armenian faces have no
 * Cyrillic) and React Native does not fall through a font stack per character.
 * See `scripts/build-fonts.py`, whose verify step is what confirms the dram
 * sign survived the subset.
 */

/** Body weights the sans actually ships. There is no 600; asking synthesises. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;

export type FontWeightToken = keyof typeof fontWeight;
export type FontWeightValue = (typeof fontWeight)[FontWeightToken];

/** Display weights the serif ships. */
export const displayWeight = {
  semibold: '600',
  bold: '700',
} as const;

export type DisplayWeightValue = (typeof displayWeight)[keyof typeof displayWeight];

export const fontFamily = {
  body: {
    /**
     * The Noto fallbacks matter: they are what a browser reaches for in the
     * seconds before the self-hosted face has loaded, and they are metrically
     * close enough that the reflow is not a jolt.
     */
    web: "'Yalla Sans', 'Noto Sans Armenian', 'Noto Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  display: {
    web: "'Yalla Serif', 'Noto Serif Armenian', 'Noto Serif', Georgia, 'Times New Roman', serif",
  },
} as const;

/**
 * React Native selects a face by name, not by family plus weight — asking for
 * `fontWeight: '500'` on a custom family gets you a synthesised approximation on
 * Android and silence on iOS. So native styles name the face directly.
 */
export const nativeFontFace = {
  '400': 'YallaSans-Regular',
  '500': 'YallaSans-Medium',
  '700': 'YallaSans-Bold',
} as const satisfies Record<FontWeightValue, string>;

export const nativeDisplayFontFace = {
  '600': 'YallaSerif-SemiBold',
  '700': 'YallaSerif-Bold',
} as const satisfies Record<DisplayWeightValue, string>;

/** The style object a React Native `Text` needs for a given body weight. */
export function nativeFont(weight: FontWeightValue = fontWeight.regular): {
  fontFamily: string;
} {
  return { fontFamily: nativeFontFace[weight] };
}

/** The same, for display text. */
export function nativeDisplayFont(weight: DisplayWeightValue = displayWeight.semibold): {
  fontFamily: string;
} {
  return { fontFamily: nativeDisplayFontFace[weight] };
}

/**
 * Tabular figures.
 *
 * This product is made of numbers — table labels, dram prices, times, free-table
 * counts — and most of them sit in columns that have to align. Proportional
 * digits in a price column are the difference between a bill that reads and one
 * that has to be deciphered.
 */
export const fontFeature = {
  tabularNumbers: "'tnum' 1",
} as const;

export type TypeStep = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

/**
 * The two steps set in the display face. Everything below them is body.
 * Sentence case throughout: no all-caps labels, and no accenting one word
 * inside a heading — both read as templated.
 */
export const displaySteps: readonly TypeStep[] = ['xl', 'xxl'] as const;

export function isDisplayStep(step: TypeStep): boolean {
  return displaySteps.includes(step);
}

export interface TypeScale {
  /** Body size for this surface, for reference; not itself a step. */
  readonly base: number;
  readonly size: Readonly<Record<TypeStep, number>>;
  readonly lineHeight: Readonly<Record<TypeStep, number>>;
}

/** Round to the nearest whole pixel: half-pixel line heights blur on Android. */
const round = (n: number) => Math.round(n);

function scale(
  base: number,
  sizes: readonly [number, number, number, number, number, number],
  bodyRatio: number,
  displayRatio: number,
): TypeScale {
  const [xs, sm, md, lg, xl, xxl] = sizes;
  return {
    base,
    size: { xs, sm, md, lg, xl, xxl },
    lineHeight: {
      xs: round(xs * bodyRatio),
      sm: round(sm * bodyRatio),
      md: round(md * bodyRatio),
      lg: round(lg * bodyRatio),
      // The two display steps tighten: at 34px, 1.5 leading is a gap, not a line.
      xl: round(xl * displayRatio),
      xxl: round(xxl * displayRatio),
    },
  };
}

/**
 * Three scales, because the three surfaces are read at different distances.
 *
 * - **diner** — a phone at arm's length.
 * - **staff** — a tablet on a counter, read standing, from about two metres.
 * - **console** — a desktop, dense tables, read sitting down.
 *
 * A single scale stretched across all three either shouts on the desktop or
 * disappears on the counter.
 */
export const typeScale = {
  diner: scale(16, [12, 14, 16, 20, 26, 34], 1.5, 1.2),
  staff: scale(18, [14, 16, 18, 22, 30, 40], 1.4, 1.15),
  console: scale(15, [11, 13, 15, 18, 22, 28], 1.45, 1.25),
} as const;

export type SurfaceName = keyof typeof typeScale;

/**
 * The diner scale, flat.
 *
 * The diner app is the only React Native surface, so its styles read better
 * without the extra hop through `typeScale.diner`. Web surfaces take their
 * sizes from the generated CSS variables, which carry all three scales.
 */
export const fontSize = typeScale.diner.size;
export const lineHeight = typeScale.diner.lineHeight;

export type FontSizeToken = keyof typeof fontSize;
