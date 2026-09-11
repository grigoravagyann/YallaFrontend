import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, SafeAreaView, Share, StyleSheet, View } from 'react-native';
import { QueryFailure, QueryLoading } from '../../src/components/QueryState';
import { Text } from '../../src/components/Text';
import { useBooking } from '../../src/data/queries';
import { ReminderOptIn } from '../../src/push/ReminderOptIn';

export default function SuccessScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const bookingQuery = useBooking(bookingId);
  const { data: booking, isLoading, isError, error, refetch } = bookingQuery;

  /*
   * Every state said, never a spinner that waits for ever.
   *
   * The booking arrives in the cache with the confirmation, so this is normally
   * instant. Opened any other way — a restored screen, a stale id — it reads
   * the diner's own bookings, and a booking that is not among them is "not
   * found", not an endless load.
   */
  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        {isOfflinePaused(bookingQuery) ? (
          <QueryFailure offline onRetry={() => void refetch()} />
        ) : isLoading ? (
          <QueryLoading label={t('net.loading')} />
        ) : isError ? (
          <QueryFailure error={error} onRetry={() => void refetch()} />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.title}>{t('booking.notFound.title')}</Text>
            <Text style={styles.detail}>{t('booking.notFound.body')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(tabs)/bookings')}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>{t('success.viewBookings')}</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const pending = booking.status === 'pendingApproval';
  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  // The venue when this phone has read it; the branch always.
  const where = booking.venueName ?? booking.branchName;

  const share = () => {
    void Share.share({
      message: t('success.shareMessage', {
        table: booking.tableLabel,
        venue: where,
        branch: booking.branchName,
        time: when,
        code: booking.code,
      }),
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* No back: the booking is made, and returning to the confirm screen
          would invite a second attempt. */}
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.body}>
        <Text style={styles.title}>
          {pending ? t('success.pendingTitle') : t('success.confirmedTitle')}
        </Text>
        {pending ? <Text style={styles.pendingBody}>{t('success.pendingBody')}</Text> : null}

        {/*
          The one place the notification permission is asked for.
          A booking has just been made and the question answers itself; asked on
          launch it is a prompt nobody understands and therefore declines.
        */}
        <ReminderOptIn />

        {/*
          Large and legible: staff ask for this at the door and it gets read
          aloud over the phone, so it is the one thing on this screen that has
          to survive a noisy room.
        */}
        <View style={[styles.codeCard, pending && styles.codeCardPending]}>
          <Text style={styles.codeLabel}>{t('success.codeLabel')}</Text>
          <Text style={styles.code} accessibilityLabel={booking.code.split('').join(' ')}>
            {booking.code}
          </Text>
          <Text style={styles.codeHint}>{t('success.codeHint')}</Text>
        </View>

        <View style={styles.details}>
          <Text style={styles.venue}>{where}</Text>
          {booking.venueName ? <Text style={styles.detail}>{booking.branchName}</Text> : null}
          <Text style={styles.detail}>
            {t('bookings.tableAt', { table: booking.tableLabel, branch: booking.branchName })}
          </Text>
          <Text style={styles.detail}>{when}</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={share} style={styles.secondary}>
          <Text style={styles.secondaryText}>{t('success.share')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(tabs)/bookings')}
          style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
        >
          <Text style={styles.primaryText}>{t('success.viewBookings')}</Text>
        </Pressable>
      </View>
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
  body: { flex: 1, padding: space.xl, gap: space.md },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  pendingBody: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.info },
  codeCard: {
    marginTop: space.lg,
    padding: space.xl,
    alignItems: 'center',
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: color.success,
  },
  // Pending must never look confirmed — different border, different accent.
  codeCardPending: { borderColor: color.info, borderStyle: 'dashed' },
  codeLabel: { fontSize: fontSize.sm, color: color.mutedForeground },
  code: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: fontWeight.bold,
    letterSpacing: 6,
    color: color.foreground,
  },
  codeHint: { fontSize: fontSize.sm, color: color.mutedForeground },
  details: { marginTop: space.lg, gap: 2 },
  venue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  detail: { fontSize: fontSize.md, color: color.mutedForeground, textAlign: 'center' },
  secondary: {
    marginTop: 'auto',
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: fontSize.md, color: color.primaryInk },
  primary: {
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
});
