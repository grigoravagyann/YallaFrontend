import type { Booking } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  BookingHeroCard,
  BookingHeroSkeleton,
  BookingRow,
  BookingRowSkeleton,
  BookingSheetSummary,
} from '../../src/components/bookings/BookingCard';
import { canChangeBooking, changeBookingRoute } from '../../src/components/bookings/changeBooking';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { Rise, riseDelay } from '../../src/components/motion/Rise';
import { useToast } from '../../src/components/motion/Toast';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { Text } from '../../src/components/Text';
import { useBookings, useCancelBooking } from '../../src/data/queries';
import { useNow } from '../../src/hooks/useNow';
import { bookingsFailureCopy } from '../../src/lib/bookingsList';
import { haptics } from '../../src/lib/haptics';
import { useSession } from '../../src/stores/session';
import { actionIcon, colors, displayWeight, layout, space, typography } from '../../src/theme';

type Tab = 'upcoming' | 'past';

/** The cancel sheet's booking outlives its opening, so the sheet slides away still drawn. */
interface CancelSheet {
  readonly booking: Booking;
  readonly open: boolean;
}

export default function BookingsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const paddingBottom = useNavClearance();
  const now = useNow();
  const showToast = useToast((state) => state.show);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [sheet, setSheet] = useState<CancelSheet | null>(null);
  // The booking cancelled from this screen, kept at the top as "Cancelled"
  // with a way to book the place again — the server's next read files it
  // under Past, and the card vanishing mid-tap would read as a glitch. Let go
  // of once the diner moves on.
  const [justCancelled, setJustCancelled] = useState<Booking | null>(null);
  useFocusEffect(useCallback(() => () => setJustCancelled(null), []));

  // `/mine` is the signed-in number's bookings; with no session there is
  // nothing to ask for, and a sign-in prompt instead of an error.
  const signedIn = useSession((s) => s.signedIn);
  const bookingsQuery = useBookings(signedIn);
  const { data, isLoading, isError, error, refetch, isRefetching } = bookingsQuery;
  const offline = isOfflinePaused(bookingsQuery) && !data;
  const cancel = useCancelBooking();

  // Upcoming and past exactly as the server split them: a sitting that has not
  // ended and still holds a table is upcoming, which keeps a diner running five
  // minutes late — and a seated party — out of "Past". The first upcoming one
  // is the large card; the rest follow under "Next".
  const upcoming: readonly Booking[] = data?.upcoming ?? [];
  const hero = tab === 'upcoming' ? (justCancelled ?? upcoming[0] ?? null) : null;
  const rows: readonly Booking[] =
    tab === 'upcoming' ? upcoming.filter((booking) => booking.id !== hero?.id) : (data?.past ?? []);

  const chooseTab = (next: Tab) => {
    setTab(next);
    setJustCancelled(null);
  };
  const openDetail = (booking: Booking) =>
    router.push({ pathname: '/booking/[bookingId]', params: { bookingId: booking.id } });
  // "Change" moves this booking — same code, same booking — on the booking
  // screen opened on it; "Book again" is a fresh booking at the same place.
  const changeBooking = (booking: Booking) => router.push(changeBookingRoute(booking));
  const bookPlace = (booking: Booking) =>
    router.push({ pathname: '/book/[placeId]', params: { placeId: booking.branchId } });

  const openCancel = (booking: Booking) => {
    cancel.reset();
    setSheet({ booking, open: true });
  };
  const closeCancel = () => setSheet((current) => (current ? { ...current, open: false } : null));
  const confirmCancel = () => {
    if (!sheet) return;
    cancel.mutate(sheet.booking.id, {
      onSuccess: (cancelled) => {
        setJustCancelled(cancelled);
        closeCancel();
        haptics.tap();
        showToast(t('bookings.cancelledToast'));
      },
    });
  };
  // The server's deadline. Past it the cancellation is late — but never blocked.
  const isLate =
    sheet !== null && now.getTime() > new Date(sheet.booking.freeCancellationUntilUtc).getTime();

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
        onChange={chooseTab}
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
          {tab === 'upcoming' ? <BookingHeroSkeleton style={styles.card} /> : null}
          <BookingRowSkeleton style={styles.card} />
          <BookingRowSkeleton style={styles.card} />
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

  const empty =
    tab === 'upcoming' ? (
      <EmptyState
        icon={actionIcon.calendar}
        title={t('bookings.empty.title')}
        body={t('bookings.empty.body')}
        action={{
          label: t('bookings.empty.action'),
          onPress: () => router.replace('/(tabs)'),
        }}
      />
    ) : (
      <EmptyState
        icon={actionIcon.time}
        title={t('bookings.emptyPast.title')}
        body={t('bookings.emptyPast.body')}
      />
    );

  return (
    <Screen>
      {header}
      <FlatList
        data={rows}
        keyExtractor={(booking) => booking.id}
        contentContainerStyle={[styles.list, { paddingBottom }]}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListHeaderComponent={
          hero ? (
            <Rise>
              <BookingHeroCard
                booking={hero}
                now={now}
                style={styles.card}
                onOpen={() => openDetail(hero)}
                // Only while the server would still move it: waiting or
                // confirmed, and not yet started.
                {...(!justCancelled && canChangeBooking(hero, now)
                  ? { onChange: () => changeBooking(hero) }
                  : {})}
                onCancel={() => openCancel(hero)}
                {...(justCancelled ? { onBookAgain: () => bookPlace(hero) } : {})}
              />
              {rows.length > 0 ? (
                <Text display style={styles.next} accessibilityRole="header">
                  {t('bookings.next')}
                </Text>
              ) : null}
            </Rise>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Rise delay={riseDelay(index + (hero ? 1 : 0))}>
            <BookingRow
              booking={item}
              now={now}
              style={styles.row}
              onOpen={() => openDetail(item)}
            />
          </Rise>
        )}
        ListEmptyComponent={hero ? null : empty}
      />

      {/* One tap plus a confirmation step — cancelling a table by accident is
          worse than one extra tap. Never blocks a late cancellation, and does
          not scold: a late cancel is far better for the venue than a no-show. */}
      <ConfirmSheet
        visible={sheet?.open === true && !cancel.isSuccess}
        title={t('bookings.detail.cancelTitle')}
        summary={sheet ? <BookingSheetSummary booking={sheet.booking} now={now} /> : null}
        body={isLate ? t('bookings.detail.cancelLate') : t('bookings.detail.cancelFree')}
        confirmLabel={t('bookings.detail.cancelConfirm')}
        cancelLabel={t('bookings.detail.cancelKeep')}
        busyLabel={t('bookings.detail.cancelling')}
        busy={cancel.isPending}
        error={cancel.isError ? t('bookings.detail.cancelFailed') : null}
        destructive
        onConfirm={confirmCancel}
        onCancel={closeCancel}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  card: { marginBottom: space.md - 2 },
  next: {
    ...typography.bodyLg,
    fontWeight: displayWeight.semibold,
    color: colors.text,
    marginTop: space.sm,
    marginBottom: space.md - 2,
  },
  row: { marginBottom: space.md - 2 },
});
