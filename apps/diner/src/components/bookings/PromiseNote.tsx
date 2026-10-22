import type { Booking, CopyLine } from '@yalla/api';
import { formatTime, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { actionIcon, colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { Text } from '../Text';

/** The booking states a promise still binds: not one that is over or cancelled. */
const LIVE: ReadonlySet<Booking['status']> = new Set(['pendingApproval', 'confirmed', 'seated']);

/** The promise's sentence, or `null` when there is none that still binds. */
export function promiseCopy(
  booking: Pick<Booking, 'status' | 'promisedFreeByUtc' | 'timeZoneId'>,
  locale: Locale,
): CopyLine | null {
  const promised = booking.promisedFreeByUtc ?? null;
  if (!promised || !LIVE.has(booking.status)) return null;
  return {
    key: 'booking.freeBy.promisedNote',
    params: { time: formatTime(promised, booking.timeZoneId, locale) },
  };
}

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
  const line = promiseCopy(booking, locale);
  if (!line) return null;
  return (
    <View style={[styles.note, style]}>
      <Ionicons name={actionIcon.time} size={iconSize.sm} color={colors.logoInk} />
      <Text style={styles.text}>{t(line.key, line.params)}</Text>
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
    // White, edged in the logo's burgundy, the words in charcoal: like Explore's chips.
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.logoInk,
  },
  text: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.text,
    flexShrink: 1,
  },
});
