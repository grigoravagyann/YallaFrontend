import { freeCancellationCopy } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, View } from 'react-native';
import { AtMyTableAction } from '../../src/components/AtMyTableAction';
import { BookingStatusPill } from '../../src/components/BookingStatusPill';
import { QueryFailure, QueryLoading } from '../../src/components/QueryState';
import { Text } from '../../src/components/Text';
import { useBooking, useCancelBooking } from '../../src/data/queries';
import { useNow } from '../../src/hooks/useNow';
import { canCancel } from '../../src/lib/bookingActions';
import { KeepTableAction } from '../../src/push/ReservationActions';

/**
 * One booking, from the diner's own bookings on the server.
 *
 * Where every reservation notification lands. It used to read the in-memory
 * mock even against a real backend, so a push for a real booking opened a
 * spinner that never stopped, and the actions on it never rendered.
 */
export default function BookingDetailScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const bookingQuery = useBooking(bookingId);
  const { data: booking, isLoading, isError, error, refetch } = bookingQuery;
  const cancel = useCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = useNow();

  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        {isOfflinePaused(bookingQuery) ? (
          <QueryFailure offline onRetry={() => void refetch()} />
        ) : isLoading ? (
          <QueryLoading label={t('net.loading')} />
        ) : isError ? (
          <QueryFailure error={error} onRetry={() => void refetch()} />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.title}>{t('booking.notFound.title')}</Text>
            <Text style={styles.centeredBody}>{t('booking.notFound.body')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(tabs)/bookings')}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>{t('success.viewBookings')}</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  const where = booking.venueName ?? booking.branchName;
  const isCancelled =
    booking.status === 'cancelledByDiner' || booking.status === 'cancelledByVenue';
  // The server's deadline. Past it the cancellation is late — but never blocked.
  const isLate = now.getTime() > new Date(booking.freeCancellationUntilUtc).getTime();
  const cancellation = freeCancellationCopy(
    booking.freeCancellationUntilUtc,
    booking.timeZoneId,
    locale,
    now,
  );

  const doCancel = async () => {
    setFailed(false);
    try {
      await cancel.mutateAsync(booking.id);
      setConfirming(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('bookings.detail.title')}</Text>
        <BookingStatusPill status={booking.status} />

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

        <View
          style={[styles.codeCard, booking.status === 'pendingApproval' && styles.codeCardPending]}
        >
          <Text style={styles.codeLabel}>{t('success.codeLabel')}</Text>
          <Text style={styles.code} accessibilityLabel={booking.code.split('').join(' ')}>
            {booking.code}
          </Text>
        </View>

        <View style={styles.details}>
          <Text style={styles.venue}>{where}</Text>
          {booking.venueName ? <Text style={styles.detail}>{booking.branchName}</Text> : null}
          <Text style={styles.detail}>
            {t('bookings.tableAt', { table: booking.tableLabel, branch: booking.branchName })}
          </Text>
          <Text style={styles.detail}>{when}</Text>
          <Text style={styles.detail}>{t('booking.guests', { count: booking.partySize })}</Text>
          <Text style={styles.detail}>
            {t('bookings.detail.until', {
              time: formatTime(booking.endUtc, booking.timeZoneId, locale),
            })}
          </Text>
        </View>

        {isCancelled ? (
          <Text style={styles.detail}>
            {t('bookings.detail.cancelledOn', {
              date: formatDate(
                booking.cancelledAtUtc ?? booking.slotUtc,
                booking.timeZoneId,
                locale,
              ),
            })}
          </Text>
        ) : canCancel(booking.status) ? (
          <Text style={styles.detail}>{t(cancellation.key, cancellation.params)}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void Share.share({
              message: t('success.shareMessage', {
                table: booking.tableLabel,
                venue: where,
                branch: booking.branchName,
                time: when,
                code: booking.code,
              }),
            })
          }
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t('success.share')}</Text>
        </Pressable>

        {/* One cancel, and only while the booking still holds a table — what
            the server will accept. */}
        {canCancel(booking.status) ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirming(true)}
            style={styles.danger}
          >
            <Text style={styles.dangerText}>{t('bookings.detail.cancel')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* One tap plus a confirmation step — cancelling a table by accident is
          worse than one extra tap. */}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setConfirming(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('bookings.detail.cancelTitle')}</Text>
          {/*
            Never blocks a late cancellation, and does not scold. A late cancel
            is far better for the venue than a no-show, so the copy says that
            rather than implying the diner has done something wrong.
          */}
          <Text style={styles.sheetBody}>
            {isLate ? t('bookings.detail.cancelLate') : t('bookings.detail.cancelFree')}
          </Text>

          {failed ? <Text style={styles.error}>{t('bookings.detail.cancelFailed')}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={cancel.isPending}
            onPress={() => void doCancel()}
            style={[styles.danger, cancel.isPending && styles.disabled]}
          >
            <Text style={styles.dangerText}>
              {cancel.isPending
                ? t('bookings.detail.cancelling')
                : t('bookings.detail.cancelConfirm')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirming(false)}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>{t('bookings.detail.cancelKeep')}</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  centeredBody: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  body: { padding: space.xl, gap: space.sm },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  codeCard: {
    marginTop: space.md,
    padding: space.lg,
    alignItems: 'center',
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: color.success,
  },
  codeCardPending: { borderColor: color.info, borderStyle: 'dashed' },
  codeLabel: { fontSize: fontSize.sm, color: color.mutedForeground },
  code: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: fontWeight.bold,
    letterSpacing: 5,
    color: color.foreground,
  },
  details: { marginTop: space.lg, gap: 2 },
  venue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  detail: { fontSize: fontSize.md, color: color.mutedForeground },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  secondaryText: { fontSize: fontSize.md, color: color.primaryInk },
  danger: {
    marginTop: space.md,
    minHeight: touchTarget.minimum + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.danger,
  },
  dangerText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.danger },
  disabled: { opacity: 0.6 },
  backdrop: { flex: 1, backgroundColor: '#00000055' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.xl,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  sheetBody: {
    marginTop: space.sm,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.mutedForeground,
  },
  error: { marginTop: space.sm, fontSize: fontSize.sm, color: color.danger },
});
