import { RUNNING_LATE_MINUTES, onMyWayFailureLine } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useConfirmOnMyWay, useReportRunningLate } from '../data/preOrderQueries';
import { useCancelBooking } from '../data/queries';
import { colors, fontWeight, layout, radius, space } from '../theme';

type Mode = 'main' | 'late' | 'no';

/**
 * The guest's one-tap answer to the venue's "are you coming?" (the Thread
 * board, 2026-10-23), above the composer while the ask stands:
 *
 * - "I'm coming" — the existing on-my-way;
 * - "Running late" opens 10 / 15 / 30 min — the existing running-late;
 * - "Not coming" asks first, in place ("The booking will be cancelled…") —
 *   the ordinary cancel.
 *
 * Each writes the answer and the system's line into the thread on the server,
 * and the thread is read again (`afterGuestAnswered`). The bar goes on
 * success; a refusal says why and keeps it.
 */
export function AnswerBar({
  reservationId,
  zone,
  withPreOrder,
  onAnswered,
}: {
  readonly reservationId: string;
  /** The branch's zone, for "opens at 19:00" in a refusal. */
  readonly zone: string;
  /** "…and your pre-order won't go to the kitchen." */
  readonly withPreOrder: boolean;
  readonly onAnswered: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const confirm = useConfirmOnMyWay();
  const late = useReportRunningLate();
  const cancel = useCancelBooking();
  const [mode, setMode] = useState<Mode>('main');
  const busy = confirm.isPending || late.isPending || cancel.isPending;

  const reset = () => {
    confirm.reset();
    late.reset();
    cancel.reset();
  };
  const choose = (next: Mode) => {
    reset();
    setMode(next);
  };

  const refusal = (error: unknown) => {
    const copy = onMyWayFailureLine(error, zone, locale);
    return t(copy.key, copy.params);
  };
  const failure = confirm.isError
    ? refusal(confirm.error)
    : late.isError
      ? refusal(late.error)
      : cancel.isError
        ? t('bookings.detail.cancelFailed')
        : null;

  return (
    <View style={styles.bar} accessibilityLabel={t('messages.bar.label')} role="group">
      <Text style={styles.title} accessibilityRole="header">
        {t('messages.bar.title')}
      </Text>
      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {failure}
        </Text>
      ) : null}

      {mode === 'main' ? (
        <View style={styles.row}>
          <BarButton
            label={confirm.isPending ? t('messages.bar.sending') : t('messages.bar.coming')}
            tone="primary"
            disabled={busy}
            onPress={() => {
              reset();
              confirm.mutate(reservationId, { onSuccess: onAnswered });
            }}
          />
          <BarButton
            label={t('messages.bar.late')}
            tone="outline"
            disabled={busy}
            expanded={false}
            onPress={() => choose('late')}
          />
          <BarButton
            label={t('messages.bar.notComing')}
            tone="danger"
            disabled={busy}
            onPress={() => choose('no')}
          />
        </View>
      ) : null}

      {mode === 'late' ? (
        <View style={styles.row} role="group" accessibilityLabel={t('messages.bar.lateGroup')}>
          {RUNNING_LATE_MINUTES.map((minutes) => (
            <BarButton
              key={minutes}
              label={t('messages.bar.minutes', { minutes })}
              accessibilityLabel={t('messages.answer.late', { minutes })}
              tone="outline"
              disabled={busy}
              onPress={() => {
                reset();
                late.mutate({ reservationId, minutes }, { onSuccess: onAnswered });
              }}
            />
          ))}
          <BarButton
            label={t('messages.bar.back')}
            tone="quiet"
            disabled={busy}
            onPress={() => choose('main')}
          />
        </View>
      ) : null}

      {mode === 'no' ? (
        <>
          <Text style={styles.body}>
            {t(withPreOrder ? 'messages.bar.noBody' : 'messages.bar.noBodyPlain')}
          </Text>
          <View style={styles.row}>
            <BarButton
              label={t('messages.bar.keep')}
              tone="outline"
              disabled={busy}
              onPress={() => choose('main')}
            />
            <BarButton
              label={cancel.isPending ? t('messages.bar.cancelling') : t('messages.bar.confirm')}
              tone="dangerSolid"
              disabled={busy}
              onPress={() => {
                cancel.reset();
                cancel.mutate(reservationId, { onSuccess: onAnswered });
              }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

type Tone = 'primary' | 'outline' | 'danger' | 'dangerSolid' | 'quiet';

function BarButton({
  label,
  tone,
  disabled,
  expanded,
  accessibilityLabel,
  onPress,
}: {
  readonly label: string;
  readonly tone: Tone;
  readonly disabled: boolean;
  /** A button that opens more choices says whether they are open. */
  readonly expanded?: boolean;
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        toneStyles[tone],
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={[styles.label, labelStyles[tone]]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.unreadTint,
  },
  title: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold, color: colors.text },
  body: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  error: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.errorInk,
    padding: space.sm,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.errorSoft,
  },
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    flex: 1,
    minWidth: 0,
    height: layout.controlHeight,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  label: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.bold },
});

const toneStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brand },
  outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.logoInk },
  danger: { backgroundColor: colors.errorSoft },
  dangerSolid: { backgroundColor: colors.errorStrong },
  quiet: { backgroundColor: 'transparent' },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onPrimary },
  outline: { color: colors.text },
  danger: { color: colors.errorInk },
  dangerSolid: { color: colors.onErrorStrong },
  quiet: { color: colors.textMuted },
});
