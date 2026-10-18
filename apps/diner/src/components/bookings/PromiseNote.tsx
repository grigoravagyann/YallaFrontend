import type { Booking } from '@yalla/api';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { actionIcon, colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { Text } from '../Text';

/** The booking states a promise still binds: not one that is over or cancelled. */
const LIVE: ReadonlySet<Booking['status']> = new Set(['pendingApproval', 'confirmed', 'seated']);

/**
 * "You said you'll leave by 19:40 — the table is booked after you": the
 * earlier guest's own Yes to a later guest's request, said on their booking
 * for as long as it binds them.
 *
 * Read from the booking (`promisedFreeByUtc`), not from the answer just given:
 * the card's thank-you is gone after a reload, and "Until 19:40" alone did not
 * say why the sitting had become shorter, or that somebody follows.
 */
export function PromiseNote({
  booking,
  style,
}: {
  readonly booking: Pick<Booking, 'status' | 'promisedFreeByUtc' | 'timeZoneId'>;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const promised = booking.promisedFreeByUtc ?? null;
  if (!promised || !LIVE.has(booking.status)) return null;
  return (
    <View style={[styles.note, style]}>
      <Ionicons name={actionIcon.time} size={iconSize.sm} color={colors.infoInk} />
      <Text style={styles.text}>
        {t('booking.freeBy.promisedNote', {
          time: formatTime(promised, booking.timeZoneId, locale),
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.infoSoft,
  },
  text: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.infoInk,
    flexShrink: 1,
  },
});
