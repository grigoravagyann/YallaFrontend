import { TableRequestClosedError, tableRequestCopy, type Booking } from '@yalla/api';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAnswerTableRequest } from '../../data/queries';
import { haptics } from '../../lib/haptics';
import { newCommandId } from '../../lib/commandId';
import { actionIcon, colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { Button } from '../Button';
import { Text } from '../Text';

/** What the card says once it has been answered, in its place. */
type Outcome =
  | { readonly kind: 'yes'; readonly freeByUtc: string }
  | { readonly kind: 'no' }
  | { readonly kind: 'closed' };

/**
 * "Someone would like your table at 19:45. Will you have left by 19:40?" — on
 * the earlier guest's own booking, with Yes and No.
 *
 * The later guest stays anonymous. Yes promises to be gone by then — recorded
 * on the booking, and the venue sees it — and confirms the later booking; No
 * keeps the table as it was booked and the later guest is told it is not free.
 * One command id per card, so a double tap or a retry after a lost answer is
 * one answer. Renders nothing when nobody is asking.
 */
export function TableRequestCard({
  booking,
  style,
}: {
  readonly booking: Booking;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const answer = useAnswerTableRequest();
  const commandId = useRef<string | null>(null);
  // A send under way: two taps in one frame both run before the mutation's
  // own pending state reaches a render.
  const sending = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failed, setFailed] = useState(false);
  const request = booking.incomingTableRequest ?? null;

  if (outcome) {
    return (
      <View style={[styles.card, styles.answered, style]} accessibilityRole="summary">
        <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.successInk} />
        <Text style={styles.answeredText} accessibilityLiveRegion="polite">
          {outcome.kind === 'yes'
            ? t('booking.tableRequest.answeredYes', {
                time: formatTime(outcome.freeByUtc, booking.timeZoneId, locale),
              })
            : outcome.kind === 'no'
              ? t('booking.tableRequest.answeredNo')
              : t('booking.tableRequest.closed')}
        </Text>
      </View>
    );
  }
  if (!request) return null;

  const question = tableRequestCopy(request, booking.timeZoneId, locale);
  const busy = answer.isPending;

  const send = (accept: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setFailed(false);
    commandId.current ??= newCommandId();
    answer.mutate(
      {
        bookingId: booking.id,
        requestId: request.requestId,
        accept,
        commandId: commandId.current,
      },
      {
        onSuccess: () => {
          haptics.success();
          setOutcome(accept ? { kind: 'yes', freeByUtc: request.freeByUtc } : { kind: 'no' });
        },
        onError: (error) => {
          sending.current = false;
          if (error instanceof TableRequestClosedError) setOutcome({ kind: 'closed' });
          else setFailed(true);
        },
      },
    );
  };

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <Ionicons name={actionIcon.table} size={iconSize.md} color={colors.warningInk} />
        <Text accessibilityRole="header" style={styles.title}>
          {t('booking.tableRequest.title')}
        </Text>
      </View>
      <Text style={styles.question}>{t(question.key, question.params)}</Text>
      <Text style={styles.answerBy}>
        {t('booking.tableRequest.answerBy', {
          time: formatTime(request.expiresAtUtc, booking.timeZoneId, locale),
        })}
      </Text>
      {failed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('booking.tableRequest.failed')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={busy ? t('booking.tableRequest.sending') : t('booking.tableRequest.yes')}
          accessibilityLabel={t('booking.tableRequest.yes')}
          disabled={busy}
          onPress={() => send(true)}
          style={styles.action}
        />
        <Button
          label={t('booking.tableRequest.no')}
          variant="secondary"
          disabled={busy}
          onPress={() => send(false)}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md + 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.warningStrong,
    backgroundColor: colors.warningSoft,
  },
  answered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderColor: colors.successStrong,
    backgroundColor: colors.successSoft,
  },
  answeredText: { ...typography.body, color: colors.successInk, flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  question: { ...typography.body, color: colors.text },
  answerBy: { ...typography.caption, color: colors.warningInk },
  error: { ...typography.body, color: colors.errorInk },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  action: { flex: 1 },
});
