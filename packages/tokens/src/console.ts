/**
 * The platform-admin console's palette and measurements.
 *
 * ## Why the console has a palette of its own
 *
 * The console, the venue console, the floor tablet and the public page wear
 * this palette, and since SHURJ the shared `color.ts` palette is built from it
 * too. On 2026-10-18 the user approved a dark-brown look for it; on 2026-10-22
 * the product became **SHURJ** and the same screens moved to its colours, the
 * diner app's (`apps/diner/src/theme/colors.ts`), from the four recoloured
 * canvases the user approved: a **white page, a deep cherry sidebar and bar,
 * a Black Cherry (#4B0C18) primary button with ivory on it, and the logo's own
 * burgundy (#6B1121) on every control's edge**. Blue is gone: waiting and held
 * are burgundy, a confirmed booking is green, as in the app.
 *
 * The thesis still holds inside it. Chroma means state or the one action:
 * the cherry is the primary button and the current nav item, amber is "not
 * ready yet", red is only ever a real failure (a dead letter, a server error,
 * a destructive button), green is "done", burgundy is "waiting", and
 * everything else is ink, a warm grey or a hairline. `noBlue.test.ts` fails on
 * a blue here except the Telegram button's.
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
  /** The page: white, as in the app; a card stands off it by its hairline edge. */
  canvas: '#FFFFFF',
  /** Cards, dialogs, inputs. */
  surface: '#FFFFFF',
  /** Table heads and quiet inset boxes ("who this link is for"). */
  surfaceMuted: '#FBF8F8',
  /** A hovered row or a secondary button under the pointer. */
  hover: '#F8F0F1',

  // --- Ink ------------------------------------------------------------------
  /** Text: the charcoal. 14.40:1 on the canvas. */
  ink: '#2D2927',
  /** Secondary text: captions, hints, table heads. 6.88:1 on the canvas. */
  muted: '#605954',

  // --- The one action ---------------------------------------------------------
  /** The primary button's fill, links, the current sub-tab. */
  brand: '#4B0C18',
  brandHover: '#3A0912',
  /** A primary button while its request is in flight. */
  brandBusy: '#6B1121',
  /** The unlit part of the spinner on a brand fill: cream at 35%, over a brand fill only. */
  spinTrack: 'rgba(255, 247, 234, 0.35)',
  /** The label on every brand fill. 14.47:1 on `brand`. */
  brandForeground: '#FFF7EA',
  /** The brand's tint: a selected chip, a ghost button under the pointer, an icon tile. */
  brandTint: '#F2E4E6',
  /** A link under the pointer. */
  linkHover: '#3A0912',
  /** The keyboard focus outline on light grounds. */
  focus: '#4B0C18',

  // --- Lines ------------------------------------------------------------------
  line: '#EAE4E1',
  /** The divider inside a card. */
  lineSoft: '#F4F0EE',
  /**
   * An input's or a select's edge: the logo burgundy, 12.16:1 on white.
   *
   * On an empty field the edge is the only thing that says "type here", so it
   * is held to WCAG 1.4.11's 3:1 (2026-10-18); the artboards' #D8C8B6 was
   * 1.63:1 on white.
   */
  control: '#6B1121',
  /** The same edge under the pointer: darker still, never fainter. */
  controlHover: '#4B0C18',
  /**
   * A secondary button's edge: the same logo burgundy as an input's, since
   * Time to Eat draws every control's edge in it.
   */
  buttonEdge: '#6B1121',
  buttonEdgeHover: '#4B0C18',
  /**
   * A switch's track when off: a warm grey, never the burgundy of an edge, so
   * off and on (the brand) differ in lightness as well as hue. 3.81:1 on white.
   */
  switchOff: '#8A817C',
  /**
   * The tablet code field's "XXXXX-XXXXX": a faint format hint the line under
   * it spells out, light enough never to pass for a typed code.
   */
  codePlaceholder: '#B3AAA5',

  // --- Sidebar ----------------------------------------------------------------
  sidebar: '#3A0912',
  /** The current nav item's fill. */
  sidebarActive: '#5A1220',
  /** Nav links at rest. 10.84:1 on the sidebar. */
  sidebarText: '#E3C7CC',
  /** The brand word, the current item and the signed-in name. */
  sidebarTextStrong: '#FFF7EA',
  /** The role line under the name. 9.41:1. */
  sidebarMuted: '#D9B8BE',
  /** A nav link under the pointer: cream at 7%, over the sidebar only. */
  sidebarHover: 'rgba(255, 247, 234, 0.07)',
  /** The signed-in card at the foot: cream at 5%, over the sidebar only. */
  sidebarRaised: 'rgba(255, 247, 234, 0.05)',
  /** The focus outline on the sidebar's dark ground. */
  sidebarFocus: '#F5D3D9',
  /** Initials in a circle: the brand tint, with the sidebar's cherry on it (13.86:1). */
  avatar: '#F2E4E6',
  avatarForeground: '#3A0912',
  /**
   * The venue console's sidebar (docs/design/venue-console, the `.side` block):
   * a group heading over its links ("Today", "The venue"…). 9.41:1.
   */
  sidebarGroup: '#D9B8BE',
  /** The venue and branch panel under the brand: cream at 6%, over the sidebar only. */
  sidebarPanel: 'rgba(255, 247, 234, 0.06)',
  /** The branch switcher's fill, and the one-branch line in its place. */
  sidebarField: '#4B0C18',
  /** Its text. 13.25:1 on the field. */
  sidebarFieldText: '#F5ECEC',
  /**
   * The switcher's edge. 6.06:1 on the sidebar, 5.45:1 on its own fill.
   *
   * Lighter than the artboards' #4E2D1B (1.40:1), on purpose and for the
   * reason `control` is held to 3:1: on a control the edge is what says
   * "this opens" (WCAG 1.4.11).
   */
  sidebarFieldEdge: '#B98F97',
  /** A count on a nav link: pending approvals, incomplete dishes, reported reviews. */
  navBadge: '#E2B77A',
  /** Its number. 9.19:1 on the badge. */
  navBadgeForeground: '#3A0912',

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
  /**
   * Waiting on someone: a booking awaiting the venue, a pending code. The logo
   * burgundy, never blue (this token was named `blue` before Time to Eat). 9.85:1 on
   * its tint, 12.16:1 on white.
   */
  waiting: '#6B1121',
  waitingBg: '#F2E4E6',
  /** The password meter's third step, between amber and green. */
  meterFair: '#6E8B3D',
  /** A finished step in a dialog's step list: a warm bar beside the step's name. */
  stepDone: '#8A2335',
  /** A loading placeholder's block, pulsing on the white card. */
  skeleton: '#F1ECE9',
  /** A bar for what came to nothing (cancelled bookings): there, but quiet. */
  barMuted: '#A8A29E',

  // --- Toast ------------------------------------------------------------------
  toast: '#2D2927',
  toastForeground: '#FFF7EA',
  /** The tick in front of the sentence. */
  toastIcon: '#9FD9BD',
  /** "Undo": the one thing to press on a toast. */
  toastAction: '#F5D3D9',
  /** The undo button's own fill: cream at 10%, over the toast only. */
  toastActionFill: 'rgba(255, 247, 234, 0.1)',

  // --- Overlays and the sign-in photo -------------------------------------------
  /** Behind a dialog. Ink at 45%. */
  scrim: 'rgba(45, 41, 39, 0.45)',
  /** What the photo panel shows before the photo loads, and what its text is checked on. */
  photoGround: '#1A0508',
  /** The photo's own top edge under the shade: the strip above it on a phone, so the two read as one. */
  photoTop: '#0A0203',
  /** Laid over the photo so the claim reads on any part of it. */
  photoShade: 'rgba(26, 5, 8, 0.38)',
  photoText: '#FFF7EA',
  photoTextMuted: '#F3E8E9',

  // --- A branch's pages (BranchPublic, BranchRooms, Reviews artboards) ---------
  /** The phone drawn around the app card's preview. */
  phoneFrame: '#1A0508',
  /** The diner app's card, in the app's own dark brown. */
  appCard: '#3A0912',
  appCardText: '#FFF7EA',
  /** Its meta lines and description. */
  appCardMuted: '#E3C7CC',
  /** An amenity on the card: cream at 10%, over the card only. */
  appCardChip: 'rgba(255, 247, 234, 0.1)',
  appCardChipText: '#F3E8E9',
  /** The booking button when bookings are off. */
  appCardOff: 'rgba(255, 247, 234, 0.12)',
  appCardOffText: '#D9B8BE',
  appCardButton: '#FFF7EA',
  appCardButtonText: '#4B0C18',
  /** The rooms page's sticky save bar: ink, like the toast. */
  savebar: '#2D2927',
  savebarText: '#FFF7EA',
  /** Its outline button's edge and hover, cream over the ink. */
  savebarEdge: 'rgba(255, 247, 234, 0.3)',
  savebarHover: 'rgba(255, 247, 234, 0.08)',
  savebarFocus: '#F5D3D9',
  /** A review's stars, lit and not. */
  star: '#8A2335',
  starOff: '#E7E1DE',
  /** A reported review's edge, beside its amber stripe. */
  reportedEdge: '#EBC48C',
  /** A hidden review's card. */
  reviewHidden: '#FBFAF9',

  // --- Home and Settings (Main and Settings artboards) ------------------------
  /** A day's bar in Home's bookings chart; hovered, it takes the brand. */
  chartBar: '#6B1121',
  /** Today's bar is the burgundy `stepDone`; hovered, this darker cherry. */
  chartBarTodayHover: '#5A1220',
  /** A line in the outbox alert's details: white at 70% over the red tint. */
  alertItem: 'rgba(255, 255, 255, 0.7)',
  /** A card that opens something, hovered: a darker edge than its line. */
  cardHoverEdge: '#D8CFCB',
  /** A field that shows a value nobody can change here (the admin's email). */
  readonlyField: '#FAF8F7',

  // --- The venue Overview (venue-console Main artboard) -------------------------
  /** An hour still to come in the load chart; the hour now is `brand`, those gone `line`. */
  loadBar: '#DAD0CC',
  /** The load chart's dashed "the room is full" line. */
  capacityLine: '#D8CFCB',

  // --- Reports (venue-console Reports artboard) ----------------------------------
  /**
   * A bar of shares (revenue by hour, lead time, turn time); a peak is
   * `brand`, past the policy `amber`. 4.08:1 on white, 3.87:1 on
   * `surfaceMuted`: darker than the artboards' #B89B7E (2.62:1), on purpose —
   * a bar is the chart's whole message, so it is held to WCAG 1.4.11's 3:1.
   */
  reportBar: '#A0717B',
  /**
   * The previous period's line behind this one, dashed. 3.81:1 on white; the
   * artboards' #B8A28A was 2.45:1, so it is darker for the same reason.
   */
  reportPreviousLine: '#8A817C',
  /** The fill under this period's revenue line: the brand at 7%, over a white card only. */
  reportArea: 'rgba(75, 12, 24, 0.07)',

  // --- The floor tablet (docs/design/floor-tablet) ------------------------------
  /*
   * The tablet wears this palette — its top bar is the `sidebar` brown — with
   * the values below on top: the table states' tints and inks, and the top
   * bar's chips. The state edges are the table states' hues (`color.ts`).
   */
  /** The top bar's running text. 14.28:1 on the bar. */
  floorBarText: '#F3E8E9',
  /** The Floor / Kitchen tray: cream at 8%, over the bar only. */
  floorBarTabs: 'rgba(255, 247, 234, 0.08)',
  /** A chip's edge at rest: cream at 30%, over the bar only. */
  floorBarChipEdge: 'rgba(255, 247, 234, 0.3)',
  /** The signed-in person's pill: cream at 10%, over the bar only. */
  floorBarWho: 'rgba(255, 247, 234, 0.1)',
  /** Connected: the chip's dot and edge. 8.15:1 on the bar. */
  floorLive: '#5BC78F',
  /** Offline, actions kept on the tablet: amber, never red. 9.19:1. */
  floorOffline: '#E2B77A',
  /** Its words. 12.57:1. */
  floorOfflineText: '#F3D9B8',
  /** Polls failing, or a conflict to decide: the one red on the bar. 7.05:1. */
  floorFailure: '#F08A80',
  /** Its words. 12.86:1. */
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
  floorHeld: '#FFFFFF',
  floorHeldEdge: '#4B0C18',
  /** "Held · running late". 15.39:1. */
  floorHeldInk: '#4B0C18',
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
  publicSkeleton: '#EFEAE7',
  /** The icon in a page state's circle, on `lineSoft`. 3.40:1, a graphic. */
  publicStateIcon: '#8A807B',
  /** Behind a cover or room photo until it loads, and when there is none. */
  publicPhotoGround: '#2D2927',
  /** The dot before "Open until …". 3.41:1 on white; the words carry the state. */
  publicOpenDot: '#2E9E5B',
  /** The dot before "Closed · opens …": quiet on purpose, the words carry it. */
  publicClosedDot: '#A39994',
  /**
   * Over a photo: the "All 7" tile on the last thumbnail and behind the
   * gallery dialog. Ink-brown at 62%; `photoText` reads on it over a white photo.
   */
  publicPhotoScrim: 'rgba(26, 5, 8, 0.62)',
  /** The cover's "2 / 7" chip: the same ink, a little denser for its small type. */
  publicPhotoCount: 'rgba(26, 5, 8, 0.72)',
  /** A review's lit stars and the rating's star (Main artboard). 5.70:1 on white. */
  publicStar: '#8A5E08',
  /**
   * The Book sheet's first way to prove a phone: "Confirm with Telegram"
   * (Book artboard). Telegram's own blue, a shade deeper so the white words on
   * it pass for body text; the hover deeper again.
   */
  publicTelegram: '#2A6FB0',
  publicTelegramHover: '#235D94',
  publicTelegramForeground: '#FFFFFF',
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
  /** A filter chip (`.yc-chip`). */
  chip: 36,
  /** A row's ⋮ button (`.yc-kebab`). */
  kebab: 36,
  /** A step mover's arrow (`.yc-mini`). */
  mini: 28,
  /** An item in a row's ⋮ menu. */
  menuItem: 38,
  /** A nav link's height. */
  navItem: 44,
  /** In the grouped sidebar, where ten links and four headings share the height. */
  navItemGrouped: 40,
  /** The phone's top bar, below the status bar's safe area (`consoleMedia.phone`). */
  phoneBar: 56,
  /** A link in the phone's drawer. */
  drawerItem: 48,
  /** The drawer's widest: the page stays in sight beside it. */
  drawer: 320,
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
  /** A field's text: the body, and 16 on a touch screen (`consoleTouchText`). */
  input: 14,
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

