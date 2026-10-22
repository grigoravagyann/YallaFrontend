import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { splitStyle } from './motion/splitStyle';
import { usePressScale } from './motion/usePressScale';
import {
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type IoniconName,
} from '../theme';
import { Text } from './Text';

export interface ChipProps {
  readonly label: string;
  /** Burgundy fill with a cream label; unselected is white with the hairline. */
  readonly selected?: boolean;
  readonly onPress?: () => void;
  /** Glyph before the label — the fork on "Restaurant", the cup on "Cafe". */
  readonly icon?: IoniconName;
  /** `pill` for filters and legends; `rounded` (12) for time slots and party sizes. */
  readonly shape?: 'pill' | 'rounded';
  readonly size?: 'sm' | 'md';
  readonly disabled?: boolean;
  /**
   * What a pressable chip is to a screen reader. `button` by default; a
   * category strip is a row of `tab`s; a filter that is on or off on its own
   * is a `switch`. Ignored without `onPress`.
   */
  readonly accessibilityRole?: 'button' | 'tab' | 'radio' | 'switch';
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/** Rendered height of each size. Exported so a row that sits on one can be measured from it. */
export const chipHeight = { sm: 36, md: layout.touchTarget - 4 } as const;

/**
 * A selectable token: filters on Explore, the map legend, dates, times and
 * party sizes on Booking, amenities on the details screen (no `onPress`), the
 * menu's categories and the waiter presets at the table.
 *
 * Both sizes are drawn under the 44pt minimum and make it up with `hitSlop`,
 * so a chip looks as light as the reference and still takes a thumb.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  shape = 'pill',
  size = 'md',
  disabled = false,
  accessibilityRole = 'button',
  accessibilityLabel,
  style,
}: ChipProps) {
  const foreground = selected ? colors.onPrimary : colors.text;
  const interactive = onPress !== undefined && !disabled;
  const press = usePressScale();
  const placed = splitStyle(style);
  const checkable = accessibilityRole === 'radio' || accessibilityRole === 'switch';
  return (
    <Animated.View style={[styles.wrap, press.style, placed.outer]}>
      <Pressable
        accessibilityRole={onPress ? accessibilityRole : 'text'}
        accessibilityState={
          checkable ? { selected, checked: selected, disabled } : { selected, disabled }
        }
        // The web build reads none of accessibilityState: say "chosen" in the
        // terms of the role, a selected tab, a checked radio or a switch that
        // is on (QA B5).
        {...(onPress && accessibilityRole === 'tab' ? { 'aria-selected': selected } : {})}
        {...(onPress && checkable ? { 'aria-checked': selected } : {})}
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        disabled={!interactive}
        hitSlop={Math.max(0, (layout.touchTarget - chipHeight[size]) / 2)}
        {...(onPress ? { onPress, onPressIn: press.onPressIn, onPressOut: press.onPressOut } : {})}
        style={({ pressed }) => [
          styles.base,
          size === 'sm' ? styles.sm : styles.md,
          { borderRadius: shape === 'pill' ? radius.pill : radius.chip },
          selected ? styles.selected : styles.idle,
          pressed && interactive && (selected ? styles.selectedPressed : styles.idlePressed),
          disabled && styles.disabled,
          placed.inner,
        ]}
      >
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={foreground} /> : null}
        <Text
          numberOfLines={1}
          style={[
            typography.body,

            { color: foreground, fontWeight: selected ? fontWeight.bold : fontWeight.medium },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    borderWidth: 1,
  },
  md: { minHeight: chipHeight.md, paddingHorizontal: space.lg },
  sm: { minHeight: chipHeight.sm, paddingHorizontal: space.md },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  idlePressed: { borderColor: colors.borderStrong, opacity: 0.85 },
  selected: { backgroundColor: colors.brand, borderColor: colors.brand },
  selectedPressed: { backgroundColor: colors.brandPressed, borderColor: colors.brandPressed },
  disabled: { opacity: 0.45 },
});
