/**
 * The diner app's theme. Screens import from here and nowhere else for colour,
 * type, spacing, radius, shadow and icon sizes. ESLint refuses the shared
 * colour, elevation and type-size tokens anywhere else in the app.
 */
export { colors, contentBadgeColor, glyphColors, tableStatusColor, textColors } from './colors';
export type { ColorName } from './colors';

export { badgeColors, badgeVariants } from './badges';
export type { BadgeSpec, BadgeTone, BadgeVariant } from './badges';

export {
  displayWeight,
  fontWeight,
  nativeDisplayFontFace,
  nativeFontFace,
  tabularNumbers,
  typography,
} from './typography';
export type { DisplayWeightValue, FontWeightValue, TypographyStep } from './typography';

export { layout, space } from './spacing';
export type { SpaceToken } from './spacing';

export { radius } from './radius';
export type { RadiusToken } from './radius';

export { shadows } from './shadows';
export type { ShadowToken } from './shadows';

export {
  actionIcon,
  amenityIcon,
  fabSize,
  filledIconAllowlist,
  iconSize,
  navIcons,
  placeTypeIcon,
  ratingIcon,
} from './icons';
export type { IconPair, IconSizeToken, IoniconName, NavRouteName } from './icons';
