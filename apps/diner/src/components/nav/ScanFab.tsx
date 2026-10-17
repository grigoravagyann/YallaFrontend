import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fabSize, iconSize, radius, shadows, space, typography } from '../../theme';
import { Text } from '../Text';
import { NavGlyph } from './NavGlyph';

export interface ScanFabProps {
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  /** The label under the circle — always visible, like the other four. */
  readonly label: string;
  /** The Scan tab is the current screen. */
  readonly active?: boolean;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The Scan button: a glowing espresso circle rising out of the tab bar with
 * a cream QR glyph. Larger than the other four on purpose — it is the one thing a diner
 * who has just sat down needs, held in one hand, from any screen.
 *
 * Pressing it squeezes the circle with a spring, so the tap reads before the
 * camera has even opened.
 */
export function ScanFab({
  onPress,
  onLongPress,
  label,
  active = false,
  accessibilityLabel,
  testID,
  style,
}: ScanFabProps) {
  const [scale] = useState(() => new Animated.Value(1));

  const squeeze = (to: number) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      {...(testID ? { testID } : {})}
      onPress={onPress}
      {...(onLongPress ? { onLongPress } : {})}
      onPressIn={() => squeeze(0.92)}
      onPressOut={() => squeeze(1)}
      style={[styles.slot, style]}
    >
      <Animated.View style={[styles.circle, { transform: [{ scale }] }]}>
        <LinearGradient
          pointerEvents="none"
          colors={[colors.fabTop, colors.fabBottom]}
          style={styles.fill}
        />
        {/* In a View of its own: a positioned sibling, so it paints above the
            gradient on web as well as native. */}
        <View>
          <NavGlyph routeName="scan" size={iconSize.fab} color={colors.onPrimary} />
        </View>
      </Animated.View>
      <View style={styles.labelWrap}>
        <Text
          numberOfLines={1}
          style={[typography.navLabel, styles.label, active && styles.labelActive]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'flex-start', flex: 1 },
  circle: {
    width: fabSize,
    height: fabSize,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.pill },
  labelWrap: { marginTop: space.xs + 2 },
  label: { color: colors.textMuted },
  labelActive: { color: colors.primary },
});
