/**
 * Type scale, in points. React Native and the web both take these as raw numbers;
 * the web side appends `px` at the styling layer.
 *
 * Armenian and Russian set wider than English at the same size, and Armenian
 * ascenders/descenders need more leading, so line heights here are generous
 * enough to hold all three scripts without per-language overrides.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 40,
} as const;

export type FontSizeToken = keyof typeof fontSize;

export const lineHeight = {
  xs: 18,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  xxl: 40,
  display: 48,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type FontWeightToken = keyof typeof fontWeight;

/**
 * Font stacks must cover Armenian, Cyrillic and Latin. The system stacks below
 * all resolve to faces with full coverage on their platform; naming a single
 * font family here would silently fall back to tofu for `hy` on some devices.
 */
export const fontFamily = {
  ios: 'System',
  android: 'sans-serif',
  web: "system-ui, -apple-system, 'Segoe UI', 'Noto Sans Armenian', 'Noto Sans', Arial, sans-serif",
} as const;
