/**
 * The platform-admin console's palette and measurements.
 *
 * ## Why the console has a palette of its own
 *
 * The rest of the product follows the thesis in `color.ts`: a beige accent
 * fill, ink text, a cool near-white page. On 2026-10-18 the user approved a
 * darker look for the platform-admin area and for the sign-in pages every
 * console user passes through: a **cream canvas, a dark-brown sidebar and a
 * brown primary button**. The values here are the approved artboards'
 * (`docs/design/console/source/_shell.css`, the `.y` block) and nothing else.
 *
 * The thesis still holds inside it. Chroma means state or the one action:
 * the brown is the primary button and the current nav item, amber is "not
 * ready yet", red is only ever a real failure (a dead letter, a server error,
 * a destructive button), green is "done", and everything else is ink, muted
 * brown or a hairline.
 *
 * ## How the web app reads it
 *
 * `css.ts` writes every entry below as a custom property — `consoleColor.brand`
 * becomes `--console-brand`, `consoleSize.sidebar` becomes
 * `--console-size-sidebar` — and the console's stylesheet reads only those.
 * No component names a hex value; `contrast` tests in `console.test.ts` hold
 * every text pair to AA.
 */
export const consoleColor = {
  // --- Ground ---------------------------------------------------------------
  /** The page: warm cream, so a white card reads as lifted off it. */
  canvas: '#F7F1E8',
  /** Cards, dialogs, inputs. */
  surface: '#FFFFFF',
  /** Table heads and quiet inset boxes ("who this link is for"). */
  surfaceMuted: '#FCF9F5',
  /** A hovered row or a secondary button under the pointer. */
  hover: '#FBF6EF',

  // --- Ink ------------------------------------------------------------------
  /** Text. 14.92:1 on the canvas. */
  ink: '#2A1A10',
  /** Secondary text: captions, hints, table heads. 5.84:1 on the canvas. */
  muted: '#6B5A4F',

  // --- The one action ---------------------------------------------------------
  /** The primary button's fill, links, the current sub-tab. */
  brand: '#3A1D0C',
  brandHover: '#4E2815',
  /** A primary button while its request is in flight. */
  brandBusy: '#5A3420',
  /** The unlit part of the spinner on a brand fill: cream at 35%, over a brand fill only. */
  spinTrack: 'rgba(255, 243, 228, 0.35)',
  /** The label on every brand fill. 14.10:1 on `brand`. */
  brandForeground: '#FFF3E4',
  /** The brand's tint: a selected chip, a ghost button under the pointer, an icon tile. */
  brandTint: '#F4ECE2',
  /** A link under the pointer. */
  linkHover: '#5A2E14',
  /** The keyboard focus outline on light grounds. */
  focus: '#3A1D0C',

  // --- Lines ------------------------------------------------------------------
  line: '#E8DDD0',
  /** The divider inside a card. */
  lineSoft: '#F1E9DF',
  /** An input's or secondary button's edge. */
  control: '#D8C8B6',
  controlHover: '#C8B39C',

  // --- Sidebar ----------------------------------------------------------------
  sidebar: '#2B1608',
  /** The current nav item's fill. */
  sidebarActive: '#4A2817',
  /** Nav links at rest. 10.29:1 on the sidebar. */
  sidebarText: '#D9C5B0',
  /** The brand word, the current item and the signed-in name. */
  sidebarTextStrong: '#FFF3E4',
  /** The role line under the name. 7.55:1. */
  sidebarMuted: '#BFA88F',
  /** A nav link under the pointer: cream at 7%, over the sidebar only. */
  sidebarHover: 'rgba(255, 243, 228, 0.07)',
  /** The signed-in card at the foot: cream at 5%, over the sidebar only. */
  sidebarRaised: 'rgba(255, 243, 228, 0.05)',
  /** The focus outline on the sidebar's dark ground. */
  sidebarFocus: '#F3D9B8',
  /** Initials in a circle. The brand beige, with the sidebar's brown on it. */
  avatar: '#C3B59F',
  avatarForeground: '#2B1608',

  // --- State --------------------------------------------------------------------
  /** Not ready yet, needs attention. Never red. */
  amber: '#8A4B08',
  amberBg: '#FDF1DE',
  amberLine: '#F1D3A6',
  /** Real failures and destructive buttons only. */
  red: '#A8261B',
  redBg: '#FCEAE7',
  redLine: '#F2C9C2',
  redHover: '#8C1F16',
  redForeground: '#FFFFFF',
  /** Done, active, saved. */
  green: '#0F6A4B',
  greenBg: '#E4F2EA',
  greenLine: '#BFDECD',
  /** Suspended, off. */
  grey: '#57534E',
  greyBg: '#EEE8E1',
  greyLine: '#DDD3C8',
  /** The password meter's third step, between amber and green. */
  meterFair: '#6E8B3D',

  // --- Toast ------------------------------------------------------------------
  toast: '#2A1A10',
  toastForeground: '#FFF3E4',
  /** The tick in front of the sentence. */
  toastIcon: '#9FD9BD',
  /** "Undo": the one thing to press on a toast. */
  toastAction: '#F3D9B8',
  /** The undo button's own fill: cream at 10%, over the toast only. */
  toastActionFill: 'rgba(255, 243, 228, 0.1)',

  // --- Overlays and the sign-in photo -------------------------------------------
  /** Behind a dialog. Ink at 45%. */
  scrim: 'rgba(42, 26, 16, 0.45)',
  /** What the photo panel shows before the photo loads, and what its text is checked on. */
  photoGround: '#140904',
  /** Laid over the photo so the claim reads on any part of it. */
  photoShade: 'rgba(20, 9, 4, 0.38)',
  photoText: '#FFF3E4',
  photoTextMuted: '#EAD9C5',
} as const;

