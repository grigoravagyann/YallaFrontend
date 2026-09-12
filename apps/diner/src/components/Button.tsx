import { color, fontSize, fontWeight, radius, space, touchTarget } from '@yalla/tokens';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'destructive';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  /** `large` is the one press that closes a visit — asking for the bill. */
  readonly size?: 'regular' | 'large';
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The pill every screen presses.
 *
 * Five variants and nothing else, because chroma in this product means one of
 * two things: a table's state, or the single element you are meant to act on.
 * `primary` is the beige fill with an ink label — never white on beige, which
 * reads 2.01:1. `outline` and `text` carry the accent as a line (`primaryInk`).
 * `destructive` is red text, never a red fill: leaving a tab is not an alarm.
 *
 * No busy or disabled state yet: the screens that need one (confirm, invite)
 * still draw their own pill, and a prop nobody passes is a prop nobody tests.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  style,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === 'large' && styles.large,
        pressed && pressedStyles[variant],
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: labelColor[variant] },
          variant === 'text' && styles.textLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const labelColor: Record<ButtonVariant, string> = {
  primary: color.primaryForeground,
  secondary: color.foreground,
  outline: color.primaryInk,
  text: color.primaryInk,
  destructive: color.danger,
};

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    alignSelf: 'stretch',
  },
  large: { minHeight: touchTarget.large },
  label: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  textLabel: { fontSize: fontSize.sm },
  primary: { backgroundColor: color.primary },
  secondary: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderInteractive,
  },
  outline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: color.primaryInk },
  text: { minHeight: touchTarget.minimum, backgroundColor: 'transparent' },
  destructive: { minHeight: touchTarget.minimum, backgroundColor: 'transparent' },
});

const pressedStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.primaryPressed },
  secondary: { backgroundColor: color.greenTint },
  outline: { backgroundColor: color.accentTint },
  text: { opacity: 0.7 },
  destructive: { opacity: 0.7 },
};
