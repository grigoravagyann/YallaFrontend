import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from '../theme';

export interface SkeletonProps {
  readonly width?: DimensionValue;
  readonly height?: number;
  /** Corner radius; `radius.pill` for a circle, `radius.card` for a card. */
  readonly borderRadius?: number;
  readonly style?: StyleProp<ViewStyle>;
}

const SHIMMER_MS = 1400;

/**
 * A cream block with a light band sweeping across it while data loads.
 *
 * Compose a few into the shape of the card they stand in for; a list of
 * three of those is what the diner sees for the ~300ms the mock (and later the
 * network) takes.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.small,
  style,
}: SkeletonProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SHIMMER_MS,
        // Layout transforms on the web build run on the JS thread either way;
        // native drives them on the UI thread.
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const bandWidth = Math.max(measured, 1);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, bandWidth],
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={[styles.base, { width, height, borderRadius }, style]}
    >
      {measured > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[SHIMMER_EDGE, SHIMMER_PEAK, SHIMMER_EDGE]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const SHIMMER_EDGE = 'rgba(255,255,255,0)';
const SHIMMER_PEAK = 'rgba(255,255,255,0.65)';

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
});
