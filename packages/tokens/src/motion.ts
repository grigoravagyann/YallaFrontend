/**
 * Motion, in milliseconds.
 *
 * Transitions animate **colour only**. Nothing scales, lifts, tilts or slides
 * on press: a flat, precise system responds by changing colour, and slow easing
 * on flat surfaces reads as sluggish rather than smooth.
 *
 * Two exceptions, both because the motion carries information rather than
 * decoration:
 *
 * - `floorPlanDraw` — tables appear by floor area in sequence, once per branch.
 *   It reads as a plan being drawn, and it reveals that the room *has* areas,
 *   which a static render does not.
 * - `stateChange` — a table changing state animates its fill, so a change is
 *   noticeable on a counter tablet nobody is staring at, without a
 *   notification.
 */
export const duration = {
  /** Press and hover feedback. Snappy: 120–180ms on colour. */
  control: 140,
  /** A table changing state on a live floor. */
  stateChange: 200,
  /** The floor plan drawing itself in, area by area. */
  floorPlanDraw: 350,
} as const;

export type DurationToken = keyof typeof duration;

/**
 * Every duration resolved to zero.
 *
 * `prefers-reduced-motion` is not a request for *less* motion here, it is a
 * request for none: the two exceptions above are the only motion in the
 * product, and both are conveniences rather than the only way to learn the
 * information they carry.
 */
export const reducedDuration: Readonly<Record<DurationToken, 0>> = {
  control: 0,
  stateChange: 0,
  floorPlanDraw: 0,
} as const;

/** Pick the right set. Callers pass whatever their platform reports. */
export function durations(prefersReducedMotion: boolean): Readonly<Record<DurationToken, number>> {
  return prefersReducedMotion ? reducedDuration : duration;
}

/**
 * A single easing curve. Standard material-style ease-out: quick to start,
 * settling rather than bouncing. Nothing in this system overshoots.
 */
export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;
