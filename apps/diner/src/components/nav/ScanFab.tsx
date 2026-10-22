import { useState } from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../../theme';
import { Text } from '../Text';
import { tabBarMetrics } from './metrics';
import { MAX_NAV_LABEL_SCALE, navLabelActiveStyle, navLabelStyle } from './navLabel';
import { NavGlyph } from './NavGlyph';

export interface ScanFabProps {
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  /** The label under the circle — always visible, on the same baseline as the other four. */
  readonly label: string;
  /** The Scan tab is the current screen. */
  readonly active?: boolean;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Between the circle's lower edge and the top of its label: the circle sits
 * `scanBottom` above the pill's lower edge, the label one line above `labelBottom`.
 */
const CIRCLE_TO_LABEL =
  tabBarMetrics.scanBottom - tabBarMetrics.labelBottom - tabBarMetrics.labelLine;

/**
 * The Scan button: a solid white circle rising out of the tab bar with the
 * burgundy QR glyph. Larger than the other four on purpose — it is the one
 * thing a diner who has just sat down needs, held in one hand, from any screen.
 * Its label sits on the shared baseline with the other four.
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
      // The web build reads none of accessibilityState.
      aria-selected={active}
      accessibilityLabel={accessibilityLabel ?? label}
      {...(testID ? { testID } : {})}
      onPress={onPress}
      {...(onLongPress ? { onLongPress } : {})}
      onPressIn={() => squeeze(0.92)}
      onPressOut={() => squeeze(1)}
      style={[styles.slot, style]}
    >
      <Animated.View style={[styles.circle, { transform: [{ scale }] }]}>
        <NavGlyph routeName="scan" size={tabBarMetrics.scanGlyph} color={colors.accent} />
      </Animated.View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={MAX_NAV_LABEL_SCALE}
        style={[styles.label, active && navLabelActiveStyle]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: tabBarMetrics.labelBottom,
  },
  circle: {
    width: tabBarMetrics.scanSize,
    height: tabBarMetrics.scanSize,
    marginBottom: CIRCLE_TO_LABEL,
    borderRadius: radius.pill,
    // Solid white over the bar's hairline: a translucent circle let the pill's
    // edge and its Android elevation shadow show through as a seam.
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.navBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  label: { ...navLabelStyle, maxWidth: '100%' },
});
