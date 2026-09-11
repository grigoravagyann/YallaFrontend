import type { Booking } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useJoinByCode } from '../hooks/useJoinByCode';
import { useNow } from '../hooks/useNow';
import { canOpenTabForBooking } from '../lib/bookingActions';

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
export function AtMyTableAction({ booking }: { readonly booking: Booking }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const now = useNow(30_000);
  const { enter, failure, isWorking } = useJoinByCode({
    at: { timeZoneId: booking.timeZoneId, locale },
  });

  // Hidden, not disabled: on a cancelled or finished booking there is nothing
  // to explain and no tap that could ever work.
  if (!canOpenTabForBooking(booking, now)) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>{t('booking.atTable.hint')}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isWorking, busy: isWorking }}
        disabled={isWorking}
        onPress={() => void enter({ kind: 'booking', code: booking.code })}
        style={({ pressed }) => [
          styles.primary,
          pressed && styles.pressed,
          isWorking && styles.busy,
        ]}
      >
        <Text style={styles.primaryText}>
          {isWorking ? t('booking.atTable.working') : t('booking.atTable.action')}
        </Text>
      </Pressable>

      {/* Each refusal as its own sentence, with the branch's own time in the
          one that has a time to give. */}
      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t(failure.key, failure.params ?? {})}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  hint: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  primary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  pressed: { backgroundColor: color.primaryPressed },
  busy: { opacity: 0.6 },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  error: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.danger },
});
