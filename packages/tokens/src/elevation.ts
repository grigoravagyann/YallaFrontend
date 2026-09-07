import { color } from './color';

/**
 * Shadows: soft, diffused and ink-tinted, never pure black.
 *
 * A pure-black shadow under a white card reads as a component library. These
 * are the product's ink at low alpha with a large blur and a negative spread,
 * so a card sits on the paper the way a real card does — a diffuse halo
 * underneath rather than a hard drop.
 *
 * **This is what defines a card in this system.** Cards are separated from the
 * page by elevation, not by a border: a soft shadow on near-white is what lets
 * a dense dashboard stay calm, where a grid of outlined boxes reads as a form.
 * The alphas are lower than the system they replace, because the ground moved
 * closer to white and a shadow tuned for a tinted page is too heavy on this one.
 *
 * Three recipes, one directional variant:
 *
 * - `soft`  — resting cards, primary buttons, icon containers.
 * - `float` — things that genuinely float: the web nav pill, popovers.
 * - `lift`  — the deepened shadow under a hovered card or a pressed button.
 * - `sheet` — `float` mirrored upward, because a bottom sheet rises from the
 *   bottom edge and a downward shadow under it would be invisible.
 */
// Ink, never the accent. A violet shadow under a white card is a glow, and this
// system has no glows — an object casts the colour of the text beside it.
const SHADOW_RGB = '19, 26, 34';

interface NativeShadow {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  /** Android reads only this and cannot express direction or spread. */
  readonly elevation: number;
}

export interface Elevation {
  /** CSS `box-shadow`. */
  readonly web: string;
  /** The same shadow for React Native. iOS reads `shadow*`; Android `elevation`. */
  readonly native: NativeShadow;
}

function shadow(
  y: number,
  blur: number,
  spread: number,
  alpha: number,
  androidElevation: number,
): Elevation {
  return {
    web: `0 ${y}px ${blur}px ${spread}px rgba(${SHADOW_RGB}, ${alpha})`,
    native: {
      shadowColor: color.foreground,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: alpha,
      // React Native's radius is roughly half a CSS blur.
      shadowRadius: blur / 2,
      elevation: androidElevation,
    },
  };
}

export const elevation = {
  soft: shadow(2, 12, -2, 0.08, 2),
  float: shadow(8, 28, -8, 0.12, 6),
  lift: shadow(12, 32, -8, 0.1, 10),
  sheet: shadow(-8, 28, -8, 0.12, 6),
} as const satisfies Record<string, Elevation>;

export type ElevationToken = keyof typeof elevation;
