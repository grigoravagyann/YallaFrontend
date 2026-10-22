import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space, typography } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export interface InlineConfirmProps {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly keepLabel: string;
  /** Shown in place of the confirm label while the command is in flight. */
  readonly busyLabel?: string;
  readonly busy?: boolean;
  /** Said above the buttons; the block stays so the action can be tried again. */
  readonly error?: string | null;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A confirmation that opens in place of the button that asked for it — "Cancel
 * the order?", "Cancel the booking?" (2026-10-22). Red-edged, the question,
 * what it means, then "Yes" and the way back. Used where the choice sits among
 * others on the screen and a sheet over it would hide what is being undone.
 */
export function InlineConfirm({
  title,
  body,
  confirmLabel,
  keepLabel,
  busyLabel,
  busy = false,
  error,
  onConfirm,
  onKeep,
  style,
}: InlineConfirmProps) {
  return (
    <View style={[styles.block, style]} accessibilityRole="alert">
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={busy && busyLabel ? busyLabel : confirmLabel}
        variant="destructive"
        busy={busy}
        disabled={busy}
        onPress={onConfirm}
        style={styles.confirm}
      />
      <Button label={keepLabel} variant="outline" disabled={busy} onPress={onKeep} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.sm + 2,
    padding: space.lg,
    borderRadius: radius.card + 2,
    borderWidth: 2,
    borderColor: colors.errorInk,
    backgroundColor: colors.surface,
  },
  title: { ...typography.h3, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
  error: { ...typography.caption, color: colors.errorInk },
  // The red is the label's; the fill is only its tint.
  confirm: { minHeight: layout.controlHeight, backgroundColor: colors.errorSoft },
});
