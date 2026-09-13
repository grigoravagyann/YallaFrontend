import { describeFailure, unavailableCopy, type TableAvailability } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { FloorPlan, Legend } from '@yalla/floorplan';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  BookingContextBar,
  nextHalfHour,
  type BookingContext,
} from '../../src/components/BookingContextBar';
import { EmptyState } from '../../src/components/EmptyState';
import { IconButton } from '../../src/components/IconButton';
import { QueryErrorState } from '../../src/components/QueryErrorState';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { TableSheet } from '../../src/components/TableSheet';
import { Text } from '../../src/components/Text';
import { useBranchTimeZone } from '../../src/data/orderQueries';
import { useBookingRules, useSlotFloor, useVenue } from '../../src/data/queries';
import { branchZoneSource } from '../../src/lib/browse';
import { useConflict } from '../../src/stores/conflict';
import { useSession } from '../../src/stores/session';
import { actionIcon, colors, fontWeight, layout, radius, space, typography } from '../../src/theme';

/**
 * Pick a table at one branch — the floor-plan view.
 *
 * The secondary way in: the details screen's photo is the main experience and
 * links here for a diner who wants the whole room. The booking context (date,
 * time, party size) is held here and passed down: party size decides which
 * tables are selectable, the slot decides each table's availability window.
 * This screen stays mounted while verification and confirmation are pushed on
 * top of it — that is what preserves the diner's selected table across the
 * whole round trip, including Android hardware back.
 */
