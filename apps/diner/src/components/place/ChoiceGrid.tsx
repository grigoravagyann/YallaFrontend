import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, fontWeight, layout, radius, shadows, space, tabularNumbers } from '../../theme';
import { Text } from '../Text';

export interface ChoiceGridOption {
  readonly value: string;
  readonly label: string;
  /** Cannot be chosen: drawn dim and struck through, still named. */
  readonly disabled?: boolean;
  /**
   * What a screen reader says, when the label alone does not: "19:00, no free
   * tables" for a struck time. Defaults to the label.
   */
  readonly accessibilityLabel?: string;
}

export interface ChoiceGridProps {
  readonly options: readonly ChoiceGridOption[];
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly columns: number;
  /** The radio group's name: "Time", "Party Size". */
  readonly accessibilityLabel: string;
  readonly gap?: number;
  readonly height?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A grid of radios in fixed columns — every cell the same width, a short last
 * row included — with one brand thumb under the chosen one. A new choice
 * slides the thumb along its row and across rows (spring, native driver);
 * under reduced motion it just moves.
 */
export function ChoiceGrid({
  options,
  value,
  onChange,
  columns,
  accessibilityLabel,
  gap = space.sm,
  height = layout.touchTarget,
  style,
}: ChoiceGridProps) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - gap * (columns - 1)) / columns : 0;
  const index = options.findIndex((option) => option.value === value);
  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  // The first placement is a jump; only a new choice slides.
  const placed = useRef(false);

  useEffect(() => {
    if (cell <= 0 || index < 0) return;
    const toX = (index % columns) * (cell + gap);
    const toY = Math.floor(index / columns) * (height + gap);
    if (reduced || !placed.current) {
      x.setValue(toX);
      y.setValue(toY);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: toX, useNativeDriver: true, speed: 16, bounciness: 7 }),
      Animated.spring(y, { toValue: toY, useNativeDriver: true, speed: 16, bounciness: 7 }),
    ]).start();
  }, [cell, columns, gap, height, index, reduced, x, y]);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.grid, { gap }, style]}
    >
      {cell > 0 && index >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { width: cell, height, transform: [{ translateX: x }, { translateY: y }] },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        const disabled = option.disabled ?? false;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: selected, disabled }}
            // The web build reads none of accessibilityState.
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.cell,
              { width: cell > 0 ? cell : `${100 / columns}%`, height },
              !selected && styles.cellIdle,
              pressed && !selected && styles.cellPressed,
              disabled && styles.cellDisabled,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, selected && styles.labelOn, disabled && styles.labelDisabled]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { position: 'relative', flexDirection: 'row', flexWrap: 'wrap' },
  thumb: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  cell: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  cellIdle: { backgroundColor: colors.surface },
  cellPressed: { backgroundColor: colors.surfaceMuted },
  cellDisabled: { opacity: 0.45 },
  label: { fontSize: 12.5, lineHeight: 16, ...tabularNumbers, color: colors.textMuted },
  labelOn: { fontWeight: fontWeight.bold, color: colors.onPrimary },
  labelDisabled: { textDecorationLine: 'line-through' },
});
