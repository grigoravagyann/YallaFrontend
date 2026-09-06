import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { BookingStatusPill } from '../../src/components/BookingStatusPill';
import { useBooking, useCancelBooking } from '../../src/data/queries';
import { useNow } from '../../src/hooks/useNow';
import { ReservationActions } from '../../src/push/ReservationActions';

export default function BookingDetailScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: booking, isLoading } = useBooking(bookingId);
  const cancel = useCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = useNow();

  if (isLoading || !booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <ActivityIndicator color={color.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  const isCancelled = booking.status === 'cancelled';
  // Past the free window the cancellation is late — but never blocked.
  const isLate = now.getTime() > new Date(booking.freeCancellationUntilUtc).getTime();

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
          What a notification asked this person to do, decided from the
          booking's state **now** rather than from the notification. A reminder
          read the next morning must not offer to cancel a table somebody
          already sat at. Reads the real reservation endpoint; the rest of this
          screen is still on the mock because `Booking` carries six fields no
          reservation view has.
        */}
        <ReservationActions reservationId={booking.id} />

        <View
          style={[styles.codeCard, booking.status === 'pendingApproval' && styles.codeCardPending]}
        >
          <Text style={styles.codeLabel}>{t('success.codeLabel')}</Text>
          <Text style={styles.code} accessibilityLabel={booking.code.split('').join(' ')}>
            {booking.code}
          </Text>
        </View>

        <View style={styles.details}>
          <Text style={styles.venue}>{booking.venueName}</Text>
          <Text style={styles.detail}>{booking.branchName}</Text>
          <Text style={styles.detail}>
            {t('bookings.tableAt', { table: booking.tableLabel, branch: booking.branchName })}
          </Text>
          <Text style={styles.detail}>{when}</Text>
          <Text style={styles.detail}>{t('booking.guests', { count: booking.partySize })}</Text>
        </View>

        {booking.window.untilUtc ? (
          <Text style={styles.window}>
            {t('table.heldForYou', {
              range: `${formatTime(booking.window.fromUtc, booking.timeZoneId, locale)} – ${formatTime(
                booking.window.untilUtc,
                booking.timeZoneId,
                locale,
              )}`,
            })}
          </Text>
        ) : (
          <Text style={styles.noLimit}>{t('table.noBookingAfter')}</Text>
        )}

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
        ) : (
          <Text style={styles.detail}>
            {t('table.freeCancellation', {
              time: formatTime(booking.freeCancellationUntilUtc, booking.timeZoneId, locale),
            })}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void Share.share({
              message: t('success.shareMessage', {
                table: booking.tableLabel,
                venue: booking.venueName,
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

        {!isCancelled ? (
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  window: { marginTop: space.md, fontSize: fontSize.md, color: color.foreground },
  noLimit: { marginTop: space.md, fontSize: fontSize.md, color: color.success },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  secondaryText: { fontSize: fontSize.md, color: color.primaryPressed },
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
