import { fabSize, layout, space } from '../../theme';

/**
 * Geometry of the floating tab bar, in one place so the bar and the screens
 * under it agree on how much of the bottom is spoken for.
 */
export const tabBarMetrics = {
  /** Height of the white pill. */
  height: 64,
  /** Its corner radius. */
  radius: 28,
  /** Inset from the left and right screen edges. */
  inset: layout.screenPadding,
  /** Gap between the pill and the bottom safe edge. */
  bottomGap: space.md,
  /** How far the Scan FAB rises above the pill's top edge. */
  fabRise: fabSize / 2,
  /** Vertical lift of the active icon + label. */
  activeLift: 4,
} as const;

/**
 * Padding a tab screen adds under its content so the last card never hides
 * behind the pill: the pill, its gap from the safe edge, and a breath of cream
 * above it. The safe-area inset itself is added at runtime — see
 * `useNavClearance` in `components/Screen.tsx`.
 */
export const NAV_CLEARANCE = tabBarMetrics.height + tabBarMetrics.bottomGap + space.lg;
