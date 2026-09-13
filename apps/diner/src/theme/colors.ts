/**
 * The diner app's palette. Light only.
 *
 * One interaction colour — brown — and a warm cream ground. Chroma beyond that
 * carries meaning and nothing else: green is open / free / confirmed, orange is
 * reserved / preparing, red is occupied / failed, blue is "new" and the user's
 * own location. Screens import from here, never from `@yalla/tokens`, so the
 * reference design is described once.
 */
export const colors = {
  background: '#F7F3EC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1EAE0',
  /** Dark translucent scrim over photos (gradient end, table info bar). */
  overlayDark: 'rgba(20,14,8,0.62)',
  /** Same hue as `overlayDark` at zero alpha, so a gradient from it never greys. */
  overlayClear: 'rgba(20,14,8,0)',
  /** Translucent circle behind an icon sitting on a photo (heart, back, share). */
  glass: 'rgba(20,14,8,0.38)',
  /** The dark information bar that slides over a photo's bottom edge. */
  surfaceDark: '#241911',

  primary: '#5B3A21',
  primaryPressed: '#472C18',
  onPrimary: '#FFFFFF',
  primarySoft: '#EFE6DA',

  /** Beige — avatars and soft fills. */
  secondary: '#D8C7A8',
  border: '#E6DED2',
  borderStrong: '#CFC3B3',

  text: '#2A1F17',
  textMuted: '#7C6C5E',
  textSubtle: '#A39585',
  onImage: '#FFFFFF',
  /** White at less than full strength — the ring round a table marker, a caption on a photo. */
  onImageMuted: 'rgba(255,255,255,0.85)',

  /** Open · Free · Confirmed · Ready */
  success: '#2E9E5B',
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
