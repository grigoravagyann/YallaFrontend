import { Platform, type ViewStyle } from 'react-native';
import { colors } from './colors';

/**
 * Shadows on a dark ground: depth comes from a deep, soft shadow under a
 * card, and the brand fill gets a warm glow instead, so a dark-brown button
 * still lifts off a dark-brown screen.
 *
 * Native takes the classic `shadow*` quartet plus Android `elevation`; the web
 * build takes one `boxShadow`, which is what react-native-web renders without
 * deprecation noise.
 */
const SHADOW_COLOR = '#000000';

interface ShadowSpec {
  readonly y: number;
  readonly blur: number;
  readonly opacity: number;
  readonly elevation: number;
  /** Hex; black unless the shadow is a glow. */
  readonly color?: string;
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

function shadow({ y, blur, opacity, elevation, color = SHADOW_COLOR }: ShadowSpec): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0 ${y}px ${blur}px ${rgba(color, opacity)}` },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
      elevation,
    },
  });
}

export const shadows = {
  /** Cards at rest. */
  card: shadow({ y: 6, blur: 18, opacity: 0.28, elevation: 2 }),
  /** The tab bar, bottom cards. */
  float: shadow({ y: 10, blur: 30, opacity: 0.5, elevation: 6 }),
  /** The Scan FAB: a warm halo rather than a drop. */
  fab: shadow({ y: 0, blur: 22, opacity: 0.55, elevation: 8, color: colors.brandGlow }),
  /** A brand-filled button or chip: the glow that lifts it off the ground. */
  brand: shadow({ y: 4, blur: 16, opacity: 0.4, elevation: 4, color: colors.brandGlow }),
  /** The faintest step — a map pin. */
  lift: shadow({ y: 1, blur: 4, opacity: 0.3, elevation: 1 }),
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = keyof typeof shadows;
