import { freeCancellationCopy, type Booking } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { AtMyTableAction } from '../../src/components/AtMyTableAction';
import { BookingBadge, NoShowBlockReason } from '../../src/components/bookings/BookingCard';
import {
  bookingShareLine,
  sittingEndLines,
  bookedByTime,
  tableLine,
} from '../../src/components/bookings/bookingText';
import { anotherTimeRoute, changeBookingRoute } from '../../src/components/bookings/changeBooking';
import { ImComingCard, inComingWindow } from '../../src/components/bookings/ImComingCard';
import { OnYourWayCard } from '../../src/components/bookings/OnYourWayCard';
import { PreOrderCard } from '../../src/components/bookings/PreOrderCard';
import { PromiseNote } from '../../src/components/bookings/PromiseNote';
import { TableRequestCard } from '../../src/components/bookings/TableRequestCard';
import { VenueAnswerNote } from '../../src/components/bookings/VenueAnswer';
import { useCanChangeBooking } from '../../src/components/bookings/useCanChangeBooking';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { IconButton } from '../../src/components/IconButton';
import { PhotoImage } from '../../src/components/PhotoImage';
import { QueryErrorState } from '../../src/components/QueryErrorState';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useDinerConversation } from '../../src/data/messageQueries';
import { useBooking, useCancelBooking } from '../../src/data/queries';
import { useNow } from '../../src/hooks/useNow';
import { canCancel } from '../../src/lib/bookingActions';
import { MessagesCard } from '../../src/messages/MessagesCard';
import { usePlace } from '../../src/places/hooks';
import { KeepTableAction } from '../../src/push/ReservationActions';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  placeTypeIcon,
  radius,
  space,
  tabularNumbers,
  typography,
  type IoniconName,
} from '../../src/theme';

const THUMB = 64;

/**
 * One booking, from the diner's own bookings on the server.
 *
 * Where every reservation notification lands. It used to read the in-memory
 * mock even against a real backend, so a push for a real booking opened a
 * spinner that never stopped, and the actions on it never rendered.
 */
