import { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fontWeight, layout, radius, shadows, space, typography } from '../theme';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Two (Active / History, Upcoming / Past) — three at most. */
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const THUMB_MS = 180;

/**
 * A pill with a brown thumb that slides under the chosen segment.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const [innerWidth, setInnerWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [position] = useState(() => new Animated.Value(index));

  useEffect(() => {
    Animated.timing(position, {
      toValue: index,
      duration: THUMB_MS,
      useNativeDriver: true,
    }).start();
  }, [index, position]);

  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  const translateX = Animated.multiply(position, segmentWidth);

  return (
    <View
      accessibilityRole="tablist"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={[styles.track, style]}
    >
      <View
        style={styles.inner}
        onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width)}
      >
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { width: segmentWidth, transform: [{ translateX }] }]}
          />
        ) : null}
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) onChange(option.value);
              }}
              style={({ pressed }) => [
                styles.segment,
                pressed && !selected && styles.segmentPressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  typography.body,
                  styles.label,
                  selected ? styles.labelSelected : styles.labelIdle,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const PAD = space.xs;

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: PAD,
  },
  inner: { flexDirection: 'row', position: 'relative' },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.card,
  },
  segment: {
    flex: 1,
    minHeight: layout.touchTarget - 2 * PAD,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  segmentPressed: { backgroundColor: colors.primarySoft },
  label: { fontWeight: fontWeight.medium },
  labelIdle: { color: colors.textMuted },
  labelSelected: { color: colors.primary, fontWeight: fontWeight.bold },
});
