/**
 * Raw palette. Nothing outside this file should reference a hex literal.
 *
 * ## The one rule this palette exists to enforce
 *
 * **Colour means table state. Nothing else in the product is coloured.**
 *
 * Five hues carry meaning — free, reserved soon, held, occupied, out of
 * service — and they are the only chroma a person sees. Every other surface in
 * the product is ink on near-white: the primary action, the active nav item,
 * the progress fill, the big numbers. All of it is achromatic.
 *
 * That is a stronger rule than the one it replaces, and it removes a whole
 * class of bug. The previous system had a brand green *and* a free-table green,
 * kept apart by lightness, plus a `primaryOnFloorPlan` escape that quietly
 * swapped the button to ink whenever a floor plan was on screen. It worked, but
 * it meant the accent was never confident on the screens that matter most, and
 * every new screen had to remember the swap. Making ink the accent everywhere
 * deletes the exception: there is no context in which the primary action and a
 * table state can be confused, because the primary action has no hue at all.
 *
 * `primaryOnFloorPlan` survives as a token because four screens import it. It
 * now resolves to the same ink as `primary`, so those call sites keep working
 * and are correct by construction rather than by remembering a rule.
 *
 * ## Solids, not tints
 *
 * Every fill that text sits on is a solid: a translucent tint composites
 * differently over white, over `paper` and over a state fill, so its contrast
 * cannot be checked once and trusted. The three translucent values at the
 * bottom of `color` are things text never sits on — a scrim, a focus ring and a
 * frosted nav — and each says why it is allowed.
 */
const palette = {
  white: '#FFFFFF',
  /**
   * The page. Near-white with a faint cool cast, never pure white — a white
   * card has to read as lifted off the page, and it cannot do that against
   * white. The cast is blue rather than the green it used to be: with ink as
   * the accent there is no green in the chrome for it to agree with, and a cool
   * ground keeps the five state hues looking like the only colour on screen.
   */
  paper: '#F4F6FA',

  /**
   * Near-black, faintly blue. The product's text colour *and* its accent.
   *
   * 17.52:1 on white, which is far past AA and deliberately so: this is the
   * colour of a metric a manager reads across a desk and a button a waiter hits
   * at arm's length on a bright terrace.
   */
  ink: '#131A22',
  /** Secondary text. 6.39:1 on white, 5.91 on paper, 5.39 on the tint. */
  inkMuted: '#55606E',
  /**
   * Tertiary text: placeholders, captions, disabled labels.
   *
   * 5.11:1 on `surface` and 4.73:1 on `paper` — both clear AA — but 4.31:1 on
   * `inkTint`, which does not. That is deliberate and load-bearing: tertiary
   * text is never set on a tinted fill, and `contrast.test.ts` holds the rule by
   * asserting the failure. Darkening this value until it passes everywhere would
   * collapse it into `inkMuted` and leave the product with two text weights
   * pretending to be three.
   */
  inkSubtle: '#646F7C',

  /** Hairlines: dividers, input edges, table rules. */
  line: '#E2E8F0',
  /** The softest edge in the system. Cards do not use it — see `borderSoft`. */
  lineSoft: '#EEF2F7',
  /** A firmer hairline for the outer edge of nested structure. */
  lineStrong: '#C4CCD8',
  /**
   * Control boundaries — outlined buttons and inputs.
   *
   * 3.85:1 on white and 3.56:1 on paper. A divider is decoration and owes
   * nothing; a control boundary owes 3:1, and this clears it on both grounds.
   */
  lineInteractive: '#79838F',

  /**
   * The one neutral fill: icon tiles, the pressed state of a ghost button, a
   * selected row. Light enough that ink and `inkMuted` sit on it comfortably,
   * dark enough that `inkSubtle` does not — which is the rule above.
   */
  inkTint: '#E7ECF3',

  /** The accent, pressed. Still ink, just lifted. White clears 12.28:1 on it. */
  inkPressed: '#2A3644',

  // --- The protected six ---------------------------------------------------
  // The only colours in the product that carry meaning. See `tableState.ts`.
  // Carried over unchanged: they were chosen against each other and against a
  // colour-deficient reader, and nothing about moving the accent to ink argues
  // for moving them. What changed is that they no longer compete with anything.
  /** Free-table green. Bright and saturated. */
  stateFree: '#35B37E',
  stateReservedSoon: '#C98A0E',
  stateHeld: '#3B6FD4',
  stateOccupied: '#B93B3B',
  stateOutOfService: '#8B95A1',

  /** Occupied red, darkened, for a destructive button under a finger. */
  stateOccupiedPressed: '#9E3232',
} as const;

export const color = {
  /** Cards, sheets, the floor plan canvas. */
  surface: palette.white,
  /** Page background. */
  paper: palette.paper,

  foreground: palette.ink,
  mutedForeground: palette.inkMuted,
  subtleForeground: palette.inkSubtle,

  border: palette.line,
  /**
   * The card edge.
   *
   * Cards in this system are defined by elevation, not by a line — a soft
   * shadow on near-white does the separating, which is what makes a dense
   * dashboard read as calm. This token stays because a card that must sit on
   * `surface` rather than `paper` has no shadow to separate it and needs an
   * edge after all. It is the softest line available so that the exception
   * never reads as the rule.
   */
  borderSoft: palette.lineSoft,
  borderStrong: palette.lineStrong,
  borderInteractive: palette.lineInteractive,

  /**
   * Kept under its old name because nineteen screens import it and this task
   * changes one package, not screens. It is no longer green: it is the neutral
   * tint described on `inkTint`.
   */
  greenTint: palette.inkTint,

  primary: palette.ink,
  /** Hover on the web, pressed everywhere. One value: two surfaces have no hover. */
  primaryPressed: palette.inkPressed,
  primaryForeground: palette.white,

  /**
   * Retained for the four screens that import it, and now a no-op.
   *
   * It used to swap a green button to ink beside a floor plan. The accent *is*
   * ink now, so this resolves to the same value and the swap has nothing left to
   * do. Those call sites keep working and are right for a better reason than
   * before: not because they remembered a rule, but because there is no longer a
   * rule to remember.
   */
  primaryOnFloorPlan: palette.ink,
  primaryOnFloorPlanPressed: palette.inkPressed,

  /**
   * Feedback reuses the state hues. One green, one amber, one red and one blue
   * in the entire product: a second red would be a second thing red means.
   *
   * This is the only place chroma appears outside the floor plan, and it is the
   * same chroma — a success toast is the green that means a free table.
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
  scrim: 'rgba(19, 26, 34, 0.45)',
  /**
   * The keyboard focus ring: ink at 28%, drawn 2px wide with a 2px offset — a
   * soft halo, not a hard outline. Never removed.
   */
  focusRing: 'rgba(19, 26, 34, 0.28)',
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
