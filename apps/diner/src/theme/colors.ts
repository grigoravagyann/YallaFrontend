/**
 * The diner app's palette. Dark only: a warm espresso night.
 *
 * The ground is a deep roasted brown with a soft glow at the top of every
 * screen (`Screen` draws it). Two browns do the talking: `brand`, the dark
 * coffee every button, selected chip and active tab is filled with, and
 * `primary`, a warm cream-amber used where the brand speaks as a line of text
 * or a glyph — a link, a price, a spinner, the active label. Chroma beyond that
 * carries meaning and nothing else: green is open / free / confirmed, orange is
 * reserved / preparing, red is occupied / failed, blue is "new" and the user's
 * own location. Screens import from here, never from the shared token package,
 * so the design is described once.
 *
 * ## Fills, inks and strong fills
 *
 * The four state hues are bright fills — a table marker, a dot, a border.
 * Each has an `*Ink` partner, light enough that a sentence set in it clears
 * 4.5:1 on `surface`, `background`, `surfaceMuted` and its own `*Soft` tint,
 * and a `*Strong` fill: a deeper shade that carries the pale `on*Strong` label
 * of a solid badge. `contrast.test.ts` holds every one of those numbers.
 */
export const colors = {
  /** The ground under every screen; the top glow fades into it. */
  background: '#170A05',
  /** The warm glow at the top of a screen, faded into `background` by `Screen`. */
  backgroundGlow: '#3A1D0E',
  /** Midpoint of that glow. */
  backgroundMid: '#1E0E07',
  /** Cards, rows, inputs: warm glass over the ground, drawn opaque. */
  surface: '#2A180F',
  /** A step lighter than `surface` — chips at rest, pressed rows, notices. */
  surfaceMuted: '#34200F',
  /** Bottom sheets and dialogs. */
  sheet: '#24110A',
  /** The floating tab bar. */
  navBar: '#2D1307',
  /** Dark translucent scrim over photos (gradient end, table info bar, sheet backdrop). */
  overlayDark: 'rgba(10,4,2,0.70)',
  /** Same hue as `overlayDark` at zero alpha, so a gradient from it never greys. */
  overlayClear: 'rgba(10,4,2,0)',
  /** The light band a loading skeleton sweeps across its block, at its brightest. */
  shimmerPeak: 'rgba(255,214,170,0.12)',
  /** Same cream at zero alpha — the band's edges, so the sweep never greys. */
  shimmerClear: 'rgba(255,214,170,0)',
  /**
   * Translucent circle behind an icon sitting on a photo (heart, back, share).
   * 45% black, so a white glyph on it still clears 3:1 over a white photo.
   */
  glass: 'rgba(0,0,0,0.45)',
  /** The dark information bar that slides over a photo's bottom edge. */
  surfaceDark: '#120804',

  /** The fill of the one thing to press: buttons, selected chips, the active tab, the Scan FAB. */
  brand: '#3A1D0C',
  brandPressed: '#2C1508',
  /** The faint lit edge round a brand fill, so it holds its shape on the glow at the top of a screen. */
  brandEdge: '#5A3420',
  /** The Scan FAB's lit top and shaded bottom. */
  fabTop: '#5A2C14',
  fabBottom: '#3A1A0B',
  /** A brand fill's warm outline glow (shadow colour), so a dark button lifts off the ground. */
  brandGlow: '#8C4B28',
  /** The brand as text or a glyph: links, prices, spinners, active labels and indicators. */
  primary: '#F0B878',
  /** Pressed state of a `primary` line (outline button, text link). */
  primaryPressed: '#D9A064',
  /** Label and glyph on a `brand` fill. */
  onPrimary: '#FFF3E4',
  /** A faint brand tint — pressed rows, the chosen option's fill. */
  primarySoft: '#3D2414',

  /** Neutral warm fill — avatars and soft fills. */
  secondary: '#4A2E1C',
  border: '#3D2718',
  borderStrong: '#5C3E29',

  text: '#F6E8D8',
  /** Secondary text. Clears 4.5:1 on every ground and sheet. */
  textMuted: '#D9C0A6',
  /**
   * Placeholders and decoration only — an input's placeholder, a chevron, the
   * fallback glyph in an empty photo. Never a sentence somebody has to read.
   * Text that carries meaning is `textMuted`.
   */
  textSubtle: '#9A826D',
  onImage: '#FFFFFF',
  /** White at less than full strength — the ring round a table marker, a caption on a photo. */
  onImageMuted: 'rgba(255,255,255,0.85)',
  /**
   * A QR code is drawn dark on white whatever the theme: plenty of Android
   * scanners refuse light modules on a dark field.
   */
  qrBackground: '#FFFFFF',
  qrForeground: '#000000',
  /** The number inside a bright table marker: dark on every state fill. */
  onFill: '#1E0E07',

  /** Open · Free · Confirmed · Ready — the fill. */
  success: '#2FA352',
  successSoft: '#163220',
  /** Success as text and as a glyph. */
  successInk: '#8FE0A3',
  /** The solid badge fill behind `onSuccessStrong`. */
  successStrong: '#2F7A3A',
  onSuccessStrong: '#F1FFF2',
  /** Reserved · Preparing · In progress — the fill. */
  warning: '#F09A2E',
  warningSoft: '#3E2410',
  /** Warning as text, and as a glyph — the rating star. */
  warningInk: '#F7BE6E',
  warningStrong: '#8A4A26',
  onWarningStrong: '#FFF0E2',
  /** Occupied · errors · the notifications count — the fill. */
  error: '#E5484D',
  errorSoft: '#3D1614',
  /** Error as text, and as a glyph. */
  errorInk: '#FF9C9A',
  errorStrong: '#B3282D',
  onErrorStrong: '#FFFFFF',
  /** The user's location dot — the fill. */
  info: '#4C8DFF',
  infoSoft: '#15233F',
  /** Info as text. */
  infoInk: '#A8C6FF',
  infoStrong: '#2C5BC4',
  onInfoStrong: '#FFFFFF',
  /** Closed · Completed — a muted label on the ground. */
  neutralBadge: '#B3A698',
  neutralSoft: '#33281F',
  neutralStrong: '#5E5148',
  onNeutralStrong: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Every colour a sentence may be set in, on `surface`, `background`,
 * `surfaceMuted` and `sheet`.
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
  neutralBadge: colors.neutralBadge,
} as const;

/**
 * Glyphs that carry meaning on their own — the rating star, a status icon, an
 * action with no label. They owe 3:1 on the same grounds.
 */
export const glyphColors = {
  ...textColors,
  ratingStar: colors.warningInk,
} as const;

/** Table markers on the photo and in the legend. Colour is never the only cue. */
export const tableStatusColor = {
  free: colors.success,
  reserved: colors.warning,
  occupied: colors.error,
  outOfService: colors.neutralStrong,
} as const;

/** Content badges on hero cards and in the details hero. */
export const contentBadgeColor = {
  popular: colors.brand,
  new: colors.infoStrong,
} as const;
