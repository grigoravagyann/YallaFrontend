import { space } from '../../theme';

/**
 * Geometry of the floating tab bar, in one place so the bar and the screens
 * under it agree on how much of the bottom is spoken for.
 */
export const tabBarMetrics = {
  /** Height of the pill. */
  height: 68,
  /** Its corner radius: fully round ends. */
  radius: 34,
  /** Inset from the left and right screen edges. */
  inset: 14,
  /** Gap between the pill and the bottom safe edge. */
  bottomGap: 26,
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
  scanBottom: 30,
} as const;

/** How far the Scan circle rises above the pill's top edge. */
export const SCAN_RISE = tabBarMetrics.scanBottom + tabBarMetrics.scanSize - tabBarMetrics.height;

/**
 * Padding a tab screen adds under its content so the last card never hides
 * behind the bar: whichever reaches higher, the pill or the Scan circle rising
 * out of it, plus its gap from the safe edge and a breath of ground above it.
 * The safe-area inset itself is added at runtime — see `useNavClearance` in
 * `components/Screen.tsx`.
 */
export const NAV_CLEARANCE =
  tabBarMetrics.bottomGap +
  Math.max(tabBarMetrics.height + space.lg, tabBarMetrics.height + SCAN_RISE + space.sm);
