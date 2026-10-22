import { colors, fontWeight } from '../../theme';
import { tabBarMetrics } from './metrics';

/**
 * How far a large system font may grow the labels. The bar is a fixed 68:
 * past this the five labels no longer sit on one line each.
 */
export const MAX_NAV_LABEL_SCALE = 1.3;

/** One label style for the four tabs and Scan, so all five share a baseline. */
export const navLabelStyle = {
  fontSize: tabBarMetrics.labelSize,
  lineHeight: tabBarMetrics.labelLine,
  fontWeight: fontWeight.medium,
  color: colors.navLabel,
} as const;

/** The current tab's label: the brand ink; the design's 600 rounds to the sans's bold face. */
export const navLabelActiveStyle = { fontWeight: fontWeight.bold, color: colors.primary } as const;
