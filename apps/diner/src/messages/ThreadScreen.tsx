import {
  messageFailure,
  messageText,
  messageViolations,
  newCommandId,
  UnauthorizedError,
  seenByVenue,
  type ConversationMessage,
  type ConversationSubjectKind,
  type ConversationSubjectRef,
  type DinerConversation,
  type MessageFailure,
} from '@yalla/api';
import { isOfflinePaused, useMarkReadWhenSeen } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { openUrl } from '../components/place/PlaceActions';
import { QueryErrorState } from '../components/QueryErrorState';
import { Screen } from '../components/Screen';
import { Skeleton } from '../components/Skeleton';
import { Text } from '../components/Text';
import {
  useDinerConversation,
  useMarkConversationRead,
  useScreenFocused,
  useSendGuestMessage,
} from '../data/messageQueries';
import { useBooking } from '../data/queries';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useNow } from '../hooks/useNow';
import { useSession } from '../stores/session';
import { actionIcon, colors, displayWeight, fontWeight, layout, radius, space } from '../theme';
import { AnswerBar } from './AnswerBar';
import { Composer } from './Composer';
import {
  failureHidesComposer,
  failureLine,
  lastAskId,
  messageBody,
  newArrivals,
  venueInitial,
} from './copy';
import { MessageBubble, bubbleSide } from './MessageBubble';
import { useSubjectLine, useThreadFormat } from './useThreadFormat';

/**
 * A thread with the venue — one booking's or one takeaway order's (the Thread
 * board, 2026-10-23). The routes `messages/reservation/[id]` and
 * `messages/takeaway/[id]` are this screen with their kind.
 *
 * - The header: back, the venue's initial, its name and the subject line,
 *   and Call when the venue has a number.
 * - The messages, oldest first under their day, the newest in view; read
 *   every ten seconds while this screen is in front, and marked read as they
 *   are seen.
 * - The venue's "are you coming?" still standing: the one-tap answer bar.
 * - The composer — or, once the thread has closed, the closed note; or, at a
 *   venue that takes no guest texts, "answer with the buttons or call".
 *
 * `draft`: a push's Reply that could not be sent from the lock screen opened
 * the app here with its words in the field.
 */
