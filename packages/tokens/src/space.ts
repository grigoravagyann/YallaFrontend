/** 4pt base scale. Every gap, pad and inset in all three apps comes from here. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type SpaceToken = keyof typeof space;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Minimum interactive sizes.
 *
 * `staffTouchTarget` is deliberately larger than the platform 44pt minimum: the
 * staff tablet is used standing up, at arm's length, often one-handed while
 * carrying something.
 */
export const touchTarget = {
  minimum: 44,
  staff: 64,
} as const;
