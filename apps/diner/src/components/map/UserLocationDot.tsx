import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

/** The halo's diameter — also the box the dot is laid out in. */
export const USER_DOT_BOX = 44;
const DOT = 14;
const PULSE_MS = 1800;

export interface UserLocationDotProps {
  /**
   * The halo breathes. Off inside a native map marker, which is drawn once
   * into a bitmap and would not show the motion anyway.
   */
  readonly animated?: boolean;
  readonly accessibilityLabel: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The diner: a blue dot in a light-blue halo. Blue because it is the one thing
 * on the map that is not a place, and the pins are brown for the same reason.
 */
export function UserLocationDot({
  animated = true,
  accessibilityLabel,
  style,
}: UserLocationDotProps) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.05] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.85] });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
      style={[styles.box, style]}
    >
      <Animated.View
        style={[
          styles.halo,
          animated ? { opacity: haloOpacity, transform: [{ scale: haloScale }] } : styles.haloStill,
        ]}
      />
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: USER_DOT_BOX,
    height: USER_DOT_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: USER_DOT_BOX,
    height: USER_DOT_BOX,
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft,
  },
  haloStill: { opacity: 0.75 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.info,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
