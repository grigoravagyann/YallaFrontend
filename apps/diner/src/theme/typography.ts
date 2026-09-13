import { fontWeight } from '@yalla/tokens';
import type { TextStyle } from 'react-native';

/**
 * The type scale of the reference design.
 *
 * Two families: Yalla Sans for everything, Yalla Serif (`display` on `Text`)
 * for the big screen titles and the place name in the details hero. The face
 * itself is chosen by `src/components/Text.tsx` from the `fontWeight` here —
 * styles never name a `fontFamily`.
 */
export const typography = {
  /** Screen titles — render with `<Text display>`. */
  title: { fontSize: 32, lineHeight: 38, fontWeight: fontWeight.bold },
  /** Place name in the details hero — render with `<Text display>`. */
  heading: { fontSize: 22, lineHeight: 28, fontWeight: fontWeight.bold },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: fontWeight.bold },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.regular },
  body: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.regular },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.regular },
  /** Default button label. */
  button: { fontSize: 16, lineHeight: 20, fontWeight: fontWeight.bold },
  /** Quieter button label (secondary / text variants). */
  buttonMedium: { fontSize: 16, lineHeight: 20, fontWeight: fontWeight.medium },
  /** Tab bar labels, always visible. */
  navLabel: { fontSize: 11, lineHeight: 14, fontWeight: fontWeight.medium },
} as const satisfies Record<string, TextStyle>;

export type TypographyStep = keyof typeof typography;

/**
 * Prices, ratings, distances and table numbers sit in columns that must line
 * up; proportional digits in a price column have to be deciphered.
 */
export const tabularNumbers = { fontVariant: ['tabular-nums'] } as const satisfies TextStyle;

export { fontWeight };
