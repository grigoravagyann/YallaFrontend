/**
 * Raw palette. Nothing outside this file should reference a hex literal.
 *
 * Solid fills only. There is no colour in this system expressed as another
 * colour at reduced opacity: a translucent tint composites differently over
 * white, over `paper` and over a state fill, so its contrast cannot be checked
 * once and trusted. `greenTint` is a real pale green, not `primary` at 12%.
 */
const palette = {
  white: '#FFFFFF',
  paper: '#F5F7F6',

  /** Deep green-black. The product's text colour, not pure black. */
  ink: '#12211A',
  inkMuted: '#57685F',
  /**
   * Darkened from the brief's `#8A9990`, which scored 2.58–2.98:1 and failed AA
   * on every background it is used over. Section 9 of the brief calls this pair
   * out in advance and says to fix it by darkening rather than by lowering the
   * standard — this is that fix. See `contrast.test.ts`.
   */
  inkSubtle: '#616E65',

  /** Decorative hairlines: dividers, card edges, table rules. */
  line: '#D5E0DA',
  lineStrong: '#B3C4BB',
  /**
   * Control boundaries — input and button outlines.
   *
   * Not the same value as `line`, and deliberately so. A 1px `#D5E0DA` edge is
   * 1.35:1 against white: fine as a divider, which WCAG treats as decoration,
   * but an input outline is a control boundary and owes 3:1. Anyone who has
   * hunted for a form field on a bright screen knows why.
   */
  lineInteractive: '#7E8D84',

  greenTint: '#E6F1EB',
  green: '#1B5638',
  greenPressed: '#144229',

  // --- The protected six ---------------------------------------------------
  // The only colours in the product that carry meaning. See `tableState.ts`.
  stateFree: '#35B37E',
  stateReservedSoon: '#C98A0E',
  stateHeld: '#3B6FD4',
  stateOccupied: '#B93B3B',
  stateOutOfService: '#8B95A1',

  /** Ink lifted, for the pressed state of an ink button beside a floor plan. */
  inkPressed: '#2B3D33',
} as const;

export const color = {
  /** Cards, panels, the floor plan canvas. */
  surface: palette.white,
  /** Page background. */
  paper: palette.paper,

  foreground: palette.ink,
  mutedForeground: palette.inkMuted,
  subtleForeground: palette.inkSubtle,

  border: palette.line,
  borderStrong: palette.lineStrong,
  borderInteractive: palette.lineInteractive,

  /** Selected rows, icon backgrounds, soft fills. A solid pale green. */
  greenTint: palette.greenTint,

  primary: palette.green,
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

  /** Text on a `danger` fill. White clears AA there; on `success` it does not. */
  dangerForeground: palette.white,
} as const;

export type ColorToken = keyof typeof color;

/** Every background that body text is set on, for the contrast tests. */
export const textBackgrounds = [color.surface, color.paper, color.greenTint] as const;
