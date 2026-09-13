import type { Booking } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BookingCard, BookingCardSkeleton } from '../../src/components/bookings/BookingCard';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { Text } from '../../src/components/Text';
import { useBookings } from '../../src/data/queries';
import { bookingsFailureCopy } from '../../src/lib/bookingsList';
import { useSession } from '../../src/stores/session';
import { colors, layout, navIcons, space, typography } from '../../src/theme';

type Tab = 'upcoming' | 'past';

/** How many cream cards stand in for the list while it loads. */
const SKELETON_ROWS = [0, 1, 2] as const;

export default function BookingsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const paddingBottom = useNavClearance();
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

  const openDetail = (booking: Booking) =>
    router.push({ pathname: '/booking/[bookingId]', params: { bookingId: booking.id } });

  const header = (
    <View style={styles.header}>
      <Text display style={styles.title} accessibilityRole="header">
        {t('bookings.title')}
      </Text>
      <SegmentedControl<Tab>
        options={[
          { value: 'upcoming', label: t('bookings.upcoming') },
          { value: 'past', label: t('bookings.past') },
        ]}
        value={tab}
        onChange={setTab}
        accessibilityLabel={t('bookings.title')}
      />
    </View>
  );

  if (!signedIn) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="phone-portrait-outline"
          title={t('bookings.signedOut.title')}
          body={t('bookings.signedOut.body')}
          action={{ label: t('bookings.signedOut.action'), onPress: () => router.push('/auth') }}
        />
      </Screen>
    );
  }

  if (isLoading && !offline) {
    return (
      <Screen>
        {header}
        <View style={[styles.list, { paddingBottom }]} accessibilityLabel={t('bookings.loading')}>
          {SKELETON_ROWS.map((row) => (
            <BookingCardSkeleton key={row} style={styles.card} />
          ))}
        </View>
      </Screen>
    );
  }

  if ((isError && !data) || offline) {
    // Said by what went wrong: offline, signed out, or the server.
    const copy = bookingsFailureCopy(error, offline);
    return (
      <Screen>
        {header}
        {copy.action === 'verify' ? (
          <EmptyState
            icon="phone-portrait-outline"
            title={t(copy.titleKey)}
            {...(copy.bodyKey ? { body: t(copy.bodyKey) } : {})}
            action={{
              label: t('bookings.signedOut.action'),
              onPress: () => router.push('/auth'),
            }}
          />
        ) : (
          <ErrorState
            offline={offline}
            title={t(copy.titleKey)}
            {...(copy.bodyKey ? { body: t(copy.bodyKey) } : {})}
            onRetry={() => void refetch()}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={list}
        keyExtractor={(booking) => booking.id}
        contentContainerStyle={[styles.list, { paddingBottom }]}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            style={styles.card}
            onViewDetails={() => openDetail(item)}
            // Cancelling is confirmed on the detail screen (free or late, and a
            // retry if it fails); the card takes the diner there.
            onCancel={() => openDetail(item)}
          />
        )}
        ListEmptyComponent={
          tab === 'upcoming' ? (
            <EmptyState
              icon={navIcons.bookings.outline}
              title={t('bookings.empty.title')}
              body={t('bookings.empty.body')}
              action={{
                label: t('bookings.empty.action'),
                onPress: () => router.replace('/(tabs)'),
              }}
            />
          ) : (
            <EmptyState
              icon="time-outline"
              title={t('bookings.emptyPast.title')}
              body={t('bookings.emptyPast.body')}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.lg,
  },
  title: { ...typography.title, color: colors.text },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  card: { marginBottom: layout.cardGap },
});
