import type { ReactNode, Ref } from 'react';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fontWeight, layout, radius, space, tabularNumbers, typography } from '../../theme';
import { Text, TextInput } from '../Text';

export interface FieldProps {
  readonly label: string;
  /** A quiet line under the input — why the email is asked for, say. Replaced by the error when there is one. */
  readonly hint?: string;
  /** Shown under the input in red and announced: an alert, not decoration. */
  readonly error?: string | null;
  /** The input, or the row of inputs, this label names. */
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A labelled form field: label above, input in the middle, error or hint
 * below. The input itself is passed in, so a field can hold one pill or the
 * country-code + number pair.
 */
export function Field({ label, hint, error, children, style }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export interface FieldInputProps extends TextInputProps {
  readonly ref?: Ref<TextInput>;
  /** Draws the red border. The message itself is the `Field`'s `error`. */
  readonly invalid?: boolean;
  /** Digits line up — the number and the country code. */
  readonly tabular?: boolean;
}

/**
 * The pill text input of the reference design: white, thin border, at least
 * 48 tall, brown border while focused, red while invalid.
 */
export function FieldInput({
  ref,
  invalid = false,
  tabular = false,
  style,
  onFocus,
  onBlur,
  ...props
}: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...(ref ? { ref } : {})}
      placeholderTextColor={colors.textSubtle}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.input,
        tabular && tabularNumbers,
        focused && styles.inputFocused,
        invalid && styles.inputInvalid,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textSubtle },
  error: { ...typography.caption, color: colors.error },
  input: {
    minHeight: layout.controlHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.bodyLg,
  },
  inputFocused: { borderColor: colors.primary },
  inputInvalid: { borderColor: colors.error },
});
