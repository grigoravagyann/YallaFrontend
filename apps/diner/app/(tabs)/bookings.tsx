import type { Booking } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BookingStatusPill } from '../../src/components/BookingStatusPill';
import { useNow } from '../../src/hooks/useNow';
import { useBookings } from '../../src/data/queries';

type Tab = 'upcoming' | 'past';

const PAST_STATUSES = new Set(['cancelled', 'completed', 'noShow']);

export default function BookingsScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upcoming');
  const { data, isLoading, isError, refetch, isRefetching } = useBookings();
  // Ticks, so a booking moves from Upcoming to Past while the screen is open.
  const nowDate = useNow();

  const { upcoming, past } = useMemo(() => {
    const now = nowDate.getTime();
    const all = data ?? [];
    return {
      // Soonest first — the next thing you have to be somewhere for.
      upcoming: all
        .filter((b) => !PAST_STATUSES.has(b.status) && new Date(b.slotUtc).getTime() >= now)
        .sort((a, b) => new Date(a.slotUtc).getTime() - new Date(b.slotUtc).getTime()),
      // Most recent first — history reads backwards.
      past: all
        .filter((b) => PAST_STATUSES.has(b.status) || new Date(b.slotUtc).getTime() < now)
        .sort((a, b) => new Date(b.slotUtc).getTime() - new Date(a.slotUtc).getTime()),
    };
  }, [data, nowDate]);

  const list = tab === 'upcoming' ? upcoming : past;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={color.accent} />
          <Text style={styles.muted}>{t('bookings.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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

      {isError ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('net.offline')}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.retry}>
            <Text style={styles.retryText}>{t('net.retry')}</Text>
          </Pressable>
        </View>
      ) : (
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
      )}
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${booking.venueName} ${booking.code}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.venue} numberOfLines={1}>
          {booking.venueName}
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
  safeArea: { flex: 1, backgroundColor: color.background },
  title: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
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
  tabActive: { borderColor: color.accentStrong, backgroundColor: color.accentMuted },
  tabText: { fontSize: fontSize.sm, color: color.textPrimary },
  tabTextActive: { color: color.accentStrong, fontWeight: fontWeight.semibold },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.surfaceMuted,
    backgroundColor: color.surface,
  },
  rowPressed: { backgroundColor: color.surfaceMuted },
  rowBody: { flex: 1, gap: 2 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  venue: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: color.textPrimary },
  detail: { fontSize: fontSize.sm, color: color.textSecondary },
  code: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
    letterSpacing: 1,
  },
  chevron: { fontSize: fontSize.xl, color: color.textSecondary },
  centered: { alignItems: 'center', paddingTop: space.xxl, gap: space.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: color.textPrimary },
  muted: { fontSize: fontSize.sm, color: color.textSecondary, textAlign: 'center' },
  retry: {
    marginTop: space.md,
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: color.accentMuted,
  },
  retryText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.accentStrong },
});
