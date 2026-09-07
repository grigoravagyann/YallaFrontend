/**
 * 4px base scale. Every gap, pad and inset in both apps comes from here.
 *
 * Whitespace is generous on the diner and marketing surfaces and dense on
 * purpose in the console: a venue list or a reservations table wants
 * information, not marketing-page air. Staff screens step up one level for
 * anything tappable.
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
 * Soft and generous on anything a person holds or presses; rectilinear on the
 * one thing that is a map. A single shared radius across buttons, cards and
 * sheets is the surest sign of a component kit rather than a design.
 */
export const radius = {
  none: 0,
  /**
   * Tables in the floor plan. Nearly square on purpose: the plan is a map of
   * real furniture at real positions, and a waiter needs to recognise the shape
   * of table 7, not a rounded abstraction of it. Organic radii here would turn
   * a functional plan into a decorative illustration.
   */
  table: 2,
  /** Small containers that are not controls: icon tiles, code cells, banners. */
  soft: 10,
  /**
   * Cards, on every surface.
   *
   * Down from 24. A 24px corner on a 200px metric card is a lozenge; the
   * reference this system follows sits nearer 14, and at that radius a grid of
   * cards reads as a grid rather than as a row of pills. Small enough to be
   * calm, large enough that it is unmistakably deliberate.
   */
  card: 14,
  /**
   * Retained for the one dev screen that imports it, and no longer part of the
   * system. It was the swelling corner of an asymmetric card — the signature
   * move of the organic direction this replaces. Nothing in the new system
   * asks a card to be asymmetric.
   */
  cardAccent: 28,
  /** Bottom sheets — top corners only. */
  sheet: 20,
  /** Buttons, inputs, chips, avatars: fully round. */
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Interactive sizes. Buttons take their height from here.
 *
 * `staff` is larger than the platform minimum because the staff tablet is used
 * standing up, in a hurry, often one-handed while carrying something.
 */
export const touchTarget = {
  /** Diner app floor, and the platform guideline. */
  minimum: 44,
  /** Small button. */
  small: 40,
  /** Default button and input height. */
  regular: 48,
  /** Large button. */
  large: 56,
  /** Staff screens. Every control steps up to this. */
  staff: 56,
} as const;

export type TouchTargetToken = keyof typeof touchTarget;

/**
 * Lucide icons, 2px stroke, `primary` by default. Feature icons sit in a
 * `container` filled `greenTint`, which fills to solid `primary` with a white
 * icon on press.
 */
export const icon = {
  size: 24,
  strokeWidth: 2,
  container: 56,
} as const;
