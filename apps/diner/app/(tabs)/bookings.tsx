import type { Booking } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { BookingStatusPill } from '../../src/components/BookingStatusPill';
import { Text } from '../../src/components/Text';
import { useBookings } from '../../src/data/queries';
import { bookingsFailureCopy } from '../../src/lib/bookingsList';
import { useSession } from '../../src/stores/session';

type Tab = 'upcoming' | 'past';

export default function BookingsScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upcoming');

  // `/mine` is the signed-in number's bookings; with no session there is
  // nothing to ask for, and a sign-in prompt instead of an error.
  const signedIn = useSession((s) => s.signedIn);
  const bookingsQuery = useBookings(signedIn);
  const { data, isLoading, isError, error, refetch, isRefetching } = bookingsQuery;
  const offline = isOfflinePaused(bookingsQuery) && !data;

  // Upcoming and past exactly as the server split them: a sitting that has not
  // ended and still holds a table is upcoming, which keeps a diner running five
  // minutes late — and a seated party — out of "Past".
  const list: readonly Booking[] = tab === 'upcoming' ? (data?.upcoming ?? []) : (data?.past ?? []);

  const header = (
    <>
      <Text style={styles.title}>{t('bookings.title')}</Text>
      <View style={styles.tabs}>
        {(['upcoming', 'past'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {t(`bookings.${key}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('bookings.signedOut.title')}</Text>
          <Text style={styles.muted}>{t('bookings.signedOut.body')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/verify')}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t('bookings.signedOut.action')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading && !offline) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color={color.primaryInk} />
          <Text style={styles.muted}>{t('bookings.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if ((isError && !data) || offline) {
    // Said by what went wrong: offline, signed out, or the server.
    const copy = bookingsFailureCopy(error, offline);
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.centered} accessibilityRole="alert">
          <Text style={styles.emptyTitle}>{t(copy.titleKey)}</Text>
          {copy.bodyKey ? <Text style={styles.muted}>{t(copy.bodyKey)}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => (copy.action === 'verify' ? router.push('/verify') : void refetch())}
            style={styles.retry}
          >
            <Text style={styles.retryText}>
              {copy.action === 'verify' ? t('bookings.signedOut.action') : t('net.retry')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {header}
      <FlatList
        data={list}
        keyExtractor={(booking) => booking.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        renderItem={({ item }) => (
          <BookingRow
            booking={item}
            locale={locale}
            onPress={() =>
              router.push({ pathname: '/booking/[bookingId]', params: { bookingId: item.id } })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>
              {tab === 'upcoming' ? t('bookings.empty.title') : t('bookings.emptyPast.title')}
            </Text>
            <Text style={styles.muted}>
              {tab === 'upcoming' ? t('bookings.empty.body') : t('bookings.emptyPast.body')}
            </Text>
            {tab === 'upcoming' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(tabs)')}
                style={styles.retry}
              >
                <Text style={styles.retryText}>{t('bookings.empty.action')}</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

function BookingRow({
  booking,
  locale,
  onPress,
}: {
  booking: Booking;
  locale: Parameters<typeof formatTime>[2];
  onPress: () => void;
}) {
  const { t } = useTranslation('diner');
  const where = booking.venueName ?? booking.branchName;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${where} ${booking.code}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.venue} numberOfLines={1}>
          {where}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {t('bookings.tableAt', { table: booking.tableLabel, branch: booking.branchName })}
        </Text>
        {/* Branch timezone, always — the diner may be reading this from Moscow. */}
        <Text style={styles.detail}>
          {formatDate(booking.slotUtc, booking.timeZoneId, locale)} ·{' '}
          {formatTime(booking.slotUtc, booking.timeZoneId, locale)}
        </Text>
        <View style={styles.rowFooter}>
          <BookingStatusPill status={booking.status} />
          <Text style={styles.code}>{booking.code}</Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  title: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  tabs: { flexDirection: 'row', gap: space.sm, padding: space.lg },
  tab: {
    minHeight: touchTarget.minimum - 8,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  tabActive: { borderColor: color.primaryInk, backgroundColor: color.greenTint },
  tabText: { fontSize: fontSize.sm, color: color.foreground },
  tabTextActive: { color: color.primaryInk, fontWeight: fontWeight.medium },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  rowPressed: { backgroundColor: color.greenTint },
  rowBody: { flex: 1, gap: 2 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  venue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  detail: { fontSize: fontSize.sm, color: color.mutedForeground },
  code: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    letterSpacing: 1,
  },
  chevron: { fontSize: fontSize.xl, color: color.mutedForeground },
  centered: {
    alignItems: 'center',
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    textAlign: 'center',
  },
  muted: { fontSize: fontSize.sm, color: color.mutedForeground, textAlign: 'center' },
  retry: {
    marginTop: space.md,
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.greenTint,
  },
  retryText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.primaryInk },
});
