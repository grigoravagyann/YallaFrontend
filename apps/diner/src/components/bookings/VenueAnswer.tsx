import {
  approvalCountdown,
  awaitsVenueAnswer,
  venueAnswerCopy,
  type Booking,
  type CopyLine,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNow } from '../../hooks/useNow';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../theme';
import { Text } from '../Text';

/** What a booking needs for the venue's answer to be read off it. */
export type VenueAnswerBooking = Pick<
  Booking,
  'status' | 'approvalExpiresAtUtc' | 'declinedBecause' | 'awaitingApprovalBecause'
>;

export interface VenueAnswer {
  /** The sentence, or `null` when there is nothing to say. */
  readonly line: CopyLine | null;
  /** Still waiting, with the clock running. */
  readonly waiting: boolean;
  /** Under two minutes left. */
  readonly urgent: boolean;
  /** The venue declined it — by a person, or for want of an answer. */
  readonly declined: boolean;
}

/**
 * The venue's answer to a booking, ticking each second while it is awaited.
 *
 * A short-notice booking waits for the floor, which has fifteen minutes to
 * say yes; the diner sees the minutes go. Once it is decided the line says
 * which way — and, when nobody answered, sorry. The clock is the diner's own
 * against the server's instant: nothing is decided here, and the screen's next
 * read (a push, or the poll while waiting) brings the real answer.
 */
export function useVenueAnswer(booking: VenueAnswerBooking): VenueAnswer {
  const waiting = awaitsVenueAnswer(booking);
  // Each second while the clock runs; slowly otherwise, when nothing here moves.
  const now = useNow(waiting ? 1000 : 30_000);
  const countdown = waiting ? approvalCountdown(booking.approvalExpiresAtUtc, now) : null;
  return {
    line: venueAnswerCopy(booking, now),
    waiting,
    urgent: countdown?.urgent ?? false,
    declined: Boolean(booking.declinedBecause),
  };
}

/**
 * "Waiting for the venue · answer within 12:41", or why it was declined: a
 * soft note in the booking's own card. Renders nothing for a booking with
 * nothing to say — confirmed, or waiting without a clock.
 */
export function VenueAnswerNote({
  booking,
  style,
}: {
  readonly booking: VenueAnswerBooking;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const answer = useVenueAnswer(booking);
  if (!answer.line) return null;

  const ink = answer.declined
    ? colors.errorInk
    : answer.urgent
      ? colors.warningInk
      : colors.infoInk;
  return (
    <View
      style={[
        styles.note,
        answer.declined ? styles.declined : answer.urgent ? styles.urgent : styles.waiting,
        style,
      ]}
    >
      <Ionicons
        name={answer.declined ? actionIcon.error : actionIcon.time}
        size={iconSize.sm}
        color={ink}
      />
      <Text style={[styles.text, { color: ink }]}>{t(answer.line.key, answer.line.params)}</Text>
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
  },
  waiting: { backgroundColor: colors.infoSoft },
  urgent: { backgroundColor: colors.warningSoft },
  declined: { backgroundColor: colors.errorSoft },
  text: {
    ...typography.body,
    ...tabularNumbers,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
  },
});
