import { color } from './color';

/**
 * Ambient texture and form: the two things that make a white page feel like
 * paper rather than a screen. Both are background-only and both are excluded
 * from the places where legibility is the whole job.
 */

/**
 * Paper grain on `paper` backgrounds, at 2–3% opacity with a multiply blend.
 *
 * **Excluded, deliberately:** the floor plan canvas and every staff screen.
 * Grain reduces contrast, and the staff tablet is read at two metres on a
 * counter that may be in direct sun. A waiter misreading a table state costs
 * the venue. The web stylesheet applies it to `body::before` and switches it
 * off under `[data-surface='staff']`; the diner app draws none over a plan.
 */
export const paperGrain = {
  opacity: 0.025,
  blendMode: 'multiply',
  /** Tile size in px. Large enough that the repeat is not visible. */
  tile: 180,
  /** An SVG tile of fractal noise, ready for `url(...)`. */
  dataUri: svgDataUri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>` +
      `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#g)'/></svg>`,
  ),
} as const;

/**
 * Amorphous blob shapes for ambient background forms — large, blurred, low
 * opacity, behind content. Allowed on the diner app's browse and empty screens
 * and on marketing or public pages. **Never over a floor plan, never on a
 * staff screen.**
 *
 * The radii are CSS `border-radius` strings; three, so neighbouring blobs do
 * not read as copies. The fill is the brand tint, not a state colour: a blob
 * that happened to be free-table green would be a false signal.
 */
export const blob = {
  radii: [
    '60% 40% 30% 70% / 60% 30% 70% 40%',
    '40% 60% 70% 30% / 40% 50% 60% 50%',
    '55% 45% 35% 65% / 50% 60% 40% 50%',
  ],
  /** CSS `filter: blur()` in px. */
  blur: 64,
  opacity: 0.55,
  fill: color.greenTint,
} as const;

function svgDataUri(svg: string): string {
  const encoded = svg
    .replace(/"/gu, "'")
    .replace(/#/gu, '%23')
    .replace(/</gu, '%3C')
    .replace(/>/gu, '%3E')
    .replace(/\s{2,}/gu, ' ');
  return `data:image/svg+xml,${encoded}`;
}
