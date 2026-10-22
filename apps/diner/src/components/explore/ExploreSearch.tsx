import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { actionIcon, colors, fontWeight, layout, radius, shadows, space } from '../../theme';
import { Text, TextInput } from '../Text';

/** The field's height: a step under the 48 control, as the design draws it. */
const FIELD_HEIGHT = 46;

export interface ExploreSearchProps {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly clearLabel: string;
  readonly filtersLabel: string;
  /** How many filters are on: a count on the button when it is not zero. */
  readonly activeFilters: number;
  readonly onFilters: () => void;
}

/**
 * The search field on the white sheet: the glass on the left, the filter
 * button on the right, both inside the one white pill. A clear button joins
 * them while there is something to clear.
 */
export function ExploreSearch({
  value,
  onChangeText,
  placeholder,
  maxLength,
  clearLabel,
  filtersLabel,
  activeFilters,
  onFilters,
}: ExploreSearchProps) {
  return (
    <View style={styles.field}>
      <Ionicons name={actionIcon.search} size={19} color={colors.primary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        returnKeyType="search"
        // The server refuses a longer search outright.
        maxLength={maxLength}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Ionicons name={actionIcon.close} size={20} color={colors.primary} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={activeFilters > 0 ? `${filtersLabel}, ${activeFilters}` : filtersLabel}
        onPress={onFilters}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="options-outline" size={20} color={colors.primary} />
        {activeFilters > 0 ? (
          <View pointerEvents="none" style={styles.count}>
            {/* Held to its 16 px dot: a large system font would burst it. */}
            <Text maxFontSizeMultiplier={1} style={styles.countText}>
              {activeFilters}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    height: FIELD_HEIGHT,
    paddingLeft: 15,
    paddingRight: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    // The design's barely-there lift under the field: a card's own, 0 1 2 at 5%.
    ...shadows.card,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
    paddingVertical: 0,
    // The web build draws a focus outline of its own round the bare input.
    ...Platform.select<object>({ web: { outlineStyle: 'none' }, default: {} }),
  },
  // The field is 46 tall with a 1 px edge: a full 44 circle fits inside it.
  button: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.primarySoft },
  count: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10, lineHeight: 12, fontWeight: fontWeight.bold, color: colors.onPrimary },
});
