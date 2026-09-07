import { color } from './color';

/**
 * The six states a table can be in on a floor plan.
 *
 * `yourPick` is diner-side only: it is the table this diner is currently
 * choosing, and staff never see it.
 */
export type TableStatus =
  'free' | 'reservedSoon' | 'occupied' | 'yourPick' | 'held' | 'outOfService';

export type FillPattern = 'none' | 'diagonalStripes' | 'crosshatch' | 'dots';

/**
 * How a table state is drawn — the complete recipe, as a token.
 *
 * This lives in the tokens package rather than inside the floor plan for two
 * reasons. The legend and the plan must draw the same swatch from the same
 * source, or the key ends up describing a colour the room does not use. And a
 * state's *treatment* is as much a design decision as its hue: changing what
 * `held` looks like should be an edit here, not an edit in a renderer.
 *
 * Every state differs in fill pattern and border treatment as well as hue.
 * Roughly 1 in 12 men has a red/green deficiency, and a terrace in Yerevan in
 * July is bright enough to wash out hue on any phone at any brightness. The
 * plan has to survive being read in greyscale, so hue is never the only signal.
 */
export interface TableStatusStyle {
  /** Fill of the table shape. Solid — no gradients anywhere in this system. */
  readonly fill: string;
  /**
   * Fill opacity. `1` for every state but `outOfService`, which is deliberately
   * knocked back so a dead table recedes from a room full of live ones.
   */
  readonly fillOpacity: number;
  readonly stroke: string;
  /** Canvas units. */
  readonly strokeWidth: number;
  /** SVG dash array, or `null` for a solid border. */
  readonly strokeDash: readonly number[] | null;
  /** Redundant encoding for the colour channel. */
  readonly pattern: FillPattern;
  /** Degrees clockwise. Only meaningful for `diagonalStripes`. */
  readonly patternAngleDegrees: number;
  /**
   * A ring drawn *outside* the shape, in the canvas colour, so the selected
   * table reads as lifted off the plan without a shadow. Only `yourPick` has
   * one — this system has exactly one elevation and it is not this.
   */
  readonly ring: { readonly color: string; readonly width: number } | null;
  /**
   * Label colour, chosen per state by contrast rather than assumed.
   *
   * White fails on the free-table green (2.66:1) and passes on occupied red
   * (5.60:1). Guessing one value for all six would leave a table number nobody
   * can read on exactly the state a waiter looks at most.
   */
  readonly label: string;
  /**
   * Stable key for the translated legend entry, resolved by the consuming app
   * against the `common` namespace. Never a human-readable string: the legend
   * renders in three languages.
   */
  readonly legendKey: `tableStatus.${TableStatus}`;
}

export const tableStatusStyle: Readonly<Record<TableStatus, TableStatusStyle>> = {
  free: {
    fill: color.success,
    fillOpacity: 1,
    stroke: color.border,
    strokeWidth: 1,
    strokeDash: null,
    pattern: 'none',
    patternAngleDegrees: 0,
    ring: null,
    label: color.foreground,
    legendKey: 'tableStatus.free',
  },
  reservedSoon: {
    fill: color.warning,
    fillOpacity: 1,
    stroke: color.border,
    strokeWidth: 1,
    strokeDash: null,
    pattern: 'diagonalStripes',
    patternAngleDegrees: 45,
    ring: null,
    label: color.foreground,
    legendKey: 'tableStatus.reservedSoon',
  },
  held: {
    fill: color.info,
    fillOpacity: 1,
    stroke: color.info,
    strokeWidth: 1.5,
    // Dotted, so "someone is mid-booking" reads as provisional at a glance.
    strokeDash: [1, 3],
    pattern: 'none',
    patternAngleDegrees: 0,
    ring: null,
    label: color.surface,
    legendKey: 'tableStatus.held',
  },
  occupied: {
    fill: color.danger,
    fillOpacity: 1,
    /*
     * Its own hue, two units wide, where `free` takes a one-unit hairline in
     * the neutral border colour. Both states are a flat fill with no pattern,
     * so without this they differ only in hue — and the pair a floor screen
     * shows most often would be the pair that vanishes in bright sun or for a
     * red/green-deficient reader. The heavier edge is the signal.
     */
    stroke: color.dangerPressed,
    strokeWidth: 2,
    strokeDash: null,
    pattern: 'none',
    patternAngleDegrees: 0,
    label: color.surface,
    ring: null,
    legendKey: 'tableStatus.occupied',
  },
  outOfService: {
    fill: color.outOfService,
    // Knocked back so a dead table recedes. The label colour below is checked
    // against the *composited* result, not the raw fill.
    fillOpacity: 0.7,
    stroke: color.borderStrong,
    strokeWidth: 1,
    strokeDash: null,
    pattern: 'crosshatch',
    patternAngleDegrees: 45,
    ring: null,
    label: color.foreground,
    legendKey: 'tableStatus.outOfService',
  },
  yourPick: {
    fill: color.foreground,
    fillOpacity: 1,
    stroke: color.foreground,
    strokeWidth: 1,
    strokeDash: null,
    pattern: 'none',
    patternAngleDegrees: 0,
    ring: { color: color.surface, width: 3 },
    label: color.surface,
    legendKey: 'tableStatus.yourPick',
  },
} as const;

/** Order the legend is rendered in, shared by every surface. */
export const tableStatusLegendOrder: readonly TableStatus[] = [
  'free',
  'reservedSoon',
  'occupied',
  'held',
  'outOfService',
  'yourPick',
] as const;

/**
 * The composited colour of a state's fill over the floor plan canvas.
 *
 * Only `outOfService` is translucent, but its label contrast has to be checked
 * against what is actually on screen rather than against the raw hex.
 */
export function compositedFill(status: TableStatus, over: string = color.surface): string {
  const style = tableStatusStyle[status];
  if (style.fillOpacity >= 1) return style.fill;

  const mix = (a: number, b: number) =>
    Math.round(a * style.fillOpacity + b * (1 - style.fillOpacity));
  const parse = (hex: string) => {
    const n = Number.parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };

  const [fr, fg, fb] = parse(style.fill);
  const [br, bg, bb] = parse(over);
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}
