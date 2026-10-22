import { Animated, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, fontWeight, layout, radius } from '../../theme';
import { usePressScale } from '../motion/usePressScale';
import { Text } from '../Text';

/** The chips' height; a 44 target through `hitSlop`. */
const CHIP_HEIGHT = 40;

export interface CategoryOption<K extends string> {
  readonly key: K;
  readonly label: string;
}

export interface CategoryChipsProps<K extends string> {
  readonly options: readonly CategoryOption<K>[];
  readonly selected: K;
  readonly onSelect: (key: K) => void;
  readonly accessibilityLabel: string;
}

/**
 * All · Cafés · Restaurants · Bars — one choice at a time. The chosen chip is
 * the burgundy fill with the cream label; the rest are white with a hairline.
 * Scrolls sideways, so the longest language never squeezes a label.
 */
export function CategoryChips<K extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
}: CategoryChipsProps<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      // Never squeezed by the list under it: the web build lets a ScrollView shrink.
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => (
        <CategoryChip
          key={option.key}
          label={option.label}
          selected={option.key === selected}
          onPress={() => onSelect(option.key)}
        />
      ))}
    </ScrollView>
  );
}

function CategoryChip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected }}
        // The web build reads none of accessibilityState.
        aria-checked={selected}
        hitSlop={(layout.touchTarget - CHIP_HEIGHT) / 2}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.chip,
          selected ? styles.selected : styles.idle,
          pressed && (selected ? styles.selectedPressed : styles.idlePressed),
        ]}
      >
        <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: layout.screenPadding },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  idlePressed: { borderColor: colors.borderStrong },
  selected: { backgroundColor: colors.brand, borderColor: colors.brand },
  selectedPressed: { backgroundColor: colors.brandPressed, borderColor: colors.brandPressed },
  label: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium, color: colors.text },
  // The design's 600: the sans ships 500 and 700, and Text rounds 600 up.
  labelSelected: { fontWeight: fontWeight.bold, color: colors.onPrimary },
});
