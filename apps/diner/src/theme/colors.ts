/**
 * The diner app's palette. Light only: SHURJ, a white page.
 *
 * Every screen is white (`Screen` draws a flat fill, no glow); only the
 * Explore header sits on a warm ivory (`exploreGround`). Cards, rows, inputs
 * and sheets are white too, edged by the 1px `border` hairline — there are no
 * grey fills. The brand is a muted dark burgundy that speaks three ways:
 * `brand`, the fill of every primary button, selected chip and sliding
 * selection pill; `primary`, the same burgundy where the brand is a line of
 * text or a glyph — a link, a price, a spinner, the active label; and
 * `accent`, the icon that marks where you are — the active nav glyph, the
 * Scan QR, an unread dot. Chroma beyond that carries meaning and nothing else:
 * green is open / free / confirmed, orange is reserved, red is occupied /
 * failed, blue is "new" and the user's own location. Photos keep their dark
 * scrims, and text on a photo stays cream. Screens import from here, never
 * from the shared token package, so the design is described once.
 *
 * ## Fills, inks and strong fills
 *
 * The four state hues are bright fills — a table marker, a dot, a border.
 * Each has an `*Ink` partner, dark enough that a sentence set in it clears
 * 4.5:1 on `surface`, `background`, `surfaceMuted` and its own `*Soft` tint,
 * and a `*Strong` fill: a deeper shade that carries the pale `on*Strong` label
 * of a solid badge. `contrast.test.ts` holds every one of those numbers.
 */
