import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, fontWeight, layout, radius, shadows, space, typography } from '../../theme';
import { Text } from '../Text';

export interface SlidingOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** A second, quieter line under the label (the day's date). */
  readonly caption?: string;
  /** Cannot be chosen — a time with no free table. Drawn struck and dim, still named. */
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
}

export interface SlidingChoiceProps<T extends string> {
  readonly options: readonly SlidingOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  /** Equal-width cells per row; the thumb slides along the row and jumps rows. */
  readonly columns: number;
  readonly accessibilityLabel: string;
  readonly height?: number;
  readonly gap?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A grid of equal cells with one brand-filled thumb under the chosen one. A
 * new choice slides the thumb there (spring, native driver); under reduced
 * motion it just moves. Days and times on the booking screen, the two ways
 * to pay on the bill.
 */
export function SlidingChoice<T extends string>({
  options,
  value,
  onChange,
  columns,
  accessibilityLabel,
  height = layout.touchTarget,
  gap = space.sm,
  style,
}: SlidingChoiceProps<T>) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = options.findIndex((option) => option.value === value);
  const cell = width > 0 ? (width - gap * (columns - 1)) / columns : 0;
  const col = index < 0 ? 0 : index % columns;
  const row = index < 0 ? 0 : Math.floor(index / columns);

  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  const [shown] = useState(() => new Animated.Value(index < 0 ? 0 : 1));
  const targetX = col * (cell + gap);
  const targetY = row * (height + gap);

  useEffect(() => {
    if (cell <= 0) return;
    const to = { x: targetX, y: targetY };
    if (reduced) {
      x.setValue(to.x);
      y.setValue(to.y);
    } else {
      Animated.parallel([
        Animated.spring(x, { toValue: to.x, useNativeDriver: true, speed: 16, bounciness: 7 }),
        Animated.spring(y, { toValue: to.y, useNativeDriver: true, speed: 16, bounciness: 7 }),
      ]).start();
    }
    Animated.timing(shown, {
      toValue: index < 0 ? 0 : 1,
      duration: reduced ? 0 : 160,
      useNativeDriver: true,
    }).start();
  }, [cell, index, reduced, shown, targetX, targetY, x, y]);

  const rows = useMemo(() => {
    const out: SlidingOption<T>[][] = [];
    for (let i = 0; i < options.length; i += columns) out.push(options.slice(i, i + columns));
    return out;
  }, [options, columns]);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.grid, { gap }, style]}
    >
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: cell,
              height,
              opacity: shown,
              transform: [{ translateX: x }, { translateY: y }],
            },
          ]}
        />
      ) : null}
      {rows.map((cells, r) => (
        <View key={r} style={[styles.row, { gap, height }]}>
          {cells.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: option.disabled ?? false }}
                accessibilityLabel={option.accessibilityLabel ?? option.label}
                aria-checked={selected}
                disabled={option.disabled}
                onPress={() => {
                  if (!selected) onChange(option.value);
                }}
                style={({ pressed }) => [
                  styles.cell,
                  // A fixed width, not `flex: 1`: a short last row keeps the
                  // same cell size as the rows above, so the thumb still fits.
                  cell > 0 && { width: cell, flex: 0 },
                  !selected && styles.cellIdle,
                  pressed && !selected && styles.cellPressed,
                  option.disabled && styles.cellDisabled,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    selected ? styles.labelOn : styles.labelIdle,
                    option.disabled && styles.labelDisabled,
                  ]}
                >
                  {option.label}
                </Text>
                {option.caption ? (
                  <Text numberOfLines={1} style={[styles.caption, selected && styles.labelOn]}>
                    {option.caption}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { position: 'relative' },
  row: { flexDirection: 'row' },
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
    flex: 1,
    minWidth: 0,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  cellIdle: { backgroundColor: colors.surface },
  cellPressed: { backgroundColor: colors.surfaceMuted },
  cellDisabled: { opacity: 0.45 },
  label: { ...typography.body, fontWeight: fontWeight.medium },
  labelIdle: { color: colors.textMuted },
  labelOn: { color: colors.onPrimary, fontWeight: fontWeight.bold },
  labelDisabled: { textDecorationLine: 'line-through' },
  caption: { ...typography.caption, color: colors.textMuted },
});