export function ThreadScreen({ kind }: { readonly kind: ConversationSubjectKind }) {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const subject = useMemo<ConversationSubjectRef | null>(
    () => (id ? { kind, id } : null),
    [kind, id],
  );
  const focused = useScreenFocused();
  const signedIn = useSession((state) => state.signedIn);
  const query = useDinerConversation(subject, { focused });
  const markRead = useMarkConversationRead();
  const thread = query.data;

  useMarkReadWhenSeen({
    subject,
    unread: thread?.unreadCount ?? 0,
    lastMessageId: thread?.messages.at(-1)?.id ?? null,
    active: focused && Boolean(thread),
    markRead: markRead.mutate,
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(kind === 'takeaway' ? '/(tabs)/orders' : '/(tabs)/bookings');
  };

  if (!thread || !subject) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <IconButton
            icon={actionIcon.back}
            onPress={goBack}
            accessibilityLabel={t('messages.thread.back')}
            variant="surface"
            iconColor={colors.logoInk}
            style={styles.round}
          />
        </View>
        {!signedIn || query.error instanceof UnauthorizedError ? (
          // A push's thread opened on a phone nobody is signed in on: the
          // thread is the diner's own, so the way in is to log in.
          <EmptyState
            icon={actionIcon.message}
            title={t('messages.thread.signedOut.title')}
            body={t('messages.thread.signedOut.body')}
            action={{
              label: t('messages.thread.signedOut.action'),
              onPress: () => router.push('/auth'),
            }}
          />
        ) : isOfflinePaused(query) ? (
          <QueryErrorState offline onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <ThreadSkeleton />
        ) : query.isError ? (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState
            icon={actionIcon.message}
            title={t('messages.thread.notFound.title')}
            body={t('messages.thread.notFound.body')}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Thread
        thread={thread}
        subject={subject}
        initialDraft={typeof draft === 'string' ? draft : ''}
        onBack={goBack}
        onRefresh={() => void query.refetch()}
      />
    </Screen>
  );
}

function Thread({
  thread,
  subject,
  initialDraft,
  onBack,
  onRefresh,
}: {
  readonly thread: DinerConversation;
  readonly subject: ConversationSubjectRef;
  readonly initialDraft: string;
  readonly onBack: () => void;
  readonly onRefresh: () => void;
}) {
  const { t } = useTranslation('diner');
  const insets = useSafeAreaInsets();
  // With the keyboard up the field stands on it, not on the home indicator.
  const keyboard = useKeyboardInset();
  const now = useNow(60_000);
  const format = useThreadFormat(thread.subject.branchId);
  const place = thread.subject.venueName;
  const subjectLine = useSubjectLine(thread.subject, thread.open, now);
  const send = useSendGuestMessage();
  const reservation = subject.kind === 'reservation';
  // Only for "…and your pre-order won't go to the kitchen": the booking the
  // list or the booking screen has already read, if any.
  const { data: booking } = useBooking(reservation ? subject.id : undefined);
  const [draft, setDraft] = useState(initialDraft);
  const [failure, setFailure] = useState<MessageFailure | null>(null);
  /** The venue's ask answered from here: the bar goes until the venue asks again. */
  const [answeredAsk, setAnsweredAsk] = useState<string | null | undefined>(undefined);
  /** The last text tried, and its command id: sent again unchanged, it is the same command. */
  const attempt = useRef<{ readonly text: string; readonly id: string } | null>(null);
  const scroll = useRef<ScrollView>(null);

  const blocked = failure !== null && failureHidesComposer(failure);
  const canWrite = thread.open && thread.guestsCanWrite && !blocked;
  const askId = lastAskId(thread.messages);
  const showAnswers = reservation && thread.pendingAsk && askId !== answeredAsk;

  // A screen reader hears what the venue writes as it arrives: said once, by
  // the screen, rather than a live region re-reading the whole log.
  const known = useRef<ReadonlySet<string> | null>(null);
  const lastId = thread.messages.at(-1)?.id ?? null;
  useEffect(() => {
    const before = known.current;
    known.current = new Set(thread.messages.map((message) => message.id));
    // The thread as it opened is not news: it is on the screen to be read.
    if (!before) return;
    for (const { message, previous } of newArrivals(thread.messages, before)) {
      const body = format.say(
        messageBody(message, {
          localTime: thread.subject.localTime,
          previous,
          clock: format.clock,
        }),
      );
      if (!body) continue;
      AccessibilityInfo.announceForAccessibility(
        message.author === 'venue'
          ? t('messages.a11y.venue', { place, text: body, time: format.time(message.createdAtUtc) })
          : body,
      );
    }
    // Only a new newest message is news; the rest of the thread is read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  const sendDraft = () => {
    const text = messageText(draft);
    if (messageViolations(text).length > 0) return;
    const clientCommandId = attempt.current?.text === text ? attempt.current.id : newCommandId();
    attempt.current = { text, id: clientCommandId };
    setFailure(null);
    setDraft('');
    send.mutate(
      { subject, text, clientCommandId },
      {
        onSuccess: () => {
          attempt.current = null;
        },
        onError: (error) => {
          const said = messageFailure(error);
          setFailure(said);
          // The words come back to the field, unless something new was typed.
          setDraft((current) => (current.trim() === '' ? text : current));
          if (failureHidesComposer(said)) onRefresh();
        },
      },
    );
  };

  const rows = useMemo(() => {
    const out: { key: string; node: ReactNode }[] = [];
    let lastDay: string | null = null;
    thread.messages.forEach((message, index) => {
      const day = format.day(message.createdAtUtc, now);
      if (day !== lastDay) {
        lastDay = day;
        out.push({
          key: `day:${message.id}`,
          node: (
            <Text style={styles.day} accessibilityRole="header">
              {day}
            </Text>
          ),
        });
      }
      const node = renderMessage(message, thread.messages[index - 1] ?? null);
      if (node) out.push({ key: message.id, node });
    });
    return out;

    function renderMessage(message: ConversationMessage, previous: ConversationMessage | null) {
      const body = messageBody(message, {
        localTime: thread.subject.localTime,
        previous,
        clock: format.clock,
      });
      if (!body) return null;
      const text = format.say(body);
      const side = bubbleSide(message.author);
      const time = format.time(message.createdAtUtc);
      if (side === 'system') return <MessageBubble side="system" text={text} />;
      if (side === 'venue') {
        return (
          <MessageBubble
            side="venue"
            text={text}
            ask={message.kind === 'askComing'}
            meta={t('messages.meta.venue', { place, time })}
            accessibilityLabel={t('messages.a11y.venue', { place, text, time })}
          />
        );
      }
      const meta = message.pending
        ? t('messages.meta.sending')
        : seenByVenue(message, thread.venueLastReadUtc)
          ? t('messages.meta.seen', { time })
          : t('messages.meta.sent', { time });
      return (
        <MessageBubble
          side="mine"
          text={text}
          meta={meta}
          pending={Boolean(message.pending)}
          accessibilityLabel={t('messages.a11y.mine', { text, meta })}
        />
      );
    }
  }, [thread, format, now, place, t]);

  return (
    <>
      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          onPress={onBack}
          accessibilityLabel={t('messages.thread.back')}
          variant="surface"
          iconColor={colors.logoInk}
          style={styles.round}
        />
        <View style={styles.initial} aria-hidden accessibilityElementsHidden>
          <Text display style={styles.initialText}>
            {venueInitial(place)}
          </Text>
        </View>
        <View style={styles.titles}>
          <Text numberOfLines={1} style={styles.name} accessibilityRole="header">
            {place}
          </Text>
          <Text numberOfLines={1} style={styles.subject}>
            {subjectLine}
          </Text>
        </View>
        {thread.venuePhone ? (
          <IconButton
            icon={actionIcon.call}
            onPress={() => openUrl(`tel:${thread.venuePhone}`)}
            accessibilityLabel={t('messages.thread.call')}
            variant="surface"
            iconColor={colors.logoInk}
            style={styles.round}
          />
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.log}
          keyboardShouldPersistTaps="handled"
          role="log"
          accessibilityLabel={t('messages.thread.log')}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>
              {t(reservation ? 'messages.thread.empty' : 'messages.thread.emptyTakeaway', {
                place,
              })}
            </Text>
          ) : (
            rows.map((row) => <View key={row.key}>{row.node}</View>)
          )}
        </ScrollView>

        {showAnswers ? (
          <AnswerBar
            reservationId={subject.id}
            zone={format.zone}
            withPreOrder={Boolean(booking?.preOrder)}
            onAnswered={() => setAnsweredAsk(askId)}
          />
        ) : null}

        {failure && !blocked ? (
          <Text style={styles.error} accessibilityRole="alert">
            {(() => {
              const copy = failureLine(failure);
              return copy.params ? t(copy.key, copy.params) : t(copy.key);
            })()}
          </Text>
        ) : null}

        {canWrite ? (
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={sendDraft}
            place={place}
            busy={send.isPending}
            bottomInset={keyboard > 0 ? 0 : insets.bottom}
          />
        ) : (
          <View
            style={[styles.note, { marginBottom: space.lg + insets.bottom }]}
            role="status"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.noteText}>
              {!thread.open || failure?.kind === 'closed'
                ? t(reservation ? 'messages.thread.closed' : 'messages.thread.closedTakeaway')
                : t('messages.thread.noWrite', { place })}
            </Text>
            {thread.venuePhone ? (
              <Text
                style={styles.noteLink}
                accessibilityRole="link"
                onPress={() => openUrl(`tel:${thread.venuePhone}`)}
              >
                {t('messages.thread.callVenue')}
              </Text>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

function ThreadSkeleton() {
  return (
    <View style={styles.log}>
      <Skeleton width="55%" height={44} borderRadius={radius.card} />
      <Skeleton width="62%" height={60} borderRadius={radius.card} style={styles.skeletonMine} />
      <Skeleton width="48%" height={44} borderRadius={radius.card} />
    </View>
  );
}

const INITIAL = 40;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  round: { borderColor: colors.logoInk },
  initial: {
    width: INITIAL,
    height: INITIAL,
    borderRadius: INITIAL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  initialText: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: displayWeight.semibold,
    color: colors.onPrimary,
  },
  titles: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.bold, color: colors.text },
  subject: { fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
  log: {
    gap: space.sm + 2,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md + 2,
  },
  day: {
    alignSelf: 'center',
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.small + 2,
    overflow: 'hidden',
    backgroundColor: colors.dayChip,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.xl,
    paddingHorizontal: space.lg,
  },
  error: {
    marginHorizontal: layout.screenPadding,
    marginTop: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.tile,
    overflow: 'hidden',
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.errorInk,
    backgroundColor: colors.errorSoft,
  },
  note: {
    marginHorizontal: layout.screenPadding,
    marginTop: space.sm + 2,
    padding: space.md,
    borderRadius: radius.tile,
    backgroundColor: colors.dayChip,
    gap: space.xs,
  },
  noteText: { fontSize: 13.5, lineHeight: 20, color: colors.text },
  noteLink: {
    alignSelf: 'flex-start',
    minHeight: layout.touchTarget,
    textAlignVertical: 'center',
    paddingVertical: space.sm + 2,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  skeletonMine: { alignSelf: 'flex-end' },
});