export const colors = {
  /** The ground under every screen: flat white. */
  background: '#FFFFFF',
  /** The warm ivory behind the Explore header, and only there. */
  exploreGround: '#F7F6F1',
  /** Cards, rows, inputs: white, edged by the `border` hairline. */
  surface: '#FFFFFF',
  /**
   * Chips at rest, notices, steppers: white with the same hairline as
   * `surface`. Kept as its own name so the screens that use it stay legible;
   * there are no grey fills.
   */
  surfaceMuted: '#FFFFFF',
  /** A loading skeleton's block; the shimmer band sweeps across it. */
  skeleton: '#EEE8E1',
  /** Bottom sheets and dialogs. */
  sheet: '#FFFFFF',
  /** A switch's thumb, on the brand track or the `borderStrong` one. */
  toggleThumb: '#FFFFFF',
  /**
   * The floating tab bar and the Scan circle rising out of it: see-through
   * white glass, the content scrolling under it visible (the user's choice,
   * 2026-10-22). There is no blur in the app, so this alpha alone sets how much
   * shows through.
   */
  navBar: 'rgba(255,255,255,0.72)',
  /**
   * An idle tab's label: a step warmer and darker than `textMuted`, so 11.5 px
   * on the bar still reads at arm's length, over any photo scrolling under it.
   * The idle glyph is the text colour itself.
   */
  navLabel: '#5E5750',
  /** The 1px edge round the nav bar and the Scan circle. */
  navBorder: 'rgba(45,41,39,0.10)',
  /** The halo behind an empty state's glyph: a burgundy blush fading into the white. */
  glowPeak: 'rgba(110,31,44,0.16)',
  glowMid: 'rgba(241,228,228,0.7)',
  glowClear: 'rgba(255,255,255,0)',
  /** The ground at zero alpha: where a photo or a list fades into the page, so it never greys. */
  backgroundClear: 'rgba(255,255,255,0)',
  /** The dimmed page behind a bottom sheet or dialog: the photo scrim's warm dark, a little lighter. */
  scrim: 'rgba(10,4,2,0.62)',
  /** Dark translucent scrim over photos (gradient end, table info bar, the camera's frame). */
  overlayDark: 'rgba(10,4,2,0.70)',
  /** Same hue as `overlayDark` at zero alpha, so a gradient from it never greys. */
  overlayClear: 'rgba(10,4,2,0)',
  /** The light band a loading skeleton sweeps across its block, at its brightest. */
  shimmerPeak: 'rgba(255,255,255,0.85)',
  /** Same white at zero alpha — the band's edges, so the sweep never greys. */
  shimmerClear: 'rgba(255,255,255,0)',
  /**
   * Translucent circle behind an icon sitting on a photo (heart, back, share).
   * A warm near-black at 48%, so a cream glyph on it still clears 3:1 over a
   * white photo.
   */
  glass: 'rgba(24,16,12,0.48)',
  /** The edge round a glass circle on a photo: a whisper of white, so it holds on a dark one. */
  glassEdge: 'rgba(255,255,255,0.22)',
  /**
   * The scrim under a photo card's caption: clear for the top third, then
   * deepening to a warm near-black at the bottom edge, so cream text reads on
   * any photo. One hue at three strengths, so the gradient never greys.
   */
  photoScrimClear: 'rgba(20,13,9,0)',
  photoScrimMid: 'rgba(20,13,9,0.45)',
  photoScrimDeep: 'rgba(20,13,9,0.82)',
  /** A photo card under a finger: the same warm dark, faintly. */
  photoPressed: 'rgba(20,13,9,0.12)',
  /** The rating star on a photo's scrim: a warm honey that reads on the dark. */
  photoStar: '#F0B866',
  /**
   * A photo pager's resting dot, on its dark pill (`overlayDark`); the dot
   * of the photo on screen is `onImage`, and wider.
   */
  photoDotIdle: 'rgba(255,248,239,0.55)',
  /** The dark information bar that slides over a photo's bottom edge. */
  surfaceDark: '#120804',

  /** The fill of the one thing to press: buttons, selected chips, the active tab. */
  brand: '#6E1F2C',
  brandPressed: '#5A1823',
  /** The edge round a brand fill, so it holds its shape where it meets a burgundy tint. */
  brandEdge: '#5A1823',
  /** A brand fill's soft lift (shadow colour). */
  brandGlow: '#6E1F2C',
  /** The brand as text or a glyph: links, prices, spinners, active labels and indicators. */
  primary: '#6E1F2C',
  /** Pressed state of a `primary` line (outline button, text link). */
  primaryPressed: '#4E1520',
  /** Label and glyph on a `brand` fill. */
  onPrimary: '#FFF8F0',
  /**
   * A soft burgundy tint — the Preparing and Awaiting-confirmation pills,
   * pressed rows, a row that has just arrived.
   */
  primarySoft: '#F1E4E4',
  /**
   * The burgundy of an icon that marks a place: the active nav glyph,
   * the Scan QR glyph, an unread dot. A glyph, never a sentence.
   */
  accent: '#6E1F2C',

  /** The soft burgundy behind an initials avatar. */
  secondary: '#F1E4E4',
  border: '#E7E0D7',
  borderStrong: '#D9CFC3',

  text: '#2D2927',
  /** Secondary text. Clears 4.5:1 on every ground and sheet, `surfaceMuted` included. */
  textMuted: '#6E675F',
  /**
   * Placeholders and decoration only — an input's placeholder, a chevron, the
   * fallback glyph in an empty photo. Never a sentence somebody has to read.
   * Text that carries meaning is `textMuted`.
   */
  textSubtle: '#8A827A',
  /** Text and glyphs on a photo, over its dark scrim: a warm cream, not paper white. */
  onImage: '#FFF8EF',
  /** Cream at less than full strength — the ring round a table marker, a caption on a photo. */
  onImageMuted: 'rgba(255,248,239,0.88)',
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
  successSoft: '#E3F2E7',
  /** Success as text and as a glyph. */
  successInk: '#1F6B3A',
  /** The solid badge fill behind `onSuccessStrong` — the Open pill on a photo. */
  successStrong: '#2F7A4B',
  onSuccessStrong: '#F3FFF6',
  /** Reserved · Preparing · In progress — the fill. */
  warning: '#F09A2E',
  warningSoft: '#FBEBD9',
  /** Warning as text, and as a glyph. */
  warningInk: '#8A4E12',
  warningStrong: '#8A4A26',
  onWarningStrong: '#FFF0E2',
  /** Occupied · errors · the notifications count — the fill. */
  error: '#E5484D',
  errorSoft: '#FDE7E6',
  /** Error as text, and as a glyph. */
  errorInk: '#B42318',
  errorStrong: '#B3282D',
  onErrorStrong: '#FFFFFF',
  /** The user's location dot — the fill. */
  info: '#4C8DFF',
  infoSoft: '#E5EEFF',
  /** Info as text. */
  infoInk: '#2C5BC4',
  infoStrong: '#2C5BC4',
  onInfoStrong: '#FFFFFF',
  /** Closed · Completed — a muted label on the ground. */
  neutralBadge: '#6F6860',
  neutralSoft: '#EFEAE4',
  /** The solid Closed pill on a photo: a warm grey (the design's rgba(98,92,86,0.88), drawn opaque). */
  neutralStrong: '#625C56',
  onNeutralStrong: '#F7F3EE',

  /**
   * The rating star on white: a honey caramel, the darkest step of the
   * design's #C98A3C that still clears 3:1 on every ground.
   */
  ratingStar: '#B5772B',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Every colour a sentence may be set in, on `surface`, `background`,
 * `surfaceMuted` and `sheet`.
 *
 * `textSubtle` is deliberately absent, and so are the bright state fills and
 * `accent`. The contrast test walks this list: adding a colour here is a claim
 * that it clears AA.
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
 * action with no label, the active nav glyph. They owe 3:1 on the same grounds.
 */
export const glyphColors = {
  ...textColors,
  accent: colors.accent,
  ratingStar: colors.ratingStar,
} as const;

/** Table markers on the photo and in the legend. Colour is never the only cue. */
export const tableStatusColor = {
  free: colors.success,
  reserved: colors.warning,
  occupied: colors.error,
  outOfService: colors.neutralStrong,
} as const;
