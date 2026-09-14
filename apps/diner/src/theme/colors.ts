/**
 * The diner app's palette. Light only.
 *
 * One interaction colour — a deep espresso brown — on a neutral off-white ground. Chroma beyond that
 * carries meaning and nothing else: green is open / free / confirmed, orange is
 * reserved / preparing, red is occupied / failed, blue is "new" and the user's
 * own location. Screens import from here, never from the shared token package, so the
 * reference design is described once.
 *
 * ## Fills and inks
 *
 * The four state hues are bright fills — a table marker, a dot, a border. None
 * of them is a text colour: the orange reads 2.3:1 on the ground. Each has an
 * `*Ink` partner darkened until a sentence set in it clears 4.5:1 on `surface`,
 * `background`, `surfaceMuted` and its own `*Soft` tint. The success, error and
 * info inks also serve as the solid fill behind a white label, which the bright
 * fills cannot carry. `contrast.test.ts` holds every one of those numbers.
 */
export const colors = {
  background: '#F6F6F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEEEB',
  /** Dark translucent scrim over photos (gradient end, table info bar, sheet backdrop). */
  overlayDark: 'rgba(0,0,0,0.65)',
  /** Same hue as `overlayDark` at zero alpha, so a gradient from it never greys. */
  overlayClear: 'rgba(0,0,0,0)',
  /** The light band a loading skeleton sweeps across its block, at its brightest. */
  shimmerPeak: 'rgba(255,255,255,0.65)',
  /** Same white at zero alpha — the band's edges, so the sweep never greys. */
  shimmerClear: 'rgba(255,255,255,0)',
  /**
   * Translucent circle behind an icon sitting on a photo (heart, back, share).
   * 45% black, so a white glyph on it still clears 3:1 over a white photo.
   */
  glass: 'rgba(0,0,0,0.45)',
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
  /** Secondary text. 4.96:1 on `background`, 5.37 on `surface`, 4.63 on `surfaceMuted`. */
  textMuted: '#6E6A65',
  /**
   * Placeholders and decoration only — an input's placeholder, a chevron, the
   * fallback glyph in an empty photo. Never a sentence somebody has to read:
   * it is 2.5:1 on the ground. Text that carries meaning is `textMuted`.
   */
  textSubtle: '#A19D98',
  onImage: '#FFFFFF',
  /** White at less than full strength — the ring round a table marker, a caption on a photo. */
  onImageMuted: 'rgba(255,255,255,0.85)',

  /** Open · Free · Confirmed · Ready — the fill. */
  success: '#22A65A',
  successSoft: '#E3F3E8',
  /** Success as text, and the solid fill behind a white label. */
  successInk: '#157A3F',
  /** Reserved · Preparing · In progress — the fill. Carries `text`, never white. */
  warning: '#F28C1F',
  warningSoft: '#FDEBD8',
  /** Warning as text, and as a glyph — the rating star. */
  warningInk: '#9A5200',
  /** Occupied · errors · the notifications count — the fill. */
  error: '#E03B3B',
  errorSoft: '#FBE1E1',
  /** Error as text, and the solid fill behind a white label (a count, a badge). */
  errorInk: '#B42323',
  /** The user's location dot — the fill. */
  info: '#2F6BFF',
  infoSoft: '#E3ECFF',
  /** Info as text, and the solid fill behind the white "New" label. */
  infoInk: '#1F4FCC',
  /** Closed · Completed */
  neutralBadge: '#6B6B6B',
  neutralSoft: '#ECECEC',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Every colour a sentence may be set in, on `surface`, `background` or
 * `surfaceMuted`.
 *
 * `textSubtle` is deliberately absent, and so are the bright state fills. The
 * contrast test walks this list: adding a colour here is a claim that it
 * clears AA.
 */
export const textColors = {
  text: colors.text,
  textMuted: colors.textMuted,
  primary: colors.primary,
  successInk: colors.successInk,
  warningInk: colors.warningInk,
  errorInk: colors.errorInk,
  infoInk: colors.infoInk,
} as const;

/**
 * Glyphs that carry meaning on their own — the rating star, a status icon, an
 * action with no label. They owe 3:1 on the same grounds.
 */
export const glyphColors = {
  ...textColors,
  ratingStar: colors.warningInk,
  neutralBadge: colors.neutralBadge,
} as const;

/** Table markers on the photo and in the legend. Colour is never the only cue. */
export const tableStatusColor = {
  free: colors.success,
  reserved: colors.warning,
  occupied: colors.error,
} as const;

/** Content badges on hero cards and in the details hero. */
export const contentBadgeColor = {
  popular: colors.primary,
  new: colors.infoInk,
} as const;
