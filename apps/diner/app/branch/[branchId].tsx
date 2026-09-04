import type { TableAvailability } from '@yalla/api';
import { FloorPlan, Legend } from '@yalla/floorplan';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, radius, space } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Text } from '../../src/components/Text';
import {
  BookingContextBar,
  nextHalfHour,
  type BookingContext,
} from '../../src/components/BookingContextBar';
import { TableSheet } from '../../src/components/TableSheet';
import { useFloorPlan, useTableAvailability, useVenue } from '../../src/data/queries';
import { useConflict } from '../../src/stores/conflict';
import { useSession } from '../../src/stores/session';

/**
 * Pick a table at one branch.
 *
 * The booking context (date, time, party size) is held here and passed down:
 * party size decides which tables are selectable, the slot decides each table's
 * availability window. This screen stays mounted while verification and
 * confirmation are pushed on top of it — that is what preserves the diner's
 * selected table across the whole round trip, including Android hardware back.
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
  const clearConflict = useConflict((c) => c.clear);

  const [booking, setBooking] = useState<BookingContext>(() => ({
    slotUtc: nextHalfHour(new Date()),
    partySize: 2,
  }));
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [sheetTableId, setSheetTableId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const slotIso = useMemo(() => booking.slotUtc.toISOString(), [booking.slotUtc]);

  const floorQuery = useFloorPlan(branchId);
  const availabilityQuery = useTableAvailability({
    branchId,
    slotUtc: slotIso,
    partySize: booking.partySize,
  });
  const venueQuery = useVenue(venueId);

  const branchSummary = venueQuery.data?.branches.find((b) => b.id === branchId);
  const timeZoneId = floorQuery.data?.timeZoneId ?? branchSummary?.timeZoneId ?? 'Asia/Yerevan';

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

  const sheetAvailability: TableAvailability | null = useMemo(
    () => availabilityQuery.data?.find((a) => a.tableId === sheetTableId) ?? null,
    [sheetTableId, availabilityQuery.data],
  );

  /**
   * Reserving requires a verified phone — asked for here and nowhere earlier.
   * Ordering and paying later will not require it.
   */
  const handleReserve = useCallback(
    (tableId: string) => {
      setSheetTableId(null);
      const verified = useSession.getState().verificationToken !== null;
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

  if (floorQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <ActivityIndicator color={color.primary} />
          <Text style={styles.muted}>{t('net.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!floorQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('floorPlan.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{ headerShown: true, title: '', headerBackTitle: t('floorPlan.back') }}
      />

      <View style={styles.header}>
        <Text style={styles.venue}>{venueQuery.data?.name ?? ''}</Text>
        <Text style={styles.branch}>{branchSummary?.name ?? ''}</Text>
      </View>

      <BookingContextBar
        value={booking}
        onChange={(next) => {
          setBooking(next);
          setSelectedTableId(null);
        }}
        timeZoneId={timeZoneId}
        locale={locale}
      />

      <View style={styles.legendWrap}>
        <Legend mode="diner" translate={(key) => t(key, { ns: 'common' })} />
      </View>

      {conflictLabel ? (
        <Text style={styles.conflict}>
          {t('confirm.error.tableTaken', { label: conflictLabel })}
        </Text>
      ) : (
        <Text style={styles.status}>{t('floorPlan.title')}</Text>
      )}

      <View style={styles.planWrap} onLayout={onLayout}>
        <FloorPlan
          plan={floorQuery.data}
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
        timeZoneId={timeZoneId}
        locale={locale}
        onReserve={handleReserve}
        onClose={() => setSheetTableId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  venue: { fontSize: fontSize.sm, color: color.mutedForeground },
  branch: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.foreground },
  legendWrap: { paddingHorizontal: space.lg },
  status: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    fontSize: fontSize.sm,
    color: color.mutedForeground,
    minHeight: 20,
  },
  // A lost table is information with the next action attached, not an error
  // and not a coloured banner beside the plan. Ink on paper, one hairline.
  conflict: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.paper,
    color: color.foreground,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  planWrap: { flex: 1, marginHorizontal: space.lg, marginBottom: space.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  muted: { fontSize: fontSize.sm, color: color.mutedForeground },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
});
