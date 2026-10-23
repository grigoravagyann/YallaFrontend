import { Ionicons } from '@expo/vector-icons';
import { onMyWayFailureLine, type ConversationSubjectRef } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../components/Text';
import { useDinerConversation, useScreenFocused } from '../data/messageQueries';
import { useConfirmOnMyWay } from '../data/preOrderQueries';
import { actionIcon, colors, fontWeight, iconSize, layout, radius, space } from '../theme';
import { lastAskId, messageBody, threadRoute } from './copy';
import { MessageBubble, bubbleSide } from './MessageBubble';
import { useThreadFormat } from './useThreadFormat';

/**
 * "Messages with the venue" — the card on the booking screen and on a
 * takeaway order's status screen (the Booking board, 2026-10-23).
 *
 * The newest message, "1 new" while the venue's words are unread, and the way
 * in. While the venue's "are you coming?" stands: "I'm coming" in one tap
 * (the existing on-my-way) beside "Reply". Then "Open the conversation", or
 * "Write to the venue" before anybody has. Under it, who reads these and
 * when the thread closes.
 *
 * Reads the thread itself — every ten seconds while its screen is in front,
 * as the thread does — and renders nothing for a subject with no thread that
 * can no longer have one.
 */
export function MessagesCard({
  subject,
  style,
}: {
  readonly subject: ConversationSubjectRef;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const focused = useScreenFocused();
  const { data: thread } = useDinerConversation(subject, { focused });
  const format = useThreadFormat(thread?.subject.branchId);
  const confirm = useConfirmOnMyWay();
  /** The ask answered from this card: its buttons go until the venue asks again. */
  const [answeredAsk, setAnsweredAsk] = useState<string | null | undefined>(undefined);

  if (!thread) return null;
  const messages = thread.messages;
  if (messages.length === 0 && !thread.open) return null;

  const place = thread.subject.venueName;
  const reservation = subject.kind === 'reservation';
  const unread = thread.unreadCount;
  const askId = lastAskId(messages);
  const asking = reservation && thread.pendingAsk && askId !== answeredAsk;
  const open = () => router.push(threadRoute(subject));

  const last = messages.at(-1) ?? null;
  const lastBody = last
    ? messageBody(last, {
        localTime: thread.subject.localTime,
        previous: messages.at(-2) ?? null,
        clock: format.clock,
      })
    : null;
  const lastSide = last ? bubbleSide(last.author) : null;
  const lastMeta =
    last && lastSide !== 'system'
      ? lastSide === 'venue'
        ? t('messages.meta.venue', { place, time: format.time(last.createdAtUtc) })
        : t('messages.meta.mine', { time: format.time(last.createdAtUtc) })
      : null;

  const failure = confirm.isError
    ? (() => {
        const copy = onMyWayFailureLine(confirm.error, format.zone, locale);
        return t(copy.key, copy.params);
      })()
    : null;

  return (
    <View
      style={[styles.card, (unread > 0 || asking) && styles.cardLoud, style]}
      role="region"
      accessibilityLabel={t('messages.card.title')}
    >
      <View style={styles.head}>
        <Ionicons name={actionIcon.message} size={iconSize.md} color={colors.logoInk} />
        <Text style={styles.title} accessibilityRole="header">
          {t('messages.card.title')}
        </Text>
        {unread > 0 ? (
          <View style={styles.newPill}>
            <Text style={styles.newText}>{t('messages.card.new', { count: unread })}</Text>
          </View>
        ) : null}
      </View>

      {last && lastBody && lastSide ? (
        <MessageBubble
          side={lastSide}
          text={format.say(lastBody)}
          meta={lastMeta}
          ask={last.kind === 'askComing'}
          compact
          style={styles.preview}
        />
      ) : (
        <Text style={styles.none}>{t('messages.card.none')}</Text>
      )}

      {failure ? (
        <Text style={styles.error} accessibilityRole="alert">
          {failure}
        </Text>
      ) : null}

      {asking ? (
        <View style={styles.row} role="group" accessibilityLabel={t('messages.card.quick')}>
          <CardButton
            label={confirm.isPending ? t('messages.bar.sending') : t('messages.bar.coming')}
            primary
            disabled={confirm.isPending}
            onPress={() => confirm.mutate(subject.id, { onSuccess: () => setAnsweredAsk(askId) })}
          />
          <CardButton label={t('messages.card.reply')} onPress={open} />
        </View>
      ) : (
        <CardButton
          label={messages.length > 0 ? t('messages.card.open') : t('messages.card.write')}
          onPress={open}
        />
      )}

      <Text style={styles.note}>
        {thread.open
          ? t(reservation ? 'messages.card.privacy' : 'messages.card.privacyTakeaway', { place })
          : t('messages.card.closed')}
      </Text>
    </View>
  );
}

function CardButton({
  label,
  primary = false,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonOutline,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.buttonLabel, primary ? styles.labelPrimary : styles.labelOutline]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm + 2,
    padding: space.md + 2,
    borderRadius: radius.card + 2,
    borderWidth: 1,
    borderColor: colors.logoInk,
    backgroundColor: colors.surface,
  },
  // Something for the guest to read or answer: the brand's own edge, doubled.
  cardLoud: { borderWidth: 2, borderColor: colors.brand },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: fontWeight.bold, color: colors.text },
  newPill: {
    height: 24,
    paddingHorizontal: space.sm + 2,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  newText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.bold, color: colors.onPrimary },
  preview: { maxWidth: '86%' },
  none: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
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
    minHeight: layout.controlHeight,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.logoInk },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.bold },
  labelPrimary: { color: colors.onPrimary },
  labelOutline: { color: colors.text },
  note: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
});
