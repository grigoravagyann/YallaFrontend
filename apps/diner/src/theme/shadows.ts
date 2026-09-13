import { Platform, type ViewStyle } from 'react-native';

/**
 * Three shadows: resting card, floating element (tab bar, bottom card), FAB.
 *
 * Neutral and very soft — a white card on the off-white ground should read as
 * lifted by a hair, never cut out. Native takes the classic `shadow*`
 * quartet plus Android `elevation`; the web build takes one `boxShadow`, which
 * is what react-native-web renders without deprecation noise.
 */
const SHADOW_COLOR = '#000000';

interface ShadowSpec {
  readonly y: number;
  readonly blur: number;
  readonly opacity: number;
  readonly elevation: number;
}

function shadow({ y, blur, opacity, elevation }: ShadowSpec): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0 ${y}px ${blur}px rgba(0,0,0,${opacity})` },
    default: {
      shadowColor: SHADOW_COLOR,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
      elevation,
    },
  });
}

export const shadows = {
  /** 0 2 10 rgba(0,0,0,.06) — cards at rest. */
  card: shadow({ y: 2, blur: 10, opacity: 0.06, elevation: 2 }),
  /** 0 4 16 rgba(0,0,0,.08) — the tab bar, bottom cards. */
  float: shadow({ y: 4, blur: 16, opacity: 0.08, elevation: 4 }),
  /** 0 4 12 rgba(0,0,0,.18) — the Scan FAB. */
  fab: shadow({ y: 4, blur: 12, opacity: 0.18, elevation: 6 }),
  /** Unused by the bar now; kept as the faintest step. */
  lift: shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 1 }),
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = keyof typeof shadows;
