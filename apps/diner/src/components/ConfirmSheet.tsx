import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { actionIcon, colors, layout, radius, space, typography } from '../theme';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { SheetModal } from './motion/SheetModal';
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
   * The way out leads, in the brown fill, and the confirm follows as a soft
   * red pill: cancelling a booking or leaving a tab is not an alarm, but it is
   * not the one thing the screen wants you to do either.
   */
  readonly destructive?: boolean;
  /** What is being confirmed, drawn between the title and the body — a booking's photo and line. */
  readonly summary?: ReactNode;
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
  summary,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const { t } = useTranslation('common');
  const close = t('action.close');
  const confirm = (
    <Button
      key="confirm"
      label={busy ? (busyLabel ?? confirmLabel) : confirmLabel}
      variant={destructive ? 'destructive' : 'primary'}
      size={destructive ? 'regular' : 'large'}
      disabled={busy}
      onPress={onConfirm}
      style={destructive && styles.destructive}
    />
  );
  const keep = (
    <Button
      key="keep"
      label={cancelLabel}
      variant={destructive ? 'primary' : 'text'}
      size={destructive ? 'large' : 'regular'}
      disabled={busy}
      onPress={onCancel}
    />
  );

  return (
    <SheetModal
      visible={visible}
      // The veil and Android's back button cancel rather than confirm, always,
      // and do nothing while the command is in flight.
      {...(busy ? {} : { onRequestClose: onCancel })}
      closeLabel={close}
      accessibilityLabel={title}
    >
      <View style={styles.titleRow}>
        <Text display style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        <IconButton
          icon={actionIcon.close}
          onPress={onCancel}
          accessibilityLabel={close}
          variant="ghost"
          disabled={busy}
          style={styles.close}
        />
      </View>

      {summary ? <View style={styles.summary}>{summary}</View> : null}

      <Text style={styles.body}>{body}</Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {/* When the confirm undoes something, the safe choice comes first, in the fill. */}
      <View style={styles.actions}>{destructive ? [keep, confirm] : [confirm, keep]}</View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typography.h3, fontSize: 19, color: colors.text, flex: 1 },
  close: { backgroundColor: colors.surface, borderRadius: radius.pill },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md - 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  body: { ...typography.body, fontSize: 13, color: colors.textMuted },
  error: { ...typography.body, color: colors.errorInk },
  actions: { marginTop: space.xs, gap: space.sm },
  // A soft red pill under the label, so the red still reads as a button.
  destructive: {
    minHeight: layout.touchTarget + 6,
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.pill,
  },
});
