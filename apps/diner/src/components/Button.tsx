import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, iconSize, layout, radius, space, typography, type IoniconName } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'destructive';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  /** `large` is the one press a screen is built around — Book a Table, Confirm Booking. */
  readonly size?: 'regular' | 'large';
  /** Ionicons glyph drawn before the label, in the label's colour. */
  readonly icon?: IoniconName;
  /** Stretch to the parent's width. Off, the button hugs its label (a row of two). */
  readonly fullWidth?: boolean;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
}

/**
 * The pill every screen presses.
 *
 * Five variants and nothing else, because chroma in this product means one of
 * two things: a table's state, or the single element you are meant to act on.
 * `primary` is the brown fill with a white label. `secondary` is a white pill
 * with a thin border — the "View Details" row under an order. `outline` is a
 * brown line and brown label — Log Out, the retry on an error. `text` is a bare
 * brown label. `destructive` is red text, never a red fill: cancelling a
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
  style,
  accessibilityLabel,
}: ButtonProps) {
  const color = labelColor[variant];
  const quiet = variant === 'text' || variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === 'large' && styles.large,
        fullWidth ? styles.fullWidth : styles.hug,
        pressed && pressedStyles[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Ionicons name={icon} size={iconSize.md} color={color} /> : null}
        <Text
          numberOfLines={1}
          style={[quiet ? typography.buttonMedium : typography.button, { color }]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const labelColor: Record<ButtonVariant, string> = {
  primary: colors.onPrimary,
  secondary: colors.text,
  outline: colors.primary,
  text: colors.primary,
  destructive: colors.error,
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
  disabled: { opacity: 0.45 },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  text: { minHeight: layout.touchTarget, backgroundColor: 'transparent' },
  destructive: { minHeight: layout.touchTarget, backgroundColor: 'transparent' },
});

const pressedStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  outline: { backgroundColor: colors.primarySoft },
  text: { opacity: 0.7 },
  destructive: { opacity: 0.7 },
};
