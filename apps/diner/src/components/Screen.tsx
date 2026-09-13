import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { colors, layout } from '../theme';
import { NAV_CLEARANCE } from './nav/metrics';

export { NAV_CLEARANCE };

export interface ScreenProps {
  readonly children: ReactNode;
  /**
   * Safe-area edges to honour. Tab screens keep the default — the floating
   * nav owns the bottom, and the screen's scroll content adds `NAV_CLEARANCE`
   * (see `useNavClearance`). Pushed screens with a pinned bottom button pass
   * `['top', 'left', 'right', 'bottom']`.
   */
  readonly edges?: readonly Edge[];
  /**
   * Extra padding under the content, e.g. `NAV_CLEARANCE` for a non-scrolling
   * tab screen whose content must end above the floating nav. Scrolling screens
   * put it in `contentContainerStyle` instead, so the list is not clipped.
   */
  readonly bottomInset?: number;
  /** Horizontal page padding (16). Off for full-bleed lists and the map. */
  readonly padded?: boolean;
  readonly backgroundColor?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Every screen's root: the cream ground, safe-area aware.
 *
 * `SafeAreaView` from react-native-safe-area-context rather than React
 * Native's: the latter is iOS-only and ignores Android's gesture bar, which is
 * exactly where the floating nav sits.
 */
export function Screen({
  children,
  edges = DEFAULT_EDGES,
  bottomInset = 0,
  padded = false,
  backgroundColor = colors.background,
  style,
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={[
        styles.root,
        { backgroundColor },
        padded && styles.padded,
        bottomInset > 0 && { paddingBottom: bottomInset },
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
}

/**
 * Bottom padding for a tab screen's scroll content: the nav's footprint plus
 * the device's own bottom inset. Use it as `contentContainerStyle.paddingBottom`.
 */
export function useNavClearance(): number {
  const insets = useSafeAreaInsets();
  return NAV_CLEARANCE + insets.bottom;
}

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: layout.screenPadding },
});
