/**
 * The diner app's palette. Light only.
 *
 * One interaction colour — a deep espresso brown — on a neutral off-white ground. Chroma beyond that
 * carries meaning and nothing else: green is open / free / confirmed, orange is
 * reserved / preparing, red is occupied / failed, blue is "new" and the user's
 * own location. Screens import from here, never from `@yalla/tokens`, so the
 * reference design is described once.
 */
export const colors = {
  background: '#F6F6F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEEEB',
  /** Dark translucent scrim over photos (gradient end, table info bar). */
  overlayDark: 'rgba(0,0,0,0.65)',
  /** Same hue as `overlayDark` at zero alpha, so a gradient from it never greys. */
  overlayClear: 'rgba(0,0,0,0)',
  /** Translucent circle behind an icon sitting on a photo (heart, back, share). */
  glass: 'rgba(0,0,0,0.32)',
  /** The dark information bar that slides over a photo's bottom edge. */
  surfaceDark: '#24211F',

  primary: '#3B2418',
  primaryPressed: '#2A1911',
  onPrimary: '#FFFFFF',
  primarySoft: '#EFEEEB',

  /** Neutral grey — avatars and soft fills. */
  secondary: '#E4E2DE',
  border: '#E7E5E1',
  borderStrong: '#CFCBC6',

  text: '#24211F',
  textMuted: '#77736E',
  textSubtle: '#A19D98',
  onImage: '#FFFFFF',
  /** White at less than full strength — the ring round a table marker, a caption on a photo. */
  onImageMuted: 'rgba(255,255,255,0.85)',

  /** Open · Free · Confirmed · Ready */
  success: '#22A65A',
  successSoft: '#E3F3E8',
  /** Reserved · Preparing · In progress */
  warning: '#F28C1F',
  warningSoft: '#FDEBD8',
  /** Occupied · errors · the notifications count */
  error: '#E03B3B',
  errorSoft: '#FBE1E1',
  /** The "New" badge and the user's location dot */
  info: '#2F6BFF',
  infoSoft: '#E3ECFF',
  /** Closed · Completed */
  neutralBadge: '#6B6B6B',
  neutralSoft: '#ECECEC',
} as const;

export type ColorName = keyof typeof colors;

/** Table markers on the photo and in the legend. Colour is never the only cue. */
export const tableStatusColor = {
  free: colors.success,
  reserved: colors.warning,
  occupied: colors.error,
} as const;

/** Content badges on hero cards and in the details hero. */
export const contentBadgeColor = {
  popular: colors.primary,
  new: colors.info,
} as const;
