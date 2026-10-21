import { onMyWayFailureLine, onYourWayView, type Booking } from '@yalla/api';
import { useConfirmOnMyWay } from '../../data/preOrderQueries';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { Button } from '../Button';
import { Card } from '../Card';
import { Text } from '../Text';

/**
 * "Are you on your way?" (2026-10-21) — asked from 45 minutes before a
 * confirmed booking with a pre-order, by push, by the feed and here.
 *
 * "Yes, I'm on my way" tells the waiter, whose card then says the guest
 * confirmed, so nobody calls; the card here then says "The waiter knows".
 * "I can't come" is the ordinary cancel, with its confirmation and its rules
 * (`onCantCome` opens the booking's own cancel sheet).
 *
 * `autoConfirm`: the push's "Yes" button opened the app here (see
 * `registerCategories`), and the booking has been read since (the screen
 * passes it only then: a cached copy may be of a booking moved since the
 * push). Decided once, on that read: sent if the question is asked, and
 * never later — a question asked an hour on is the guest's to answer.
 */
export function OnYourWayCard({
  booking,
  now,
  place,
  onCantCome,
  autoConfirm = false,
  style,
}: {
  readonly booking: Booking;
  readonly now: Date;
  /** The place's name as the screen shows it. */
  readonly place: string;
  readonly onCantCome: () => void;
  readonly autoConfirm?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const confirm = useConfirmOnMyWay();
  const view = onYourWayView({ ...booking, startUtc: booking.slotUtc }, now);
  const decided = useRef(false);

  useEffect(() => {
    if (!autoConfirm || decided.current) return;
    decided.current = true;
    if (view === 'ask') confirm.mutate(booking.id);
  }, [autoConfirm, view, booking.id, confirm]);

  if (view === 'none') return null;

  if (view === 'confirmed') {
    return (
      <Card style={[styles.card, styles.confirmed, style]}>
        <View style={styles.row} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle-outline" size={iconSize.md} color={colors.successInk} />
          <View style={styles.text}>
            <Text style={[styles.title, styles.okTitle]}>
              {t('preOrder.onYourWay.confirmedTitle')}
            </Text>
            <Text style={styles.body}>{t('preOrder.onYourWay.confirmedBody')}</Text>
          </View>
        </View>
      </Card>
    );
  }

  const failure = confirm.isError
    ? onMyWayFailureLine(confirm.error, booking.timeZoneId, locale, now)
    : null;

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.row}>
        <Ionicons name="navigate-outline" size={iconSize.md} color={colors.primary} />
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            {t('preOrder.onYourWay.title')}
          </Text>
          <Text style={styles.body}>
            {t('preOrder.onYourWay.body', {
              place,
              time: formatTime(booking.slotUtc, booking.timeZoneId, locale),
            })}
          </Text>
        </View>
      </View>
      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t(failure.key, failure.params)}
        </Text>
      ) : null}
      <Button
        label={confirm.isPending ? t('preOrder.onYourWay.sending') : t('preOrder.onYourWay.yes')}
        busy={confirm.isPending}
        disabled={confirm.isPending}
        onPress={() => confirm.mutate(booking.id)}
      />
      <Button
        label={t('preOrder.onYourWay.cantCome')}
        variant="secondary"
        disabled={confirm.isPending}
        onPress={onCantCome}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, borderWidth: 2, borderColor: colors.primary },
  confirmed: { borderColor: colors.success, backgroundColor: colors.successSoft },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  text: { flex: 1, gap: space.xs },
  title: { ...typography.h3, color: colors.text },
  okTitle: { color: colors.successInk, fontWeight: fontWeight.bold },
  body: { ...typography.body, color: colors.text },
  error: {
    ...typography.caption,
    color: colors.errorInk,
    padding: space.sm,
    borderRadius: radius.tile,
    backgroundColor: colors.errorSoft,
    overflow: 'hidden',
  },
});
