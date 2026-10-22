import { Platform, type ViewStyle } from 'react-native';
import { colors } from './colors';

/**
 * Shadows on the white ground: soft and warm, never grey. A card is held by
 * its hairline, so its shadow is barely there; the floating bar, the Scan
 * circle and a sheet get a wider drop in the text colour, and a brand fill a
 * soft burgundy lift.
 *
 * Native takes the classic `shadow*` quartet plus Android `elevation`; the web
 * build takes one `boxShadow`, which is what react-native-web renders without
 * deprecation noise.
 */
/** The warm near-black of the text, so a shadow reads as shade on paper, not grey. */
const SHADOW_COLOR = '#2D2927';

interface ShadowSpec {
  readonly y: number;
  readonly blur: number;
  readonly opacity: number;
  readonly elevation: number;
  /** Hex; the text colour unless the shadow is a brand lift. */
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
  /** Cards at rest: the hairline does the work, this only settles them. */
  card: shadow({ y: 1, blur: 2, opacity: 0.05, elevation: 1 }),
  /** The tab bar, bottom cards. */
  float: shadow({ y: 10, blur: 30, opacity: 0.14, elevation: 6 }),
  /** The Scan circle, raised out of the bar. */
  fab: shadow({ y: 4, blur: 12, opacity: 0.1, elevation: 4 }),
  /** A brand-filled button or chip: a soft burgundy lift. */
  brand: shadow({ y: 6, blur: 20, opacity: 0.16, elevation: 3, color: colors.brandGlow }),
  /** A bottom sheet, lifted off the page under it. */
  sheet: shadow({ y: -12, blur: 40, opacity: 0.12, elevation: 12 }),
  /** A page-wide sheet resting on a ground (Explore's white over the ivory): a faint upward lift. */
  sheetTop: shadow({ y: -6, blur: 20, opacity: 0.05, elevation: 2 }),
  /** The faintest step — a map pin. */
  lift: shadow({ y: 1, blur: 3, opacity: 0.12, elevation: 1 }),
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = keyof typeof shadows;
