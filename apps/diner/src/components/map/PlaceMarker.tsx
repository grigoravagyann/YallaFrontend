import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PlaceType } from '../../places/model';
import { colors, iconSize, placeTypeIcon, radius, shadows } from '../../theme';

/** The pin's head. */
export const MARKER_HEAD = 36;
/** The little point under the head. */
export const MARKER_TAIL = 9;
/** Box the marker is laid out in: wide enough to scale up without clipping. */
export const MARKER_BOX_WIDTH = 56;
export const MARKER_BOX_HEIGHT = 60;
/** How much a selected marker grows. */
const SELECTED_SCALE = 1.22;

export interface PlaceMarkerProps {
  readonly type: PlaceType;
  readonly selected: boolean;
  /**
   * Only the web map passes this: on native, `react-native-maps` owns the tap
   * and the marker is drawn into a bitmap.
   */
  readonly onPress?: () => void;
  readonly accessibilityLabel: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A brown pin with the place's kind inside — a fork-and-knife for a
 * restaurant, a cup for a café — so the two are told apart at a glance, not
 * by reading a label. Selecting it springs it up a fifth from its tip.
 */
export function PlaceMarker({
  type,
  selected,
  onPress,
  accessibilityLabel,
  style,
}: PlaceMarkerProps) {
  const [scale] = useState(() => new Animated.Value(selected ? SELECTED_SCALE : 1));

  useEffect(() => {
    const animation = Animated.spring(scale, {
      toValue: selected ? SELECTED_SCALE : 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [selected, scale]);

  const pin = (
    <Animated.View style={[styles.pin, { transform: [{ scale }] }]}>
      <View style={[styles.head, selected && styles.headSelected]}>
        <Ionicons name={placeTypeIcon[type]} size={iconSize.md} color={colors.onPrimary} />
      </View>
      <View style={styles.tail} />
    </Animated.View>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[styles.box, style]}
      >
        {pin}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.box, pressed && styles.pressed, style]}
    >
      {pin}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: MARKER_BOX_WIDTH,
    height: MARKER_BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pressed: { opacity: 0.85 },
  // Grows from the tip, so a selected pin still points at the same spot.
  pin: { alignItems: 'center', transformOrigin: '50% 100%' },
  head: {
    width: MARKER_HEAD,
    height: MARKER_HEAD,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lift,
  },
  headSelected: { backgroundColor: colors.primaryPressed },
  tail: {
    width: MARKER_TAIL,
    height: MARKER_TAIL,
    marginTop: -MARKER_TAIL / 2 - 1,
    backgroundColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
});
