import {
  RUNNING_LATE_MINUTES,
  canAnswerOnMyWay,
  guestAnswered,
  onMyWayFailureLine,
  onYourWayView,
  preOrderWaiting,
  venueIsAsking,
  type Booking,
} from '@yalla/api';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useConfirmOnMyWay, useReportRunningLate } from '../../data/preOrderQueries';
import { useCancelBooking } from '../../data/queries';
import { colors, fontWeight, iconSize, layout, radius, space, typography } from '../../theme';
import { Button } from '../Button';
import { InlineConfirm } from '../InlineConfirm';
import { Text } from '../Text';

/** The slice of a booking that decides whether the block shows. */
export function inComingWindow(booking: Booking, now: Date): boolean {
  return canAnswerOnMyWay({ ...booking, startUtc: booking.slotUtc }, now);
}

/**
 * "I'm coming" on the booking (2026-10-22), from two hours before the start
 * until the booking ends: the guest's three answers, and the venue's question.
 *
 * - "I'm coming" — the waiter's card says so, and a pre-order goes to the
 *   kitchen in time.
 * - "Late 10 / 15 / 30" — the venue holds the table that much longer.
 * - "Not coming" — the ordinary cancel, asked first in place.
 *
 * When the venue asked from its tablet and the guest has not answered, a
 * banner says so ("{venue} is asking: are you coming?"). An answer turns the
 * block into a green line saying what the venue now knows; a later answer may
 * still change it ("Change my answer").
 *
 * `autoConfirm`: the "on your way" push's "Yes" opened the app here, and the
 * booking has been read since; decided once, on that read.
 *
 * `askedInThread`: the venue's question is a message in the booking's thread
 * (2026-10-23), shown with its own "I'm coming" on the messages card — the
 * banner here would say it twice.
 */
