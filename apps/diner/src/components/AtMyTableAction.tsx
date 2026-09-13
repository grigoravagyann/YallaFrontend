import type { Booking } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useJoinByCode } from '../hooks/useJoinByCode';
import { useNow } from '../hooks/useNow';
import { canOpenTabForBooking } from '../lib/bookingActions';
import { colors, space, typography } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

/**
 * "I'm at my table", on the booking it belongs to.
 *
 * The way onto a tab for a diner who booked: before this, a booking and its
 * table's tab were unconnected — seating a reservation makes a sitting, never a
 * tab — so the only route in was the QR on the table, and the code they *had*
 * was the one code the scan could not take.
 *
 * It goes through the same `useJoinByCode` the scan screen uses, so a tab
 * opened from a booking and a tab opened from a sticker land on the same screen
 * by the same path, and a refusal is worded once. The booking supplies the
 * branch's zone, which is why a "not yet — from 19:10" here can say the hour
 * and the same refusal on the scan screen cannot.
 */
export function AtMyTableAction({
  booking,
  style,
}: {
  readonly booking: Booking;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const now = useNow(30_000);
  const { enter, failure, isWorking, verifyNeeded, verifyNumber } = useJoinByCode({
    at: { timeZoneId: booking.timeZoneId, locale },
  });

  // Hidden, not disabled: on a cancelled or finished booking there is nothing
  // to explain and no tap that could ever work.
  if (!canOpenTabForBooking(booking, now)) return null;

  return (
    <Card style={[styles.card, style]}>
      <Text style={styles.hint}>{t('booking.atTable.hint')}</Text>
      <Button
        label={isWorking ? t('booking.atTable.working') : t('booking.atTable.action')}
        disabled={isWorking}
        onPress={() => void enter({ kind: 'booking', code: booking.code })}
      />
      {/* Each refusal as its own sentence, with the branch's own time in the
          one that has a time to give. */}
      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t(failure.key, failure.params ?? {})}
        </Text>
      ) : null}
      {verifyNeeded ? (
        <Button label={t('confirm.verifyMyNumber')} variant="outline" onPress={verifyNumber} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  hint: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.error },
});
