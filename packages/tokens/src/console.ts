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
  /**
   * An input's or a select's edge. 3.70:1 on white, 3.29:1 on the canvas.
   *
   * Darker than the artboards' #D8C8B6 (1.63:1 on white), on purpose: on an
   * empty field the edge is the only thing that says "type here", so it is
   * held to WCAG 1.4.11's 3:1 (2026-10-18). Same warm hue, more weight.
   */
  control: '#988169',
  /** The same edge under the pointer: darker still, never fainter. 4.70:1 on white. */
  controlHover: '#85705B',
  /**
   * A secondary button's edge: the artboards' soft line. A button's label
   * already says what it is, so its edge is decoration and keeps the lighter
   * approved weight; only inputs needed the 3:1 edge.
   */
  buttonEdge: '#D8C8B6',
  buttonEdgeHover: '#C8B39C',

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
  /**
   * The venue console's sidebar (docs/design/venue-console, the `.side` block):
   * a group heading over its links ("Today", "The venue"…). 5.68:1.
   */
  sidebarGroup: '#A8907A',
  /** The venue and branch panel under the brand: cream at 6%, over the sidebar only. */
  sidebarPanel: 'rgba(255, 243, 228, 0.06)',
  /** The branch switcher's fill, and the one-branch line in its place. */
  sidebarField: '#351B0D',
  /** Its text. 13.01:1 on the field. */
  sidebarFieldText: '#F3E6D6',
  /**
   * The switcher's edge. 3.30:1 on the sidebar, 3.06:1 on its own fill.
   *
   * Lighter than the artboards' #4E2D1B (1.40:1), on purpose and for the
   * reason `control` is darker than theirs: on a control the edge is what says
   * "this opens", so it is held to WCAG 1.4.11's 3:1. Same hue, more light.
   */
  sidebarFieldEdge: '#86664F',
  /** A count on a nav link: pending approvals, incomplete dishes, reported reviews. */
  navBadge: '#E2B77A',
  /** Its number. 9.25:1 on the badge. */
  navBadgeForeground: '#2B1608',

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
  /** Booked and confirmed, still to come: a booking's state, not a warning (Main artboard). */
  blue: '#1D4E89',
  blueBg: '#E6EEF8',
  /** The password meter's third step, between amber and green. */
  meterFair: '#6E8B3D',
  /** A finished step in a dialog's step list: a warm bar beside the step's name. */
  stepDone: '#B07A45',
  /** A loading placeholder's block, pulsing on the white card. */
  skeleton: '#EFE6DB',
  /** A bar for what came to nothing (cancelled bookings): there, but quiet. */
  barMuted: '#A8A29E',

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

  // --- A branch's pages (BranchPublic, BranchRooms, Reviews artboards) ---------
  /** The phone drawn around the app card's preview. */
  phoneFrame: '#1E0F06',
  /** The diner app's card, in the app's own dark brown. */
  appCard: '#2B1608',
  appCardText: '#FFF3E4',
  /** Its meta lines and description. */
  appCardMuted: '#D9C5B0',
  /** An amenity on the card: cream at 10%, over the card only. */
  appCardChip: 'rgba(255, 243, 228, 0.1)',
  appCardChipText: '#EAD9C5',
  /** The booking button when bookings are off. */
  appCardOff: 'rgba(255, 243, 228, 0.12)',
  appCardOffText: '#BFA88F',
  appCardButton: '#FFF3E4',
  appCardButtonText: '#3A1D0C',
  /** The rooms page's sticky save bar: ink, like the toast. */
  savebar: '#2A1A10',
  savebarText: '#FFF3E4',
  /** Its outline button's edge and hover, cream over the ink. */
  savebarEdge: 'rgba(255, 243, 228, 0.3)',
  savebarHover: 'rgba(255, 243, 228, 0.08)',
  savebarFocus: '#F3D9B8',
  /** A review's stars, lit and not. */
  star: '#B07A45',
  starOff: '#E2D5C6',
  /** A reported review's edge, beside its amber stripe. */
  reportedEdge: '#EBC48C',
  /** A hidden review's card. */
  reviewHidden: '#FBF8F4',

  // --- Home and Settings (Main and Settings artboards) ------------------------
  /** A day's bar in Home's bookings chart; hovered, it takes the brand. */
  chartBar: '#5A3420',
  /** Today's bar is the tan `stepDone`; hovered, this darker tan. */
  chartBarTodayHover: '#94622F',
  /** A line in the outbox alert's details: white at 70% over the red tint. */
  alertItem: 'rgba(255, 255, 255, 0.7)',
  /** A card that opens something, hovered: a darker edge than its line. */
  cardHoverEdge: '#D4BFA8',
  /** A field that shows a value nobody can change here (the admin's email). */
  readonlyField: '#FAF6F0',

  // --- The venue Overview (venue-console Main artboard) -------------------------
  /** An hour still to come in the load chart; the hour now is `brand`, those gone `line`. */
  loadBar: '#D9C3AA',
  /** The load chart's dashed "the room is full" line. */
  capacityLine: '#D2BFA8',

  // --- Reports (venue-console Reports artboard) ----------------------------------
  /**
   * A bar of shares (revenue by hour, lead time, turn time); a peak is
   * `brand`, past the policy `amber`. 3.58:1 on white, 3.41:1 on
   * `surfaceMuted`: darker than the artboards' #B89B7E (2.62:1), on purpose —
   * a bar is the chart's whole message, so it is held to WCAG 1.4.11's 3:1.
   */
  reportBar: '#A08262',
  /**
   * The previous period's line behind this one, dashed. 3.52:1 on white; the
   * artboards' #B8A28A was 2.45:1, so it is darker for the same reason.
   */
  reportPreviousLine: '#9A8570',
  /** The fill under this period's revenue line: the brand at 7%, over a white card only. */
  reportArea: 'rgba(58, 29, 12, 0.07)',

  // --- The floor tablet (docs/design/floor-tablet) ------------------------------
  /*
   * The tablet wears this palette — its top bar is the `sidebar` brown — with
   * the values below on top: the table states' tints and inks, and the top
   * bar's chips. The state edges are the product's state hues (`color.ts`).
   */
  /** The top bar's running text. 12.45:1 on the bar. */
  floorBarText: '#E9D9C6',
  /** The Floor / Kitchen tray: cream at 8%, over the bar only. */
  floorBarTabs: 'rgba(255, 243, 228, 0.08)',
  /** A chip's edge at rest: cream at 30%, over the bar only. */
  floorBarChipEdge: 'rgba(255, 243, 228, 0.3)',
  /** The signed-in person's pill: cream at 10%, over the bar only. */
  floorBarWho: 'rgba(255, 243, 228, 0.1)',
  /** Connected: the chip's dot and edge. 8.20:1 on the bar. */
  floorLive: '#5BC78F',
  /** Offline, actions kept on the tablet: amber, never red. 9.25:1. */
  floorOffline: '#E2B77A',
  /** Its words. 12.64:1. */
  floorOfflineText: '#F3D9B8',
  /** Polls failing, or a conflict to decide: the one red on the bar. 7.09:1. */
  floorFailure: '#F08A80',
  /** Its words. 12.93:1. */
  floorFailureText: '#FFD6D1',
  /** A free table's card. */
  floorFree: '#E6F5EC',
  floorFreeEdge: '#35B37E',
  /** "Free" on its card. 5.14:1. */
  floorFreeInk: '#1E7350',
  /** Booked soon: a tint with a faint diagonal stripe of its own hue. */
  floorBooked: '#FBF0DA',
  floorBookedEdge: '#C98A0E',
  floorBookedStripe: 'rgba(201, 138, 14, 0.12)',
  /** "Reserved 19:00". 5.04:1. */
  floorBookedInk: '#8A5E08',
  /** Held for a late party; the edge is dashed. */
  floorHeld: '#E6EEFA',
  floorHeldEdge: '#3B6FD4',
  /** "Held · running late". 6.13:1. */
  floorHeldInk: '#2A54A8',
  /** Occupied; its words are `red`, 5.68:1 on this. */
  floorOccupied: '#F7E1E0',
  floorOccupiedEdge: '#B93B3B',
  /** Out of service: grey, cross-hatched, the words in ink. */
  floorOut: '#ECEEF0',
  floorOutEdge: '#8B95A1',
  floorOutStripe: 'rgba(139, 149, 161, 0.25)',
  /** A rail item whose clock is nearly out. */
  floorUrgent: '#FFF6F4',

  // --- The public page (docs/design/public-page) ----------------------------------
  /*
   * The diner-facing page at yalla.am/{venue}/{branch} wears this palette with
   * its own top bar (the `sidebar` brown, the wordmark `sidebarTextStrong`, the
   * language buttons `floorBarText` on the `floorBarTabs` tray, the current one
   * `brandForeground` with `brand` on it, focus `sidebarFocus`) and the values
   * below on top.
   */
  /** A loading placeholder's block on the cream page (States artboard). */
  publicSkeleton: '#EADFD2',
  /** The icon in a page state's circle, on `lineSoft`. 3.56:1, a graphic. */
  publicStateIcon: '#8C7666',
  /** Behind a cover or room photo until it loads, and when there is none. */
  publicPhotoGround: '#3A2A1E',
  /** The dot before "Open until …". 3.41:1 on white; the words carry the state. */
  publicOpenDot: '#2E9E5B',
  /** The dot before "Closed · opens …": quiet on purpose, the words carry it. */
  publicClosedDot: '#A39383',
} as const;

