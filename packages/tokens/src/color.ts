/**
 * Raw palette. Nothing outside this file should reference a hex literal.
 *
 * White grounds, green identity, and a strictly separated set of state colours.
 * Every fill that text sits on is a solid: a translucent tint composites
 * differently over white, over `paper` and over a state fill, so its contrast
 * cannot be checked once and trusted. The three translucent values at the
 * bottom of `color` are things text never sits on — a scrim, a focus glow and
 * a frosted nav — and each says why it is allowed.
 */
const palette = {
  white: '#FFFFFF',
  /** Unbleached paper with the faintest green cast. */
  paper: '#F6F9F7',

  /** Deep green-black. The product's text colour, not grey and not black. */
  ink: '#17281F',
  /**
   * Two units darker than the brief's `#5F7268`, which lands at 4.48:1 on
   * `greenTint` — a hair under AA for a label on a selected row or in an icon
   * container. Section 9 of the brief asks for the fix to be darkening rather
   * than lowering the standard; this is that fix. See `contrast.test.ts`.
   */
  inkMuted: '#5D7066',
  /**
   * The brief's `#93A39A` scores 2.3–2.6:1 everywhere it would be used. This
   * ships at ≥4.5:1 on `surface` and `paper`, the two grounds tertiary text is
   * set on — placeholders, disabled labels, captions. It is *not* legible on
   * `greenTint` (4.28:1), so tertiary text never sits on a tinted fill; the
   * test suite holds that rule.
   */
  inkSubtle: '#647569',

  /** Hairlines: dividers, input edges, table rules. */
  line: '#DCE6E0',
  /**
   * The brief's "`border` at 50%" for card edges, composited over `paper` and
   * frozen as a solid so it renders identically over white and over paper.
   */
  lineSoft: '#E9F0EC',
  /** A firmer hairline for the outer edge of nested structure. */
  lineStrong: '#B8C9BF',
  /**
   * Control boundaries — outlined buttons that are not brand-coloured.
   *
   * The brief's `border` is 1.28:1 against white: fine as a divider, which
   * WCAG treats as decoration, but a control boundary owes 3:1.
   */
  lineInteractive: '#7E8D84',

  /** Icon containers, soft section fills, the pressed state of a ghost button. */
  greenTint: '#E8F2EC',
  /** Brand green. Deep and desaturated — lightness ~33. */
  green: '#1E5B3C',
  greenPressed: '#17462E',

  // --- The protected six ---------------------------------------------------
  // The only colours in the product that carry meaning. See `tableState.ts`.
  /** Free-table green. Bright and saturated — lightness ~58. */
  stateFree: '#35B37E',
  stateReservedSoon: '#C98A0E',
  stateHeld: '#3B6FD4',
  stateOccupied: '#B93B3B',
  stateOutOfService: '#8B95A1',

  /** Ink lifted, for the pressed state of an ink button beside a floor plan. */
  inkPressed: '#2B3D33',
  /** Occupied red, darkened, for a destructive button under a finger. */
  stateOccupiedPressed: '#9E3232',
} as const;

export const color = {
  /** Cards, sheets, the floor plan canvas. */
  surface: palette.white,
  /** Page background. Carries the paper grain on diner and console surfaces. */
  paper: palette.paper,

  foreground: palette.ink,
  mutedForeground: palette.inkMuted,
  subtleForeground: palette.inkSubtle,

  border: palette.line,
  borderSoft: palette.lineSoft,
  borderStrong: palette.lineStrong,
  borderInteractive: palette.lineInteractive,

  greenTint: palette.greenTint,

  primary: palette.green,
  /** Hover on the web, pressed everywhere. One value: two surfaces have no hover. */
  primaryPressed: palette.greenPressed,
  primaryForeground: palette.white,

  /**
   * What `primary` becomes on any screen showing a floor plan.
   *
   * Brand green and free-table green are both green. They stay legible as
   * different things because brand green is deep and desaturated while free is
   * bright and saturated — but that separation collapses the moment they sit
   * side by side. A green "Reserve" button next to green free tables teaches
   * people that green means nothing in particular, and the floor plan is the
   * one place in this product where a colour has to mean exactly one thing.
   *
   * So on those screens the primary action renders in ink instead. This is a
   * token, not an override inside one component, because the rule applies to
   * every control on such a screen — buttons, chips, active states.
   */
  primaryOnFloorPlan: palette.ink,
  primaryOnFloorPlanPressed: palette.inkPressed,

  /**
   * Feedback reuses the state hues. One green, one amber, one red and one blue
   * in the entire product: a second red would be a second thing red means.
   */
  danger: palette.stateOccupied,
  warning: palette.stateReservedSoon,
  success: palette.stateFree,
  info: palette.stateHeld,
  /** The out-of-service grey. Only the floor plan draws with it. */
  outOfService: palette.stateOutOfService,

  /** Text on a `danger` fill. White clears AA there; on `success` it does not. */
  dangerForeground: palette.white,
  /** Pressed is a fill change and a scale, for destructive buttons too. */
  dangerPressed: palette.stateOccupiedPressed,

  // --- Translucent, by exception ------------------------------------------
  // None of these is a fill text sits on.

  /**
   * The veil behind a bottom sheet. Ink at 45% keeps the floor plan visibly
   * underneath, which is the point of a sheet rather than a pushed screen.
   */
  scrim: 'rgba(23, 40, 31, 0.45)',
  /**
   * The keyboard focus ring: `primary` at 30%, drawn 2px wide with a 2px
   * offset — a soft glow, not a hard outline. Never removed.
   */
  focusRing: 'rgba(30, 91, 60, 0.30)',
  /**
   * The floating web nav: `surface` at 70% over a backdrop blur. Web only; the
   * diner app uses a standard tab bar and never fakes this on a phone.
   */
  surfaceGlass: 'rgba(255, 255, 255, 0.70)',
} as const;

export type ColorToken = keyof typeof color;

/** Every ground body and secondary text is set on, for the contrast tests. */
export const textBackgrounds = [color.surface, color.paper, color.greenTint] as const;

/** The grounds tertiary text is allowed on. Never a tinted fill — see `inkSubtle`. */
export const subtleTextBackgrounds = [color.surface, color.paper] as const;
