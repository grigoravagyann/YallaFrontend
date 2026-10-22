import { space } from '../../theme';

/**
 * Geometry of the floating tab bar, in one place so the bar and the screens
 * under it agree on how much of the bottom is spoken for.
 */
export const tabBarMetrics = {
  /** Height of the pill. */
  height: 63,
  /** Its corner radius: fully round ends. */
  radius: 31.5,
  /** Inset from the left and right screen edges. */
  inset: 14,
  /**
   * The pill tucks into the home-indicator area instead of floating a full gap
   * above it: it sits this much lower than the bottom safe edge (on an iPhone,
   * 34 − 8 = 26 pt off the screen's edge, as the design draws it)…
   */
  homeTuck: 8,
  /** …and never closer than this to the screen's edge (no inset, Android 3-button bars). */
  minBottom: 12,
  /** Padding inside the pill's two ends, so the outer labels clear its curve. */
  sidePadding: 4,
  /** Room under the labels: all five sit on this one baseline. */
  labelBottom: 9,
  /** The label: one line, the same size on every tab. */
  labelSize: 11.5,
  labelLine: 14,
  /** Between the glyph's box and its label. */
  labelGap: 3,
  /** The box a glyph sits in; the active tab fills it with the soft highlight. */
  iconBoxWidth: 40,
  iconBoxHeight: 30,
  /** Glyph size inside that box. */
  iconSize: 23,
  /** The raised Scan circle. */
  scanSize: 60,
  /** The QR glyph inside it. */
  scanGlyph: 30,
  /** Where the Scan circle's lower edge sits, above the pill's lower edge. */
  scanBottom: 21,
} as const;

/**
 * How far the pill's lower edge sits above the screen's bottom edge, given the
 * bottom safe-area inset (live QA on an iPhone, 2026-10-22: a full 26 pt gap
 * above the 34 pt inset left the bar floating far too high).
 */
export function navBottomOffset(insetBottom: number): number {
  return Math.max(insetBottom - tabBarMetrics.homeTuck, tabBarMetrics.minBottom);
}

/** How far the Scan circle rises above the pill's top edge. */
export const SCAN_RISE = tabBarMetrics.scanBottom + tabBarMetrics.scanSize - tabBarMetrics.height;

/**
 * Padding a tab screen adds under its content, measured from the pill's lower
 * edge, so the last card never hides behind the bar: whichever reaches higher,
 * the pill or the Scan circle rising out of it, plus a breath of ground above
 * it. Where the pill's lower edge sits depends on the safe-area inset, so the
 * screen adds `navBottomOffset` at runtime — see `useNavClearance` in
 * `components/Screen.tsx`.
 */
export const NAV_CLEARANCE = Math.max(
  tabBarMetrics.height + space.lg,
  tabBarMetrics.height + SCAN_RISE + space.sm,
);
