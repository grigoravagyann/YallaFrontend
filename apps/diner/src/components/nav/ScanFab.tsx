import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  colors,
  fabSize,
  iconSize,
  navIcons,
  radius,
  shadows,
  space,
  typography,
} from '../../theme';
import { Text } from '../Text';

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
 * The Scan button: a brown circle rising out of the tab bar with a white QR
 * glyph. Larger than the other four on purpose — it is the one thing a diner
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
        <Ionicons
          name={active ? navIcons.scan.filled : navIcons.scan.outline}
          size={iconSize.fab}
          color={colors.onPrimary}
        />
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  labelWrap: { marginTop: space.xs + 2 },
  label: { color: colors.textMuted },
  labelActive: { color: colors.primary },
});