export default function BranchFloorPlanScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { branchId, venueId } = useLocalSearchParams<{
    branchId: string;
    venueId?: string;
  }>();

  // Set by the confirm screen when it pops back after a 409.
  const conflictLabel = useConflict((c) => c.takenTableLabel);
  const conflictReason = useConflict((c) => c.takenReason);
  const clearConflict = useConflict((c) => c.clear);

  const [booking, setBooking] = useState<BookingContext>(() => ({
    slotUtc: nextHalfHour(new Date()),
    partySize: 2,
  }));
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [sheetTableId, setSheetTableId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const slotIso = useMemo(() => booking.slotUtc.toISOString(), [booking.slotUtc]);

  const venueQuery = useVenue(venueId);
  const branchSummary = venueQuery.data?.branches.find((b) => b.id === branchId) ?? null;

  /*
   * The branch's zone, and never a guess.
   *
   * From the browse card when this branch was reached from its venue. Reached
   * any other way — a deep link with no `venueId`, or a venue that no longer
   * lists it — the branch is asked directly. Every read below that turns the
   * slot into wall-clock time waits until one of the two has answered.
   */
  const zoneSource = branchZoneSource({
    venueId,
    venueStatus: venueQuery.isSuccess ? 'success' : venueQuery.isError ? 'error' : 'pending',
    zoneFromVenue: branchSummary?.timeZoneId ?? null,
    zoneFromBranch: undefined,
  });
  const zoneQuery = useBranchTimeZone(zoneSource.lookup ? branchId : undefined);
  const timeZoneId = zoneSource.zone ?? zoneQuery.data ?? null;

  // How far ahead and how soon, so the pickers offer only what the branch takes.
  const rulesQuery = useBookingRules(
    branchSummary ? { venueSlug: branchSummary.venueId, branchSlug: branchSummary.slug } : null,
  );

  /*
   * One question, one answer: the room **as it will be at the slot**, and every
   * table's verdict for it.
   *
   * This used to be two calls, and the one that drew the room asked about
   * *now*. A diner picking Saturday at 20:00 saw tonight's walk-ins greyed out
   * and 20:00's bookings drawn free — the product's central question answered
   * about the wrong moment. Date, time and party size are all server inputs, so
   * changing any of them refetches; the party-size stepper is debounced inside
   * the hook so 2 → 6 is one request.
   */
  const slotFloorQuery = useSlotFloor({
    branchId: timeZoneId ? branchId : undefined,
    slotUtc: slotIso,
    partySize: booking.partySize,
    timeZoneId: timeZoneId ?? undefined,
  });
  const waitingForZone = !timeZoneId && (venueQuery.isLoading || zoneQuery.isLoading);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  const handleTap = useCallback(
    (tableId: string) => {
      setSelectedTableId(tableId);
      setSheetTableId(tableId);
      // Picking a new table dismisses the "that one was taken" notice.
      clearConflict();
    },
    [clearConflict],
  );

  // From the same response the room was drawn from, so the window and the
  // reason in the sheet describe the slot on screen rather than this moment.
  const sheetAvailability: TableAvailability | null = useMemo(
    () => slotFloorQuery.data?.tables.find((a) => a.tableId === sheetTableId) ?? null,
    [sheetTableId, slotFloorQuery.data],
  );

  /**
   * Reserving requires a verified phone — asked for here and nowhere earlier.
   * Ordering and paying later will not require it.
   */
  const handleReserve = useCallback(
    (tableId: string) => {
      setSheetTableId(null);
      // A restored session counts: a returning diner is not sent through an
      // SMS code again for a number the keychain still vouches for.
      const verified = useSession.getState().signedIn;
      const forward = {
        branchId: branchId ?? '',
        venueId: venueId ?? '',
        tableId,
        slotUtc: slotIso,
        partySize: String(booking.partySize),
      };

      router.push(
        verified
          ? { pathname: '/reserve/confirm', params: forward }
          : { pathname: '/verify', params: forward },
      );
    },
    [router, branchId, venueId, slotIso, booking.partySize],
  );

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
        onPress={back}
      />
      <View style={styles.headerBody}>
        {/* The branch name comes back with the room, so a deep link that never
            read its venue still says where it is. */}
        {venueQuery.data?.name ? (
          <Text numberOfLines={1} style={styles.venue}>
            {venueQuery.data.name}
          </Text>
        ) : null}
        <Text display numberOfLines={1} style={styles.branch} accessibilityRole="header">
          {branchSummary?.name ?? slotFloorQuery.data?.plan.branchName ?? t('floorPlan.title')}
        </Text>
      </View>
    </View>
  );

  /*
   * The full-screen state is for having *no room to draw*, not for the query
   * being unhappy. `keepPreviousData` keeps the last answer through a refetch,
   * so a diner who changes the time and loses signal keeps the room they were
   * looking at with a line above it, rather than watching it blank.
   */
  if (!slotFloorQuery.data) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        {isOfflinePaused(slotFloorQuery) || isOfflinePaused(zoneQuery) ? (
          <QueryErrorState offline onRetry={() => void slotFloorQuery.refetch()} />
        ) : waitingForZone || slotFloorQuery.isLoading ? (
          <View style={styles.skeleton} accessibilityLabel={t('net.loading')}>
            <View style={styles.skeletonBar}>
              <Skeleton
                height={layout.touchTarget}
                borderRadius={radius.pill}
                style={styles.flex}
              />
              <Skeleton
                height={layout.touchTarget}
                borderRadius={radius.pill}
                style={styles.flex}
              />
              <Skeleton
                height={layout.touchTarget}
                borderRadius={radius.pill}
                style={styles.flex}
              />
            </View>
            <Skeleton width="60%" height={14} />
            <Skeleton height={320} borderRadius={radius.card} />
          </View>
        ) : zoneQuery.isError ? (
          <QueryErrorState error={zoneQuery.error} onRetry={() => void zoneQuery.refetch()} />
        ) : slotFloorQuery.isError ? (
          <QueryErrorState
            error={slotFloorQuery.error}
            onRetry={() => void slotFloorQuery.refetch()}
          />
        ) : (
          <EmptyState
            icon={actionIcon.error}
            title={t('floorPlan.notFound')}
            action={{ label: t('floorPlan.back'), onPress: back }}
          />
        )}
      </Screen>
    );
  }

  const slotFloor = slotFloorQuery.data;
  // The zone the answer was computed in, which is the one on screen.
  const zone = timeZoneId ?? slotFloor.plan.timeZoneId;

  /*
   * A rule that refused the whole request — the slot has passed, it is further
   * ahead than the branch takes bookings, the venue is shut then. Named by the
   * server and said out loud, above a room that stays on screen: a diner who
   * picked yesterday by mistake needs to be told which control to move, and an
   * empty room tells them the venue is full.
   */
  const rejection = slotFloor.rejection
    ? unavailableCopy(slotFloor.rejection, booking.partySize)
    : null;

  // The room is on screen and possibly a slot behind; that is a line above it,
  // not a screen of its own.
  const availabilityFailure = isOfflinePaused(slotFloorQuery)
    ? 'offline'
    : slotFloorQuery.isError
      ? describeFailure(slotFloorQuery.error)
      : null;

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}

      <BookingContextBar
        value={booking}
        onChange={(next) => {
          setBooking(next);
          setSelectedTableId(null);
        }}
        timeZoneId={zone}
        locale={locale}
        windowDays={rulesQuery.data?.bookingWindowDays}
        leadMinutes={rulesQuery.data?.minLeadMinutes}
      />

      <View style={styles.legendWrap}>
        <Legend mode="diner" translate={(key) => t(key, { ns: 'common' })} />
      </View>

      {/* A lost table is information with the next action attached, not an
          error and not a coloured banner beside the plan. */}
      {conflictLabel ? (
        <Text style={styles.conflict}>
          {t(
            conflictReason === 'occupied'
              ? 'confirm.error.tableOccupied'
              : 'confirm.error.tableTaken',
            { label: conflictLabel },
          )}
        </Text>
      ) : rejection ? (
        <Text style={styles.conflict} accessibilityRole="alert">
          {t(rejection.key, rejection.params)}
        </Text>
      ) : availabilityFailure ? (
        <Text style={styles.conflict}>
          {availabilityFailure === 'offline' ? t('net.offline') : t('net.serverError')}
        </Text>
      ) : (
        <Text style={styles.status}>
          {t('floorPlan.pickFor', { time: formatTime(booking.slotUtc, zone, locale) })}
        </Text>
      )}

      <View style={styles.planWrap} onLayout={onLayout}>
        <FloorPlan
          plan={slotFloor.plan}
          mode="diner"
          partySize={booking.partySize}
          selectedTableId={selectedTableId}
          onTableTap={handleTap}
          viewport={viewport}
          accessibilityLabel={t('floorPlan.title')}
        />
      </View>

      <TableSheet
        availability={sheetAvailability}
        partySize={booking.partySize}
        timeZoneId={zone}
        locale={locale}
        onReserve={handleReserve}
        onClose={() => setSheetTableId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  headerBody: { flex: 1 },
  venue: { ...typography.caption, color: colors.textMuted },
  branch: { ...typography.heading, color: colors.text },
  legendWrap: { paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },
  status: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
    ...typography.caption,
    color: colors.textMuted,
  },
  conflict: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    ...typography.body,
    fontWeight: fontWeight.medium,
  },
  // The room sits in a white card like everything else on the cream.
  planWrap: {
    flex: 1,
    marginHorizontal: layout.screenPadding,
    marginBottom: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.md },
  skeletonBar: { flexDirection: 'row', gap: space.sm },
});
