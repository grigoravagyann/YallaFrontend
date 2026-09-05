import { color } from './color';

/**
 * Shadows: soft, diffused and green-tinted, never pure black.
 *
 * A grey shadow under a white card reads as a component library. These are the
 * brand green at low alpha with a large blur and a negative spread, so a card
 * sits on the paper the way a real card does — a warm halo underneath rather
 * than a hard drop.
 *
 * Three recipes, one directional variant:
 *
 * - `soft`  — resting cards, primary buttons, icon containers.
 * - `float` — things that genuinely float: the web nav pill, popovers.
 * - `lift`  — the deepened shadow under a hovered card or a pressed button.
 * - `sheet` — `float` mirrored upward, because a bottom sheet rises from the
 *   bottom edge and a downward shadow under it would be invisible.
 */
const SHADOW_RGB = '30, 91, 60';

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
      shadowColor: color.primary,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: alpha,
      // React Native's radius is roughly half a CSS blur.
      shadowRadius: blur / 2,
      elevation: androidElevation,
    },
  };
}

export const elevation = {
  soft: shadow(4, 20, -2, 0.14, 3),
  float: shadow(10, 40, -10, 0.2, 8),
  lift: shadow(20, 40, -10, 0.16, 12),
  sheet: shadow(-10, 40, -10, 0.2, 8),
} as const satisfies Record<string, Elevation>;

export type ElevationToken = keyof typeof elevation;
