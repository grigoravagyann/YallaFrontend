import { freeCancellationCopy, type Booking } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { AtMyTableAction } from '../../src/components/AtMyTableAction';
import { BookingBadge } from '../../src/components/bookings/BookingCard';
import {
  bookingShareLine,
  sittingEndLines,
  tableWithRoom,
} from '../../src/components/bookings/bookingText';
import { anotherTimeRoute, changeBookingRoute } from '../../src/components/bookings/changeBooking';
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
import { useBooking, useCancelBooking } from '../../src/data/queries';
import { useNow } from '../../src/hooks/useNow';
import { canCancel } from '../../src/lib/bookingActions';
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
  const { bookingId, answer, requestId } = useLocalSearchParams<{
    bookingId: string;
    answer?: string;
    requestId?: string;
  }>();
  const autoAnswer =
    requestId && (answer === 'yes' || answer === 'no')
      ? { requestId, accept: answer === 'yes' }
      : undefined;
  const bookingQuery = useBooking(bookingId);
  const { data: booking, isLoading, isError, error, refetch } = bookingQuery;

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
      <BookingDetail booking={booking} autoAnswer={autoAnswer} />
    </Screen>
  );
}

function BookingDetail({
  booking,
  autoAnswer,
}: {
  readonly booking: Booking;
  readonly autoAnswer?: { readonly requestId: string; readonly accept: boolean } | undefined;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const cancel = useCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const now = useNow();
  const { data: place } = usePlace(booking.branchId);
  const changeable = useCanChangeBooking(booking, now);
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
            <BookingBadge status={booking.status} declined={declined} />
          </View>
          {/* While the venue decides, the minutes it has left; once it has
              declined, why — sorry, when nobody answered in time. */}
          <VenueAnswerNote booking={booking} style={styles.answer} />
          {/* The guest's own yes to the guest after them, for as long as it binds. */}
          <PromiseNote booking={booking} style={styles.answer} />
          <View style={styles.facts}>
            <Fact
              icon={actionIcon.table}
              text={t('tables.table', { label: tableWithRoom(booking) })}
            />
            <Fact icon={actionIcon.calendar} text={when} />
            <Fact
              icon={actionIcon.people}
              text={t('booking.guests', { count: booking.partySize })}
            />
            <Fact icon={actionIcon.time} text={sittingEnd} />
          </View>
        </Card>

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
            look confirmed — a dashed blue edge instead of the solid green. */}
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

        {note ? (
          <Card style={styles.noteCard}>
            <SectionHeader label={t('booking.note.title')} icon={actionIcon.note} />
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
              onPress={() => {
                cancel.reset();
                setConfirming(true);
              }}
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
    backgroundColor: colors.surfaceMuted,
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