export type ConsoleColorToken = keyof typeof consoleColor;

/** Pixel measurements. Every control height and the sidebar's width. */
export const consoleSize = {
  sidebar: 232,
  /** Buttons and inputs inside the console. */
  button: 40,
  buttonSmall: 32,
  /** Inputs and buttons on the sign-in and password pages. */
  buttonTall: 44,
  /** Status pills. */
  pill: 24,
  /** A nav link's height. */
  navItem: 44,
  avatar: 32,
  icon: 18,
  /** The main column's padding: 32 top, 40 sides on a desktop. */
  mainPadY: 32,
  mainPadX: 40,
  /** And on a phone. */
  narrowPadY: 24,
  narrowPadX: 16,
  /** Widths of the cards on the sign-in pages and of dialogs. */
  authCard: 400,
  authCardWide: 420,
  dialog: 460,
  dialogWide: 560,
  errorCard: 520,
} as const;

export const consoleRadius = {
  /** Cards and banners. */
  card: 12,
  /** Inputs and buttons. */
  control: 10,
  /** Small buttons, the eye toggle, menus. */
  small: 8,
  dialog: 14,
  /** The sign-in card. */
  authCard: 16,
  /** The error page's icon tile. */
  tile: 20,
  pill: 999,
} as const;

/**
 * Type sizes in px. The minimum is 12: nothing in the console is smaller.
 *
 * Titles are set in the serif (`--font-family-display`, Noto Serif Armenian
 * merged with Noto Serif), everything else in the sans.
 */
export const consoleText = {
  title: 28,
  section: 17,
  body: 14,
  /** Field labels, captions, small buttons. */
  label: 13,
  caption: 12,
  /** Sidebar links and the text inside the sign-in pages' tall inputs. */
  nav: 15,
  /** "Yalla" at the top of the sidebar. */
  brand: 28,
  /** "Yalla" on the sign-in photo, and on a phone. */
  authBrand: 32,
  authBrandNarrow: 26,
  /** The sentence on the sign-in photo, and on a phone. */
  claim: 24,
  claimNarrow: 19,
} as const;

export const consoleShadow = {
  dialog: '0 24px 60px rgba(42, 26, 16, 0.3)',
  toast: '0 10px 30px rgba(42, 26, 16, 0.25)',
  /** Under the sign-in claim, so it reads over the brightest part of the photo. */
  photoText: '0 1px 12px rgba(0, 0, 0, 0.5)',
} as const;
