/**
 * Raw palette. Nothing outside this file should reference a hex literal.
 *
 * ## The one rule this palette exists to enforce
 *
 * **Chroma means one of two things: what state a table is in, or the single
 * element you are meant to act on. Nothing else in the product is coloured.**
 *
 * Five hues carry table state — free, reserved soon, held, occupied, out of
 * service. The accent carries action: a beige that fills the primary button,
 * the active nav item and a selected option, and nowhere else. Everything in
 * between — body text, headings, metrics, chart fills, borders — is neutral.
 *
 * ## Why the beige is a fill and never a line
 *
 * `#C3B59F` is light: 2.01:1 on white and 1.86:1 on `paper`. That is the
 * whole design constraint and it splits the accent into two tokens:
 *
 * - `primary` (`#C3B59F`) is only ever a **fill**, and the label on it is
 *   always ink (`#131A22`, 8.70:1). White on it is 2.01:1 and is never used.
 * - `primaryInk` (`#6B5C45`) is the same hue darkened until it works as a
 *   **line**: text, icons, outlines, focus edges. 6.48:1 on white, 5.99 on
 *   paper, 5.49 on its own tint — past 4.5 for text, so past 3 for UI too.
 *
 * ## Why it is safe next to the floor plan
 *
 * At 0.14 chroma the beige is a warm neutral, not a hue: it sits below the
 * 0.15 line `contrast.test.ts` uses to call something grey, while every
 * chromatic table state is above 0.4. A table is saturated; the button is
 * not. It is also 3 degrees from `reservedSoon` amber, so hue is not what
 * separates them — saturation is, plus shape (a pill against a rectilinear
 * table) and the ink edge every accent fill beside a plan carries. That edge
 * is what separates it from out-of-service grey: the beige fill is 1.03:1
 * from the composited grey, `primaryInk` is 3.13:1.
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
   * white. The cast is blue rather than green: a cool ground sets off the warm
   * accent and keeps the five state hues looking like the only other colour on
   * screen.
   */
  paper: '#F4F6FA',

  /**
   * Near-black, faintly blue. The product's text colour.
   *
   * 17.52:1 on white, which is far past AA and deliberately so: this is the
   * colour of a metric a manager reads across a desk. It is *not* the accent —
   * see `accent` below for what moved and why.
   */
  ink: '#131A22',
  /** Secondary text. 6.39:1 on white, 5.91 on paper, 5.39 on the tint. */
  inkMuted: '#55606E',
  /**
   * Tertiary text: placeholders, captions, disabled labels.
   *
   * 5.11:1 on `surface` and 4.73:1 on `paper` — both clear AA — but 4.31:1 on
   * `inkTint` and 4.34:1 on `accentTint`, which do not. That is deliberate and
   * load-bearing: tertiary text is never set on a tinted fill, and
   * `contrast.test.ts` holds the rule by asserting the failure. Darkening this
   * value until it passes everywhere would collapse it into `inkMuted` and
   * leave the product with two text weights pretending to be three.
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

  /**
   * The weight every chart, sparkline and progress bar is drawn in.
   *
   * **Pinned by the track, not by the page.** A bar owes 3:1 as a meaningful
   * graphic, and the tightest of the three grounds it sits on is `inkTint` —
   * the progress track drawn *behind* it. This value reads 3.60:1 on white and
   * 3.33 on paper, but only **3.03:1 on the track**, and that last number is
   * the whole constraint: one step lighter (`#7E8997`) measures 2.99 and fails.
   * This is the lightest a bar can be and still be a bar.
   *
   * Light is the goal. A chart recedes — it is read, not pressed — and the
   * first draft of this system proved the opposite by filling bars with ink,
   * which turned a progress meter into a redaction. Neutral by construction
   * (0.10 chroma), because a chart is not a table state either.
   */
  slate: '#7D8896',

  // --- The accent ----------------------------------------------------------
  /**
   * Beige, hue 37, 0.14 chroma. A fill only: ink reads 8.70:1 on it, white
   * 2.01:1, and as a line on white it would be 2.01:1 — see `accentInk`.
   */
  accent: '#C3B59F',
  /** The accent, pressed or hovered. Ink reads 6.54:1 on it. */
  accentPressed: '#AD9C80',
  /**
   * The accent darkened for everything that is a line rather than a fill:
   * text, icons, outlines, focus edges, the one current bar in a chart.
   *
   * 6.48:1 on white, 5.99 on paper, 5.49 on `accentTint`, 5.46 on `inkTint`.
   * Text owes 4.5 and a UI boundary owes 3, so one value serves both. The
   * limit at this saturation is `#7A694D` (4.50 on the tint).
   */
  accentInk: '#6B5C45',
  /**
   * The accent's own tint: the ground behind a hovered nav item or a selected
   * option that is not itself the primary action.
   *
   * Ink reads 14.86:1 on it and `accentInk` 5.49:1, so a selected item can
   * carry either. `inkSubtle` reads 4.34:1 and is therefore banned here exactly
   * as it is on `inkTint`. Nearly the same value as `inkTint` (1.01:1), so the
   * tint is never the only signal that something is selected.
   */
  accentTint: '#EFECE6',

  // --- The protected six ---------------------------------------------------
  // The only other colours in the product that carry meaning. See `tableState.ts`.
  // Carried over unchanged: they were chosen against each other and against a
  // colour-deficient reader, and the accent moved to a hue none of them occupy
  // rather than asking any of them to move.
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
   * changes one package, not screens. It is not green and it is not beige: it
   * is the neutral tint described on `inkTint`. The accent has its own tint
   * below, and the two are not interchangeable — this one is for a selected
   * row, that one for an active nav item.
   */
  greenTint: palette.inkTint,

  /** A fill: primary button, active nav item, selected option, progress. */
  primary: palette.accent,
  /** Hover on the web, pressed everywhere. One value: two surfaces have no hover. */
  primaryPressed: palette.accentPressed,
  /** The label on `primary` and `primaryPressed`: ink, never white. */
  primaryForeground: palette.ink,
  /**
   * The accent as text, icon, outline or focus edge. Never `primary` for any
   * of those: the fill is 2.01:1 on white.
   */
  primaryInk: palette.accentInk,
  /** Hover and selected grounds. Body and secondary text clear AA on it. */
  accentTint: palette.accentTint,

  /**
   * Retained for the screens that import it, and the same fill as `primary`.
   *
   * It used to swap a green button to ink beside a floor plan. The beige is a
   * fill with an ink label everywhere, so there is nothing to swap; what a
   * control beside a plan adds instead is a `primaryInk` edge, because the fill
   * alone is 1.03:1 from out-of-service grey and the edge is 3.13:1.
   */
  primaryOnFloorPlan: palette.accent,
  primaryOnFloorPlanPressed: palette.accentPressed,

  // --- Data ----------------------------------------------------------------
  // Charts are neutral. The accent marks the one bar that is current, and
  // nothing else in a chart is allowed to carry it.

  /**
   * Every bar, line and progress fill that is not the active one.
   *
   * This exists because the alternative was ink, and a full-ink progress fill
   * reads as a redaction rather than a measure. Clears 3:1 on `surface`, on
   * `paper` and on `dataTrack`.
   */
  dataFill: palette.slate,
  /**
   * The one bar that is current, or the filled part of a bar showing progress
   * toward a goal the user is being asked to act on. The accent fill, and the
   * only place it is allowed in a chart. At 2.01:1 on white it is not a
   * graphic on its own: a bar in it carries an ink edge or its value as text.
   */
  dataFillActive: palette.accent,
  /** The empty remainder of a bar. Decoration — nothing is read off it. */
  dataTrack: palette.inkTint,

  /**
   * Feedback reuses the state hues. One green, one amber, one red and one blue
   * in the entire product: a second red would be a second thing red means.
   *
   * The accent is not in this list, and no feedback state is beige — a toast
   * reports, it is not the thing you press.
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
   *
   * Ink rather than the accent on purpose. The ring most often lands on the
   * primary button, and a beige halo around a beige fill is a ring nobody can
   * see. Ink reads on every surface in the product including that one. A
   * focused field's own edge turns `primaryInk`; the ring stays ink.
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
export const textBackgrounds = [
  color.surface,
  color.paper,
  color.greenTint,
  color.accentTint,
] as const;

/** The grounds tertiary text is allowed on. Never a tinted fill — see `inkSubtle`. */
export const subtleTextBackgrounds = [color.surface, color.paper] as const;

/** The two tinted fills tertiary text is banned from. Asserted, not assumed. */
export const tintedFills = [color.greenTint, color.accentTint] as const;
