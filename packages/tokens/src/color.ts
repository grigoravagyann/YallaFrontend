import { consoleColor } from './console';

/**
 * The shared `--color-*` palette: the older web screens' colours, the table
 * states (`tableState.ts`) and the shadows (`elevation.ts`).
 *
 * ## SHURJ, and nothing from before it
 *
 * Before the SHURJ rebrand (2026-10-22) this file held its own palette: a cool
 * blue-grey paper, a blue-black ink, a beige accent, cool hairlines and a blue
 * "held". None of it is drawn on a SHURJ screen any more, so none of it is
 * kept. Every neutral and the action colour below now *is* a `console.ts`
 * value — the console, the floor tablet and the public page's source of truth
 * — so this palette cannot drift from SHURJ again, and nobody can pick up a
 * blue or an old cool grey from it. `noBlue.test.ts` fails on a blue in any
 * token file.
 *
 * The older screens read these through `index.css`. The staff surface
 * (`staff.css`) and the venue console's `.yc-legacy` wrapper (`console.css`)
 * point the same variables at `--console-*` directly; the values here are the
 * same ones, so a screen outside either wrapper wears SHURJ too.
 *
 * ## The one rule
 *
 * **Chroma means one of two things: what state something is in, or the single
 * element you are meant to act on.** The action is the Black Cherry; the
 * table states are green, amber, burgundy, red and grey; everything else is
 * charcoal, a warm grey or a hairline.
 */

/**
 * The five floor hues that are not in `console.ts` under a name of their own
 * meaning. The floor tablet draws its card edges in the same values
 * (`consoleColor.floorFreeEdge`, `floorBookedEdge`, `floorOccupiedEdge`,
 * `floorOutEdge`); held is the console's waiting burgundy.
 */
const state = {
  free: '#35B37E',
  reservedSoon: '#C98A0E',
  occupied: '#B93B3B',
  /** Occupied red, darkened, for a destructive button under a finger. */
  occupiedPressed: '#9E3232',
  /**
   * A warm-neutral grey for a dead table. Cool in hue but nearly grey (10%
   * saturation), and the floor tablet's out-of-service edge too.
   */
  outOfService: '#8B95A1',
  /**
   * The free green and the reserved-soon amber darkened until they work as
   * text: 5.80:1 and 5.70:1 on white, 4.70:1 and 4.62:1 on `greenTint`.
   */
  freeInk: '#1E7350',
  reservedSoonInk: '#8A5E08',
} as const;

export const color = {
  /** Cards, sheets, inputs. */
  surface: consoleColor.surface,
  /** The page: white, as everywhere in SHURJ. */
  paper: consoleColor.canvas,

  /** Text: the charcoal. 14.40:1 on white. */
  foreground: consoleColor.ink,
  /** Secondary text. 6.88:1 on white, 5.57:1 on `greenTint`. */
  mutedForeground: consoleColor.muted,
  /**
   * Placeholders and disabled labels. SHURJ's web screens have two text
   * weights, not three, so this is `mutedForeground` — the value both remaps
   * already gave it.
   */
  subtleForeground: consoleColor.muted,

  /** Hairlines: dividers, table rules. 1.26:1 on white; decoration only. */
  border: consoleColor.line,
  /** The softest edge: a card on white. */
  borderSoft: consoleColor.lineSoft,
  /** A firmer edge: a secondary button, a dashed empty box. 12.16:1 on white. */
  borderStrong: consoleColor.buttonEdge,

  /**
   * Kept under its old name because the older screens read it: the brand's
   * tint, the ground of a selected row or a pressed ghost button. Not green.
   */
  greenTint: consoleColor.brandTint,

  /** The fill to press: the Black Cherry, with ivory on it (14.47:1). */
  primary: consoleColor.brand,
  /** Hover on the web, pressed everywhere. Ivory reads 16.08:1 on it. */
  primaryPressed: consoleColor.brandHover,
  /** The label on `primary` and `primaryPressed`. */
  primaryForeground: consoleColor.brandForeground,
  /**
   * The brand as text, icon, outline or focus edge. The cherry is dark enough
   * to be both fill and line (15.39:1 on white), so this is `primary` again.
   */
  primaryInk: consoleColor.brand,
  /** The action beside a floor plan: the same cherry, no swap. */
  primaryOnFloorPlan: consoleColor.brand,
  primaryOnFloorPlanPressed: consoleColor.brandHover,

  /**
   * Feedback reuses the table states' hues: one green, one amber, one red and
   * the waiting burgundy. A second red would be a second thing red means.
   */
  danger: state.occupied,
  warning: state.reservedSoon,
  success: state.free,
  /** Waiting and held: the logo burgundy, never blue. */
  info: consoleColor.waiting,
  /** `success` and `warning` as text. The fills are never text. */
  successInk: state.freeInk,
  warningInk: state.reservedSoonInk,
  /** The out-of-service grey. Only a floor plan draws with it. */
  outOfService: state.outOfService,

  /** Text on a `danger` fill. White clears AA there; on `success` it does not. */
  dangerForeground: consoleColor.redForeground,
  /** Pressed is a fill change and a scale, for destructive buttons too. */
  dangerPressed: state.occupiedPressed,

  // --- Translucent, by exception ------------------------------------------
  /** The veil behind a dialog or a sheet: the charcoal at 45%. Never under text. */
  scrim: consoleColor.scrim,
  /** The keyboard focus outline: the cherry, 3:1 and more on every light ground. */
  focusRing: consoleColor.focus,
} as const;

export type ColorToken = keyof typeof color;

/** Every ground body and secondary text is set on, for the contrast tests. */
export const textBackgrounds = [color.surface, color.paper, color.greenTint] as const;

/** The grounds tertiary text is allowed on: every text ground, now it is muted. */
export const subtleTextBackgrounds = textBackgrounds;

/** The tinted fill text sits on: the brand tint. */
export const tintedFills = [color.greenTint] as const;
