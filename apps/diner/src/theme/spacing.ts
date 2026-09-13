import { space } from '@yalla/tokens';

/**
 * The 4px scale, re-exported from the design tokens so both apps share one
 * rhythm. `layout` names the handful of distances the reference repeats.
 */
export { space };
export type { SpaceToken } from '@yalla/tokens';

export const layout = {
  /** Horizontal page padding and the inset of the floating tab bar. */
  screenPadding: space.lg,
  /** Gap between stacked cards in a list. */
  cardGap: space.md + 2,
  /** Height of a hero card on Explore. */
  heroCardHeight: 160,
  /** Platform minimum touch target. */
  touchTarget: 44,
  /** Default control height (buttons, inputs, search field). */
  controlHeight: 48,
  /** The one big press — Book a Table, Confirm Booking. */
  controlHeightLarge: 56,
  /** Square action tiles on the details screen (Call / Directions / …). */
  actionTile: 72,
  /** The round brand mark above the welcome title. */
  welcomeMark: 88,
  /** Widest a centred paragraph runs before it stops being read as one. */
  readableWidth: 320,
} as const;
