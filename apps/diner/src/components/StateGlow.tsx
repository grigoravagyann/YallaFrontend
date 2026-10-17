import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, type IoniconName } from '../theme';

export interface StateGlowProps {
  readonly icon: IoniconName;
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The soft warm halo behind an empty or error state's glyph: a 124px circle
 * that glows at the top and fades into the ground, the outline icon in cream
 * on it. Decorative: the heading under it says what is going on.
 */
export function StateGlow({ icon, size = 124, style }: StateGlowProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.well, { width: size, height: size }, style]}
    >
      <LinearGradient
        colors={[colors.glowPeak, colors.glowMid, colors.glowClear]}
        locations={[0, 0.55, 1]}
        style={styles.fill}
      />
      <Ionicons name={icon} size={size / 2} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  well: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFill, borderRadius: radius.pill },
});
