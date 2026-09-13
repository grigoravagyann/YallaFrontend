import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
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
  /** Brown fill with a white label; unselected is white with a thin border. */
  readonly selected?: boolean;
  readonly onPress?: () => void;
  /** Glyph before the label — the fork on "Restaurant", the cup on "Cafe". */
  readonly icon?: IoniconName;
  /** `pill` for filters and legends; `rounded` (12) for time slots and party sizes. */
  readonly shape?: 'pill' | 'rounded';
  readonly size?: 'sm' | 'md';
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/** Rendered height of each size. Exported so a row that sits on one can be measured from it. */
export const chipHeight = { sm: 36, md: layout.touchTarget - 4 } as const;

/**
 * A selectable token: filters on Explore, the map legend, dates, times and
 * party sizes on Booking, amenities on the details screen (no `onPress`).
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
  accessibilityLabel,
  style,
}: ChipProps) {
  const foreground = selected ? colors.onPrimary : colors.text;
  const interactive = onPress !== undefined && !disabled;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected, disabled }}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      disabled={!interactive}
      hitSlop={Math.max(0, (layout.touchTarget - chipHeight[size]) / 2)}
      {...(onPress ? { onPress } : {})}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { borderRadius: shape === 'pill' ? radius.pill : radius.chip },
        selected ? styles.selected : styles.idle,
        pressed && interactive && (selected ? styles.selectedPressed : styles.idlePressed),
        disabled && styles.disabled,
        style,
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
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: space.xs + 2,
    borderWidth: 1,
  },
  md: { minHeight: chipHeight.md, paddingHorizontal: space.lg },
  sm: { minHeight: chipHeight.sm, paddingHorizontal: space.md },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  idlePressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedPressed: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
  disabled: { opacity: 0.45 },
});
