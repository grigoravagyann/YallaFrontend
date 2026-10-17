import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { usePressScale } from './motion/usePressScale';
import {
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  typography,
  type IoniconName,
} from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'destructive';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  /**
   * `large` is the one press a screen is built around — Book a Table, Confirm
   * Booking. `small` is a row action beside a name (Approve, Remove); it keeps
   * a 44pt target through `hitSlop`.
   */
  readonly size?: 'small' | 'regular' | 'large';
  /** Ionicons glyph drawn before the label, in the label's colour. */
  readonly icon?: IoniconName;
  /** Stretch to the parent's width. Off, the button hugs its label (a row of two). */
  readonly fullWidth?: boolean;
  readonly disabled?: boolean;
  /** Work this press started is still running — announced, not only drawn. */
  readonly busy?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
}

const SMALL_HEIGHT = 36;

/**
 * The pill every screen presses.
 *
 * Five variants and nothing else, because chroma in this product means one of
 * two things: a table's state, or the single element you are meant to act on.
 * `primary` is the brown fill with a white label. `secondary` is a white pill
 * with a thin border — the "View Details" row under an order. `outline` is a
 * glass pill with an amber label — Log Out, the retry on an error. `text` is a
 * bare amber label. `destructive` is red text, never a red fill: cancelling a
 * booking is not an alarm.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  fullWidth = true,
  disabled = false,
  busy = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const color = labelColor[variant];
  const quiet = variant === 'text' || variant === 'secondary';
  const small = size === 'small';
  const labelStyle = small
    ? styles.smallLabel
    : quiet
      ? typography.buttonMedium
      : typography.button;
  const press = usePressScale();
  return (
    <Animated.View style={[fullWidth ? styles.fullWidth : styles.hug, press.style, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy }}
        // Named by its label outright: a text-only button had no name in the
        // web build's accessibility tree ("Pick a time", QA 20261016T2 B5).
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={small ? (layout.touchTarget - SMALL_HEIGHT) / 2 : undefined}
        style={({ pressed }) => [
          styles.base,
          styles[variant],
          size === 'large' && styles.large,
          small && styles.small,
          pressed && pressedStyles[variant],
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.content}>
          {icon ? (
            <Ionicons name={icon} size={small ? iconSize.sm : iconSize.md} color={color} />
          ) : null}
          <Text numberOfLines={1} style={[labelStyle, { color }]}>
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const labelColor: Record<ButtonVariant, string> = {
  primary: colors.onPrimary,
  secondary: colors.text,
  outline: colors.primary,
  text: colors.primary,
  // The ink, not the bright red: this is a label, and the fill red is 4.1:1.
  destructive: colors.errorInk,
};

const styles = StyleSheet.create({
  base: {
    minHeight: layout.controlHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fullWidth: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  large: { minHeight: layout.controlHeightLarge },
  small: { minHeight: SMALL_HEIGHT, paddingHorizontal: space.md },
  smallLabel: { ...typography.body, fontWeight: fontWeight.bold },
  disabled: { opacity: 0.35 },
  primary: {
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // A quiet glass pill: no gold rim (the design keeps borders off buttons).
  outline: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { minHeight: layout.touchTarget, backgroundColor: 'transparent' },
  destructive: { minHeight: layout.touchTarget, backgroundColor: 'transparent' },
});

const pressedStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.brandPressed },
  secondary: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  outline: { backgroundColor: colors.primarySoft, borderColor: colors.borderStrong },
  text: { opacity: 0.7 },
  destructive: { opacity: 0.7 },
};