/**
 * The console on a phone (2026-10-27). Two queries, each with its own job:
 *
 * - `phone` is the layout: the sidebar becomes a top bar and a drawer, and
 *   tables become cards. A media query cannot read a custom property, so the
 *   stylesheets repeat this text; `ConsoleShell` reads it here.
 * - `touch` is the sizing: a finger, on a phone or on a touch iPad with the
 *   desktop layout, gets the sizes in `consoleTouchSize` and `consoleTouchText`.
 */
export const consoleMedia = {
  phone: '(max-width: 799px)',
  touch: '(pointer: coarse), (max-width: 799px)',
} as const;

/**
 * What `consoleSize` becomes under `consoleMedia.touch`: every control at
 * least the 44px target (`touchTarget.minimum`). The generated CSS writes
 * these over the same `--console-size-*` properties, so every rule that reads
 * one grows with it and the desktop keeps its pointer sizes.
 */
export const consoleTouchSize = {
  button: 44,
  buttonSmall: 44,
  chip: 44,
  kebab: 44,
  mini: 44,
  menuItem: 44,
  navItem: 44,
  navItemGrouped: 44,
} as const satisfies Partial<Record<keyof typeof consoleSize, number>>;

/** And what `consoleText` becomes there: 16px fields, or iOS zooms the page on focus. */
export const consoleTouchText = {
  input: 16,
} as const satisfies Partial<Record<keyof typeof consoleText, number>>;

export const consoleShadow = {
  dialog: '0 24px 60px rgba(45, 41, 39, 0.3)',
  toast: '0 10px 30px rgba(45, 41, 39, 0.25)',
  /** A row's ⋮ menu, over the table. */
  menu: '0 12px 32px rgba(45, 41, 39, 0.14)',
  /** Under the sign-in claim, so it reads over the brightest part of the photo. */
  photoText: '0 1px 12px rgba(0, 0, 0, 0.5)',
  /** Under the phone drawn around the app card's preview. */
  phone: '0 16px 40px rgba(45, 41, 39, 0.18)',
  /** Under a Home card that opens something, hovered. */
  cardHover: '0 2px 10px rgba(75, 12, 24, 0.06)',
} as const;
