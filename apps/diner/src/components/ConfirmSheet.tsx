import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, space, typography } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

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
  /**
   * The confirm is red text rather than the brown fill: cancelling a booking
   * or leaving a tab is not an alarm, but it is not the one thing the screen
   * wants you to do either.
   */
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
  const insets = useSafeAreaInsets();
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

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {busy ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
        <Text style={styles.body}>{body}</Text>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={busy ? (busyLabel ?? confirmLabel) : confirmLabel}
            variant={destructive ? 'destructive' : 'primary'}
            disabled={busy}
            onPress={onConfirm}
            style={destructive && styles.destructive}
          />
          <Button
            label={cancelLabel}
            variant={destructive ? 'secondary' : 'text'}
            disabled={busy}
            onPress={onCancel}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlayDark },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface,
    gap: space.sm,
    ...shadows.float,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typography.h3, color: colors.text, flexShrink: 1 },
  body: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.error },
  actions: { marginTop: space.md, gap: space.sm },
  // The red label sits on a thin neutral border so it still reads as a button.
  destructive: { borderWidth: 1, borderColor: colors.border },
});