export type ConsoleColorToken = keyof typeof consoleColor;

/** Pixel measurements. Every control height and the sidebar's width. */
export const consoleSize = {
  sidebar: 232,
  /**
   * The venue console's sidebar: wider, for the venue panel and the branch
   * switcher above four groups of links (docs/design/venue-console).
   */
  sidebarGrouped: 248,
  /** Buttons and inputs inside the console. */
  button: 40,
  buttonSmall: 32,
  /** Inputs and buttons on the sign-in and password pages. */
  buttonTall: 44,
  /** Status pills. */
  pill: 24,
  /** A nav link's height. */
  navItem: 44,
  /** In the grouped sidebar, where ten links and four headings share the height. */
  navItemGrouped: 40,
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
  /**
   * The floor tablet: its top bar, the "Now" rail and a table card's row. The
   * tablet's controls take the staff sizes (`--touch-*`), not the console's.
   */
  floorBar: 72,
  floorRail: 380,
  floorTableRow: 124,
  /** The person's initials in the top bar. */
  floorAvatar: 36,
  /** The table panel, in the rail's place: wide enough for the held actions on one line each. */
  floorPanel: 560,
  /** The PIN gate's card, its people column, and one key of its pad. */
  floorPinCard: 980,
  floorPinCardHeight: 640,
  floorPinSide: 420,
  floorPinKey: 96,
  floorPinKeyHeight: 76,
  /** Order entry's three columns: categories, the dishes between, and the draft. */
  floorOrderCats: 184,
  floorOrderDraft: 420,
  /** A dish tile's row, and its photo. */
  floorDishRow: 112,
  floorDishPhoto: 72,
  /** The tab's money column, and the cash screen's keypad column. */
  floorTabSide: 460,
  floorCashSide: 520,
  /** The confirmation card after a send or a payment. */
  floorDoneCard: 520,
  /** A face in the tab's people pills, a dish's count badge, and a bill request's radio. */
  floorFace: 30,
  floorRadio: 22,
  /** A kitchen ticket: four across a 1280px tablet, the rest a swipe away. */
  floorTicket: 296,
  /** The conflicts screen's sync-queue column. */
  floorConflictSide: 400,
  /** The table's mark on a conflict card. */
  floorConflictMark: 52,
  /**
   * The public page (docs/design/public-page): its top bar, the page's widest
   * column, the booking column beside it from 960px, a page state's icon
   * circle, and its buttons and form controls — 48px, past the 44px target,
   * 52px on a page state's one action.
   */
  publicBar: 60,
  publicWrap: 1180,
  publicAside: 400,
  /** A single-column page (the branch chooser, the manage link) on a desktop. */
  publicNarrow: 600,
  publicStateIcon: 80,
  publicButton: 48,
  publicButtonTall: 52,
  publicControl: 48,
  /** A language button's least width in the top bar. */
  publicLang: 48,
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
  /** A table card on the floor tablet. */
  floorTable: 14,
  /** A floor tablet button, and the Floor / Kitchen tray. */
  floorButton: 12,
  /** A tab inside that tray. */
  floorTab: 9,
  /** The public page's cards (the booking card, the open-state card's 16). */
  publicCard: 20,
  publicStatus: 16,
  /** Its inputs and selects. */
  publicControl: 12,
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
  /** And at the top of the grouped sidebar, beside its small "console". */
  brandGrouped: 22,
  /** "Yalla" on the sign-in photo, and on a phone. */
  authBrand: 32,
  authBrandNarrow: 26,
  /** The sentence on the sign-in photo, and on a phone. */
  claim: 24,
  claimNarrow: 19,
  /** A number on a venue page card. */
  kpi: 26,
  /** A waiting booking's start on Overview: the first thing read on its row. */
  bookingTime: 20,
  /*
   * The public page, read at arm's length on a phone: body 16, never under 12.
   * Titles in the serif — the venue's name at 30 (40 from 960px), a section at
   * 22, a page state at 26 — and "Yalla" in the top bar at 22.
   */
  publicTitle: 30,
  publicTitleWide: 40,
  publicSection: 22,
  publicStateTitle: 26,
  publicBrand: 22,
  publicBody: 16,
  /** Type · cuisine, the free-table line, a card's sub-line. */
  publicMeta: 15,
  /** A field's label and the language buttons. */
  publicLabel: 14,
  /** Inputs and selects: 16, or iOS zooms the page on focus. */
  publicInput: 16,
} as const;

export const consoleShadow = {
  dialog: '0 24px 60px rgba(42, 26, 16, 0.3)',
  toast: '0 10px 30px rgba(42, 26, 16, 0.25)',
  /** A row's ⋮ menu, over the table. */
  menu: '0 12px 32px rgba(42, 26, 16, 0.14)',
  /** Under the sign-in claim, so it reads over the brightest part of the photo. */
  photoText: '0 1px 12px rgba(0, 0, 0, 0.5)',
  /** Under the phone drawn around the app card's preview. */
  phone: '0 16px 40px rgba(42, 26, 16, 0.18)',
  /** Under a Home card that opens something, hovered. */
  cardHover: '0 2px 10px rgba(58, 29, 12, 0.06)',
} as const;
