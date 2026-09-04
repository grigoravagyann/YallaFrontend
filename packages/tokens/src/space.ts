/**
 * 4px base scale. Every gap, pad and inset in both apps comes from here.
 *
 * Spacing in this product is measured, not generous. It is a working tool: a
 * venue list or a reservations table wants information density, not
 * marketing-page air. The larger steps are for section boundaries, not for
 * padding a card.
 */
export const space = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export type SpaceToken = keyof typeof space;

const ORDER: readonly SpaceToken[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl', 'huge'];

/**
 * One step up the scale.
 *
 * Staff screens use this for anything tappable: the same layout, read standing
 * up from two metres, needs the next size of everything. Expressed as a
 * function of the scale rather than as a second hand-written scale, so the two
 * cannot drift.
 */
export function stepUp(token: SpaceToken): number {
  const index = ORDER.indexOf(token);
  return space[ORDER[Math.min(index + 1, ORDER.length - 1)] ?? token];
}

/**
 * Radius is hierarchy, not one value applied everywhere.
 *
 * A single shared radius across buttons, cards and sheets is the surest sign of
 * a component kit rather than a design — the eye reads "these are all the same
 * kind of thing" when they are not.
 *
 * No pills. Nothing asymmetric.
 */
export const radius = {
  none: 0,
  /**
   * Tables in the floor plan. Nearly square on purpose: the plan is a map of
   * real furniture at real positions, and a waiter needs to recognise the shape
   * of table 7, not a rounded abstraction of it.
   */
  table: 2,
  /** Buttons, inputs, chips, badges, icon backgrounds. */
  control: 6,
  /** Cards and panels. */
  card: 10,
  /** Bottom sheets — top corners only. */
  sheet: 14,
  /** Avatars, and nothing else. */
  full: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Minimum interactive sizes.
 *
 * `staff` is larger than the platform minimum because the staff tablet is used
 * standing up, at arm's length, often one-handed while carrying something.
 */
export const touchTarget = {
  /** Diner app floor, and the platform guideline. */
  minimum: 44,
  small: 36,
  large: 52,
  /** Staff screens. Every control steps up. */
  staff: 56,
} as const;
