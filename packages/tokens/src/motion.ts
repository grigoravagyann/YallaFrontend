/**
 * Motion, in milliseconds. Gentle, eased, and always an answer to a person's
 * action. Nothing snaps.
 *
 * Two of the three surfaces are touch devices with no hover at all, so every
 * interactive element has a **pressed** state and hover is a web-only
 * enhancement layered on top. Both are a small scale change plus a shadow
 * change: tactile and immediate on a tablet, a lift on a desktop.
 *
 * Exactly one orchestrated moment exists: the floor plan drawing in. Tables
 * appear by floor area in sequence — windows, then bar, then terrace — once
 * per branch. Everything else answers a tap.
 */
export const duration = {
  /** Press and hover feedback, and any colour or shadow change on a control. */
  control: 220,
  /**
   * A table changing state on a live floor. Long enough to be noticed on a
   * counter tablet nobody is staring at, short enough not to lag the room.
   */
  stateChange: 200,
  /** The whole plan drawing itself in, area by area. */
  floorPlanDraw: 400,
} as const;

export type DurationToken = keyof typeof duration;

/**
 * Every duration resolved to zero.
 *
 * `prefers-reduced-motion` is not a request for *less* motion here, it is a
 * request for none. The plan drawing in and a table changing colour are the
 * only motion that carries information, and neither is the only way to learn
 * what it conveys.
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
 * The two transforms an interactive element is allowed.
 *
 * No rotation on any functional element: a tilting card is charm on a
 * marketing page and noise on a screen someone is working. Cards may lift on
 * hover on the web; nothing tilts.
 */
export const scale = {
  /** Under a finger or a mouse button. Paired with `elevation.lift`. */
  press: 0.97,
  /** Web only, behind `@media (hover: hover)`. Paired with `elevation.lift`. */
  hover: 1.03,
} as const;

/**
 * One easing curve: quick to start, settling rather than bouncing. Nothing in
 * this system overshoots.
 */
export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;
