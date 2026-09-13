/**
 * Radius is hierarchy: cards 16, the photo hero 20, the details sheet 24,
 * anything pressable fully round, chips and tiles a step smaller.
 */
export const radius = {
  card: 16,
  hero: 20,
  sheet: 24,
  pill: 999,
  chip: 12,
  tile: 14,
  /** The Explore search field. */
  search: 22,
  small: 8,
} as const;

export type RadiusToken = keyof typeof radius;