export default function BookingDetailScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  // `answer` and `requestId`: a lock-screen Yes or No to a table request,
  // which opened the app here for the card to send (see `registerCategories`).
  // `onMyWay`: the "on your way" push's Yes or Can't come, which opened the
  // app here; the booking's own card sends the Yes, the cancel sheet asks first.
  const { bookingId, answer, requestId, onMyWay } = useLocalSearchParams<{
    bookingId: string;
    answer?: string;
    requestId?: string;
    onMyWay?: string;
  }>();
  const autoAnswer =
    requestId && (answer === 'yes' || answer === 'no')
      ? { requestId, accept: answer === 'yes' }
      : undefined;
  const bookingQuery = useBooking(bookingId);
  const { data: booking, isLoading, isError, error, refetch } = bookingQuery;
  // The "on your way" push's Yes is sent only from a booking read since
  // landing: the cached copy may be of a booking moved on the web since the
  // push, and its 19:00 question must not answer for 19:30. Read at once,
  // joining a read already under way.
  const landedOnYes = onMyWay === 'yes';
  useEffect(() => {
    if (landedOnYes) void refetch({ cancelRefetch: false });
  }, [landedOnYes, refetch]);
  const readSinceLanding = bookingQuery.isFetchedAfterMount && !bookingQuery.isFetching;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/bookings');
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
      />
      <Text numberOfLines={1} style={styles.headerTitle} accessibilityRole="header">
        {t('bookings.detail.title')}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!booking) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        {isOfflinePaused(bookingQuery) ? (
          <QueryErrorState offline onRetry={() => void refetch()} />
        ) : isLoading ? (
          <DetailSkeleton />
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <EmptyState
            icon={actionIcon.error}
            title={t('booking.notFound.title')}
            body={t('booking.notFound.body')}
            action={{
              label: t('success.viewBookings'),
              onPress: () => router.replace('/(tabs)/bookings'),
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <BookingDetail
        booking={booking}
        autoAnswer={autoAnswer}
        onMyWay={onMyWay === 'yes' || onMyWay === 'cantCome' ? onMyWay : undefined}
        readSinceLanding={readSinceLanding}
      />
    </Screen>
  );
}

function BookingDetail({
  booking,
  autoAnswer,
  onMyWay,
  readSinceLanding = false,
}: {
  readonly booking: Booking;
  readonly autoAnswer?: { readonly requestId: string; readonly accept: boolean } | undefined;
  readonly onMyWay?: 'yes' | 'cantCome' | undefined;
  /** The booking was read from the server since this screen opened. */
  readonly readSinceLanding?: boolean;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const cancel = useCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const now = useNow();
  const { data: place } = usePlace(booking.branchId);
  const changeable = useCanChangeBooking(booking, now);
  // The booking's thread with the venue (2026-10-23), when it has one or may:
  // the card below, and whether the venue's "are you coming?" is asked there.
  const messagesSubject = booking.messages
    ? { kind: 'reservation' as const, id: booking.id }
    : null;
  const { data: thread } = useDinerConversation(messagesSubject, { focused: false });
  // What the venue sees with the booking (K9).
  const note = booking.note;

  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  // The place the diner browsed when the browse data knows the branch; the
  // server's venue name otherwise.
  const where = place?.name ?? booking.venueName ?? booking.branchName;
  // What the browse data already calls a branch with a name of its own.
  const venueAndBranch = `${booking.venueName} · ${booking.branchName}`;
  const photo = place?.photos[0];
  const pending = booking.status === 'pendingApproval';
  const isCancelled =
    booking.status === 'cancelledByDiner' || booking.status === 'cancelledByVenue';
  // Declined rather than cancelled: never confirmed, and the note says why.
  const declined = Boolean(booking.declinedBecause);
  // And the booking is gone for it — not a declined change that left it standing.
  const declinedOutright = declined && booking.status === 'cancelledByVenue';
  // The server's deadline. Past it the cancellation is late — but never blocked.
  const isLate = now.getTime() > new Date(booking.freeCancellationUntilUtc).getTime();
  const cancellation = freeCancellationCopy(
    booking.freeCancellationUntilUtc,
    booking.timeZoneId,
    locale,
    now,
  );
  // "Until 19:30", and a promise to free the table beside it when that is a
  // different time (see `sittingEndLines`).
  const sittingEnd = sittingEndLines(booking, locale)
    .map((line) => t(line.key, line.params))
    .join(' · ');

  const table = tableLine(booking);
  // Made by time only: moved by cancelling and booking again, with no pre-order.
  const byTime = bookedByTime(booking);

  const share = () => {
    const line = bookingShareLine(booking, where, when);
    void Share.share({ message: t(line.key, line.params) }).catch(() => undefined);
  };

  const doCancel = () => {
    cancel.mutate(booking.id, { onSuccess: () => setConfirming(false) });
  };

  // Whatever closed the sheet, a booking that can no longer be cancelled has
  // nothing to confirm: the venue may have cancelled it while the sheet was up.
  // Closed from the mutation's own state as well as the per-call callback: the
  // sheet stayed open over a booking the server had already cancelled.
  // Reopening resets the mutation first.
  const cancellable = canCancel(booking.status);
  const sheetOpen = confirming && cancellable && !cancel.isSuccess;

  const openCancel = () => {
    cancel.reset();
    setConfirming(true);
  };
  // The push's "Can't come": the cancel question, asked once on landing.
  const askedCantCome = useRef(false);
  useEffect(() => {
    if (onMyWay !== 'cantCome' || askedCantCome.current || !cancellable) return;
    askedCantCome.current = true;
    setConfirming(true);
  }, [onMyWay, cancellable]);

  const editPreOrder = () =>
    router.push({ pathname: '/booking/[bookingId]/pre-order', params: { bookingId: booking.id } });

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.summary}>
            {photo ? (
              <PhotoImage source={photo} style={styles.thumb} accessibilityLabel={where} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Ionicons
                  name={placeTypeIcon[place?.type ?? 'restaurant']}
                  size={iconSize.lg}
                  color={colors.textSubtle}
                />
              </View>
            )}
            <View style={styles.summaryBody}>
              <Text display numberOfLines={2} style={styles.placeName}>
                {where}
              </Text>
              {where === venueAndBranch ? null : place?.name &&
                booking.venueName &&
                place.name !== booking.venueName ? (
                <Text numberOfLines={1} style={styles.detail}>
                  {venueAndBranch}
                </Text>
              ) : (
                <Text numberOfLines={1} style={styles.detail}>
                  {booking.branchName}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.summaryFooter}>
            <BookingBadge booking={booking} />
          </View>
          {/* Cancelled by the pause after three no-shows in three days, not by the venue. */}
          <NoShowBlockReason booking={booking} style={styles.answer} />
          {/* While the venue decides, the minutes it has left; once it has
              declined, why — sorry, when nobody answered in time. */}
          <VenueAnswerNote booking={booking} style={styles.answer} />
          {/* The guest's own yes to the guest after them, for as long as it binds. */}
          <PromiseNote booking={booking} style={styles.answer} />
          <View style={styles.facts}>
            {/* Booked by time only and not seated yet: the venue chooses the table on arrival. */}
            <Fact icon={actionIcon.table} text={t(table.key, table.params)} />
            <Fact icon={actionIcon.calendar} text={when} />
            <Fact
              icon={actionIcon.people}
              text={t('booking.guests', { count: booking.partySize })}
            />
            <Fact icon={actionIcon.time} text={sittingEnd} />
          </View>
        </Card>

        {/* "Messages with the venue" (2026-10-23): the newest message, "1 new",
            and the venue's "are you coming?" answered in one tap. */}
        {messagesSubject ? <MessagesCard subject={messagesSubject} /> : null}

        {/* From two hours before until the end (2026-10-22): "I'm coming",
            "Late 10 / 15 / 30" and "Not coming", and the venue's question —
            unless the messages card above is already asking it. */}
        <ImComingCard
          booking={booking}
          now={now}
          place={where}
          autoConfirm={onMyWay === 'yes' && readSinceLanding}
          askedInThread={Boolean(thread?.pendingAsk)}
        />
        {/* Outside that window (a server that opens it later): the older
            "Are you on your way?" card, where it still applies. */}
        {inComingWindow(booking, now) ? null : (
          <OnYourWayCard
            booking={booking}
            now={now}
            place={where}
            onCantCome={openCancel}
            autoConfirm={onMyWay === 'yes' && readSinceLanding}
          />
        )}

        {/* Somebody would like this table after the diner: will they have left by then? */}
        <TableRequestCard booking={booking} autoAnswer={autoAnswer} />

        {/*
          The way onto the tab at the table they booked. Offered while the
          booking could still open one; the server owns the exact instant the
          table starts being held, and says it when a diner is early.
        */}
        <AtMyTableAction booking={booking} />

        {/*
          "Keep my table", decided from this booking's state now: only once its
          time has come and before it ends. Renders nothing otherwise.
        */}
        <KeepTableAction booking={booking} />

        {/* Large and legible: staff ask for this at the door. Pending must never
            look confirmed — a dashed burgundy edge instead of the solid green. */}
        <Card
          style={[
            styles.codeCard,
            pending && styles.codeCardPending,
            isCancelled && styles.codeCardCancelled,
          ]}
        >
          <Text style={styles.codeLabel}>{t('success.codeLabel')}</Text>
          <Text
            style={[styles.code, isCancelled && styles.codeCancelled]}
            accessibilityLabel={booking.code.split('').join(' ')}
          >
            {booking.code}
          </Text>
          {/* A cancelled code opens no table: never "show this at the door" (QA B7).
              A declined one was never confirmed: not "cancelled" either. */}
          <Text style={styles.codeHint}>
            {declinedOutright
              ? t('bookings.detail.codeDeclined')
              : isCancelled
                ? t('bookings.detail.codeCancelled')
                : t('success.codeHint')}
          </Text>
        </Card>

        {/* The dishes chosen ahead, or the offer to choose them (2026-10-21) —
            never by time only, whose booking has no table for the ticket. */}
        {byTime ? null : <PreOrderCard booking={booking} now={now} onEdit={editPreOrder} />}

        {note ? (
          <Card style={styles.noteCard}>
            <SectionHeader
              label={t(byTime ? 'book.byTime.wishTitle' : 'booking.note.title')}
              icon={actionIcon.note}
            />
            <Text style={styles.note}>{note}</Text>
          </Card>
        ) : null}

        {isCancelled && !declined ? (
          <Text style={styles.cancellation}>
            {t('bookings.detail.cancelledOn', {
              date: formatDate(
                booking.cancelledAtUtc ?? booking.slotUtc,
                booking.timeZoneId,
                locale,
              ),
            })}
          </Text>
        ) : canCancel(booking.status) ? (
          <Text style={styles.cancellation}>{t(cancellation.key, cancellation.params)}</Text>
        ) : null}
        {/* No Change by time only: the booking holds no table to move. */}
        {byTime && cancellable ? (
          <Text style={styles.cancellation}>{t('booking.byTime.noChange')}</Text>
        ) : null}

        <View style={styles.actions}>
          {/* Declined — by the venue, or for the guest before — is not the end:
              the same place, day and party, and a time chosen again. */}
          {declinedOutright ? (
            <Button
              label={t('bookings.detail.chooseAnotherTime')}
              icon={actionIcon.time}
              onPress={() => router.push(anotherTimeRoute(booking))}
            />
          ) : null}
          {/* Moves this booking — same code — while the server would still
              accept it and its own time can still be chosen: waiting or
              confirmed, and not yet inside the branch's lead time. */}
          {changeable ? (
            <Button
              label={t('bookings.change')}
              variant="secondary"
              icon="pencil-outline"
              onPress={() => router.push(changeBookingRoute(booking))}
            />
          ) : null}
          <Button
            label={t('success.share')}
            variant="secondary"
            icon={actionIcon.share}
            onPress={share}
          />
          {/* One cancel, and only while the booking still holds a table — what
              the server will accept. */}
          {cancellable ? (
            <Button
              label={t('bookings.detail.cancel')}
              variant="destructive"
              onPress={openCancel}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* One tap plus a confirmation step — cancelling a table by accident is
          worse than one extra tap. Never blocks a late cancellation, and does
          not scold: a late cancel is far better for the venue than a no-show. */}
      <ConfirmSheet
        visible={sheetOpen}
        title={t('bookings.detail.cancelTitle')}
        body={isLate ? t('bookings.detail.cancelLate') : t('bookings.detail.cancelFree')}
        confirmLabel={t('bookings.detail.cancelConfirm')}
        cancelLabel={t('bookings.detail.cancelKeep')}
        busyLabel={t('bookings.detail.cancelling')}
        busy={cancel.isPending}
        error={cancel.isError ? t('bookings.detail.cancelFailed') : null}
        destructive
        onConfirm={doCancel}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function Fact({ icon, text }: { readonly icon: IoniconName; readonly text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={iconSize.sm} color={colors.primary} />
      <Text numberOfLines={1} style={styles.factText}>
        {text}
      </Text>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View style={styles.body}>
      <Card>
        <View style={styles.summary}>
          <Skeleton width={THUMB} height={THUMB} borderRadius={radius.chip} />
          <View style={[styles.summaryBody, styles.skeletonGap]}>
            <Skeleton width="70%" height={22} />
            <Skeleton width="45%" height={14} />
          </View>
        </View>
        <View style={[styles.facts, styles.skeletonGap]}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="60%" height={14} />
          <Skeleton width="35%" height={14} />
        </View>
      </Card>
      <Card style={styles.codeCard}>
        <Skeleton width="30%" height={14} />
        <Skeleton width="60%" height={44} style={styles.skeletonCode} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  headerTitle: { ...typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  headerSpacer: { width: layout.touchTarget },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: layout.cardGap,
  },
  summary: { flexDirection: 'row', gap: space.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.chip },
  thumbFallback: {
    backgroundColor: colors.skeleton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBody: { flex: 1, gap: 2 },
  placeName: { ...typography.heading, color: colors.text },
  detail: { ...typography.body, color: colors.textMuted },
  summaryFooter: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  answer: { marginTop: space.md },
  facts: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  factText: { ...typography.body, ...tabularNumbers, color: colors.text, flexShrink: 1 },
  codeCard: {
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 2,
    borderColor: colors.success,
  },
  codeCardPending: { borderColor: colors.info, borderStyle: 'dashed' },
  codeCardCancelled: { borderColor: colors.border },
  codeCancelled: { color: colors.textMuted, textDecorationLine: 'line-through' },
  codeLabel: { ...typography.caption, color: colors.textMuted },
  code: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: fontWeight.bold,
    letterSpacing: 5,
    color: colors.text,
    ...tabularNumbers,
  },
  codeHint: { ...typography.caption, color: colors.textMuted },
  noteCard: { gap: space.sm },
  note: { ...typography.body, color: colors.text },
  cancellation: { ...typography.body, color: colors.textMuted, paddingHorizontal: space.xs },
  actions: { gap: space.sm, marginTop: space.sm },
  skeletonGap: { gap: space.sm },
  skeletonCode: { marginTop: space.xs },
});
