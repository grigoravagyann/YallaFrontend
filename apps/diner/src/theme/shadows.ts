import { Platform, type ViewStyle } from 'react-native';

/**
 * Three shadows: resting card, floating element (tab bar, bottom card), FAB.
 *
 * All warm — the shadow colour is the brown of the text, not black — so a
 * white card on cream never looks cut out. Native takes the classic `shadow*`
 * quartet plus Android `elevation`; the web build takes one `boxShadow`, which
 * is what react-native-web renders without deprecation noise.
 */
const SHADOW_COLOR = '#3C2814';

interface ShadowSpec {
  readonly y: number;
  readonly blur: number;
  readonly opacity: number;
  readonly elevation: number;
}

function shadow({ y, blur, opacity, elevation }: ShadowSpec): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0 ${y}px ${blur}px rgba(60,40,20,${opacity})` },
    default: {
      shadowColor: SHADOW_COLOR,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
      elevation,
    },
  });
}

export const shadows = {
  /** 0 4 16 rgba(60,40,20,.08) — cards at rest. */
  card: shadow({ y: 4, blur: 16, opacity: 0.08, elevation: 3 }),
  /** 0 8 24 rgba(60,40,20,.14) — the tab bar pill, bottom cards, the lifted tab. */
  float: shadow({ y: 8, blur: 24, opacity: 0.14, elevation: 8 }),
  /** 0 10 20 rgba(60,40,20,.28) — the Scan FAB. */
  fab: shadow({ y: 10, blur: 20, opacity: 0.28, elevation: 12 }),
  /** A whisper under the lifted active tab. */
  lift: shadow({ y: 3, blur: 8, opacity: 0.12, elevation: 2 }),
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = keyof typeof shadows;
