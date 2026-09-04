import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export interface ConfirmSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Shown in place of the confirm label while the command is in flight. */
  readonly busyLabel?: string;
  readonly busy?: boolean;
  /** Surfaced above the buttons; the sheet stays open so the action is retryable. */
  readonly error?: string | null;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The one confirmation pattern in the app.
 *
 * A sheet rather than an `Alert` for two reasons: `Alert` cannot show a spinner
 * or an error, so a failed confirmation there has nowhere to say so and either
 * disappears silently or bounces the user out to a screen that has not changed;
 * and `Alert`'s button text is styled by the OS, which puts three languages at
 * the mercy of a platform that will happily clip Armenian.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busyLabel,
  busy = false,
  error = null,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back cancels rather than confirming, always.
      onRequestClose={busy ? () => undefined : onCancel}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityLabel={cancelLabel}
        onPress={busy ? undefined : onCancel}
      />

      <View style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.confirm,
            destructive && styles.confirmDestructive,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={color.textInverse} />
              <Text style={styles.confirmText}>{busyLabel ?? confirmLabel}</Text>
            </View>
          ) : (
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18, 16, 14, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.xl,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.textPrimary },
  body: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.textSecondary },
  error: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.danger },
  confirm: {
    marginTop: space.sm,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.accent,
  },
  confirmDestructive: { backgroundColor: color.danger },
  confirmText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textInverse },
  cancel: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  cancelText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.textPrimary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
