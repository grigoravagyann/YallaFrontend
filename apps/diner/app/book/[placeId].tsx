import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { parseChangeParams } from '../../src/components/bookings/changeBooking';
import { BookingForm } from '../../src/booking/BookingForm';
import { BookingHeader } from '../../src/booking/BookingHeader';
import type { BookingParams } from '../../src/booking/params';
import { usePlace, usePlaceRooms } from '../../src/places/hooks';
import { actionIcon, layout, radius, space } from '../../src/theme';

/**
 * Date, time, party size, the table — tapped on a room photo here or on the
 * place's page, or left to the server — and one press to confirm.
 *
 * A verified number is asked for here and nowhere earlier: a diner without one
 * is handed to `/auth/login` with the same forward params the branch screen
 * uses, and comes out on the existing confirm screen. A verified diner books from here.
 *
 * With a `bookingId` the same screen changes that booking instead: opened on
 * its day, time, party and table, the diner's own table free at its own time,
 * and "Save changes" moving it — same code, same booking.
 */
export default function BookingScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const params = useLocalSearchParams<BookingParams>();
  const { bookingId, slotUtc, party, tableId } = params;
  const change = useMemo(
    () => parseChangeParams({ bookingId, slotUtc, party, tableId }),
    [bookingId, slotUtc, party, tableId],
  );
  const title = change ? t('book.changeTitle') : t('book.title');
  const placeQuery = usePlace(params.placeId);
  const roomsQuery = usePlaceRooms(params.placeId);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (placeQuery.isLoading) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <BookingHeader title={title} onBack={back} />
        <View style={styles.skeleton}>
          <Skeleton height={layout.touchTarget} borderRadius={radius.pill} />
          <Skeleton height={layout.touchTarget} borderRadius={radius.pill} />
          <Skeleton height={56} borderRadius={radius.card} />
          <Skeleton width="40%" height={20} />
          <Skeleton height={240} borderRadius={radius.card + 2} />
        </View>
      </Screen>
    );
  }

  if (placeQuery.isError || isOfflinePaused(placeQuery)) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <BookingHeader title={title} onBack={back} />
        <ErrorState
          offline={isOfflinePaused(placeQuery)}
          onRetry={() => void placeQuery.refetch()}
          style={styles.centered}
        />
      </Screen>
    );
  }

  const place = placeQuery.data ?? null;
  if (!place) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <BookingHeader title={title} onBack={back} />
        <EmptyState
          icon={actionIcon.error}
          title={t('floorPlan.notFound')}
          action={{ label: t('floorPlan.back'), onPress: back }}
          style={styles.centered}
        />
      </Screen>
    );
  }

  return (
    <BookingForm
      place={place}
      rooms={roomsQuery.data ?? place.rooms}
      params={params}
      change={change}
      title={title}
      onBack={back}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.lg },
});
