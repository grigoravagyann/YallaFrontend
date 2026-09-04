import { findBranch } from '@yalla/api/mocks';
import { FloorPlan, Legend, availabilityWindow } from '@yalla/floorplan';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, space } from '@yalla/tokens';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  BookingContextBar,
  nextHalfHour,
  type BookingContext,
} from '../../src/components/BookingContextBar';

/**
 * Pick a table at one branch.
 *
 * The booking context (date, time, party size) is held here and passed down:
 * party size decides which tables the diner may select, and the chosen slot
 * decides which count as `reservedSoon`.
 */
export default function BranchFloorPlanScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { branchId } = useLocalSearchParams<{ branchId: string }>();

  const found = useMemo(() => (branchId ? findBranch(branchId) : null), [branchId]);

  const [booking, setBooking] = useState<BookingContext>(() => ({
    slotUtc: nextHalfHour(new Date()),
    partySize: 2,
  }));
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // Stable identity: a fresh literal every render would defeat the floor plan's
  // layout memo, which matters once live updates arrive.
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  const handleTap = useCallback(
    (tableId: string) => setSelectedTableId((current) => (current === tableId ? null : tableId)),
    [],
  );

  if (!found) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('floorPlan.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { venue, branch } = found;
  const selected = selectedTableId
    ? branch.floor.tables.find((x) => x.id === selectedTableId)
    : undefined;

  // The window is surfaced BEFORE the diner confirms: the limit is told, not
  // asked. If it is too short they can see tables with no limit and pick one.
  const window = selected
    ? availabilityWindow(selected, booking.slotUtc, branch.timeZoneId, locale)
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerShown: true,
          // Blank: the page header below already shows venue + branch.
          title: '',
          headerBackTitle: t('floorPlan.back'),
        }}
      />

      <View style={styles.header}>
        <Text style={styles.venue}>{venue.name}</Text>
        <Text style={styles.branch}>{branch.name}</Text>
      </View>

      <BookingContextBar
        value={booking}
        onChange={setBooking}
        timeZoneId={branch.timeZoneId}
        locale={locale}
      />

      <View style={styles.legendWrap}>
        <Legend mode="diner" translate={(key) => t(`common:${key}`, { ns: 'common' })} />
      </View>

      <Text style={styles.status} numberOfLines={2}>
        {window
          ? `${selected?.label} · ${window.range}`
          : selected
            ? selected.label
            : t('floorPlan.title')}
      </Text>

      <View style={styles.planWrap} onLayout={onLayout}>
        <FloorPlan
          plan={branch.floor}
          mode="diner"
          partySize={booking.partySize}
          selectedTableId={selectedTableId}
          onTableTap={handleTap}
          viewport={viewport}
          accessibilityLabel={t('floorPlan.title')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  venue: { fontSize: fontSize.sm, color: color.textSecondary },
  branch: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
  },
  legendWrap: { paddingHorizontal: space.lg },
  status: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.textPrimary,
    minHeight: 20,
  },
  planWrap: { flex: 1, marginHorizontal: space.lg, marginBottom: space.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: color.textPrimary,
    textAlign: 'center',
  },
});