export function ImComingCard({
  booking,
  now,
  place,
  autoConfirm = false,
  askedInThread = false,
  style,
}: {
  readonly booking: Booking;
  readonly now: Date;
  /** The place's name as the screen shows it. */
  readonly place: string;
  readonly autoConfirm?: boolean;
  readonly askedInThread?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const confirm = useConfirmOnMyWay();
  const late = useReportRunningLate();
  const cancel = useCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  /** Cancelled from this block: its own "Booking cancelled" line, once the booking says so. */
  const [cancelledHere, setCancelledHere] = useState(false);
  const decided = useRef(false);

  const open = inComingWindow(booking, now);
  const answered = guestAnswered(booking);
  const asking = venueIsAsking(booking);
  const withPreOrder = preOrderWaiting(booking.preOrder) || booking.preOrder?.state === 'sent';
  const busy = confirm.isPending || late.isPending;
  const time = (utc: string) => formatTime(utc, booking.timeZoneId, locale);

  useEffect(() => {
    if (!autoConfirm || decided.current) return;
    decided.current = true;
    // The push asked "are you on your way?" of the booking as it was then;
    // only while that question still stands is its "Yes" sent (a booking
    // moved since is the guest's to answer on screen).
    if (onYourWayView({ ...booking, startUtc: booking.slotUtc }, now) === 'ask') {
      confirm.mutate(booking.id);
    }
  }, [autoConfirm, booking, now, confirm]);

  if (cancelledHere && booking.status === 'cancelledByDiner') {
    return (
      <View
        style={[styles.told, style]}
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.toldTitle}>{t('coming.notComingTitle')}</Text>
        <Text style={styles.toldBody}>{t('coming.notComingBody')}</Text>
      </View>
    );
  }
  if (!open) return null;

  const failure = confirm.isError
    ? onMyWayFailureLine(confirm.error, booking.timeZoneId, locale, now)
    : late.isError
      ? onMyWayFailureLine(late.error, booking.timeZoneId, locale, now)
      : null;

  const sayComing = () => {
    late.reset();
    confirm.mutate(booking.id, { onSuccess: () => setChanging(false) });
  };
  const sayLate = (minutes: (typeof RUNNING_LATE_MINUTES)[number]) => {
    confirm.reset();
    late.mutate({ reservationId: booking.id, minutes }, { onSuccess: () => setChanging(false) });
  };
  const notComing = () =>
    cancel.mutate(booking.id, {
      onSuccess: () => {
        setCancelledHere(true);
        setConfirming(false);
      },
    });

  const lateMinutes = booking.guestRunningLateMinutes ?? null;
  const toldLine =
    answered && lateMinutes != null
      ? {
          title: t('coming.lateTitle', { minutes: lateMinutes }),
          body: t('coming.lateBody', {
            time: time(new Date(Date.parse(booking.slotUtc) + lateMinutes * 60_000).toISOString()),
          }),
        }
      : answered && booking.guestConfirmedOnWayAtUtc
        ? {
            title: t('coming.comingTitle'),
            body: t('coming.comingBody', { time: time(booking.guestConfirmedOnWayAtUtc) }),
          }
        : null;
  const showButtons = (!toldLine || changing) && !confirming;

  return (
    <View style={[styles.block, style]}>
      {asking && !answered && !askedInThread && booking.staffAskedOnMyWayAtUtc ? (
        <View style={styles.asked} accessibilityRole="alert">
          <Text style={styles.askedTitle}>{t('coming.askedTitle', { place })}</Text>
          <Text style={styles.askedBody}>
            {t(withPreOrder ? 'coming.askedBody' : 'coming.askedBodyPlain', {
              time: time(booking.staffAskedOnMyWayAtUtc),
            })}
          </Text>
        </View>
      ) : null}

      {toldLine ? (
        <View style={styles.told} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <View style={styles.toldRow}>
            <Ionicons
              name="checkmark-circle-outline"
              size={iconSize.md}
              color={colors.successInk}
            />
            <View style={styles.toldText}>
              <Text style={styles.toldTitle}>{toldLine.title}</Text>
              <Text style={styles.toldBody}>{toldLine.body}</Text>
            </View>
          </View>
          {!changing && !confirming ? (
            <Button
              label={t('coming.change')}
              variant="text"
              fullWidth={false}
              onPress={() => setChanging(true)}
              style={styles.change}
            />
          ) : null}
        </View>
      ) : null}

      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t(failure.key, failure.params)}
        </Text>
      ) : null}

      {showButtons ? (
        <>
          <Button
            label={confirm.isPending ? t('coming.sending') : t('coming.imComing')}
            icon="navigate-outline"
            size="large"
            busy={confirm.isPending}
            disabled={busy}
            onPress={sayComing}
          />
          <Text style={styles.helper}>
            {t(withPreOrder ? 'coming.helper' : 'coming.helperPlain')}
          </Text>
          <View style={styles.lateRow} role="group" accessibilityLabel={t('coming.lateGroup')}>
            {RUNNING_LATE_MINUTES.map((minutes) => (
              <Button
                key={minutes}
                label={t('coming.late', { minutes })}
                variant="outline"
                fullWidth={false}
                disabled={busy}
                busy={late.isPending && late.variables?.minutes === minutes}
                onPress={() => sayLate(minutes)}
                style={styles.lateButton}
              />
            ))}
          </View>
          <Button
            label={t('coming.notComing')}
            variant="destructive"
            disabled={busy}
            onPress={() => {
              cancel.reset();
              setConfirming(true);
            }}
            style={styles.notComing}
          />
        </>
      ) : null}

      {confirming ? (
        <InlineConfirm
          title={t('coming.confirmTitle')}
          body={t(withPreOrder ? 'coming.confirmBody' : 'coming.confirmBodyPlain')}
          confirmLabel={t('coming.confirmYes')}
          keepLabel={t('coming.confirmKeep')}
          busyLabel={t('coming.cancelling')}
          busy={cancel.isPending}
          error={cancel.isError ? t('bookings.detail.cancelFailed') : null}
          onConfirm={notComing}
          onKeep={() => setConfirming(false)}
        />
      ) : null}

      {booking.preOrder ? (
        <Text style={styles.preOrder}>
          {t(answered ? 'coming.preOrderGoing' : 'coming.preOrderWaiting')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm + 2 },
  asked: {
    gap: space.xs,
    padding: space.md + 2,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  askedTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold, color: colors.text },
  askedBody: { ...typography.body, color: colors.textMuted },
  told: {
    gap: space.xs,
    padding: space.md + 2,
    borderRadius: radius.card,
    backgroundColor: colors.successSoft,
  },
  toldRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  toldText: { flex: 1, gap: space.xs },
  toldTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
    color: colors.successInk,
  },
  toldBody: { ...typography.body, color: colors.successInk },
  change: { alignSelf: 'flex-start' },
  helper: { ...typography.caption, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  lateRow: { flexDirection: 'row', gap: space.sm },
  lateButton: {
    flex: 1,
    paddingHorizontal: space.sm,
    minHeight: layout.controlHeight,
    borderColor: colors.logoInk,
  },
  notComing: { minHeight: layout.controlHeight, backgroundColor: colors.errorSoft },
  preOrder: { ...typography.caption, fontSize: 13, color: colors.textMuted },
  error: {
    ...typography.caption,
    color: colors.errorInk,
    padding: space.sm,
    borderRadius: radius.tile,
    backgroundColor: colors.errorSoft,
    overflow: 'hidden',
  },
});
