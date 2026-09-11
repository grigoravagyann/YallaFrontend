import { branchAvailability, isVenueOpenNow, type BranchSummary } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { QueryFailure, QueryLoading } from '../../src/components/QueryState';
import { Text } from '../../src/components/Text';
import { useVenue } from '../../src/data/queries';
import { venueScreenState } from '../../src/lib/browse';

/**
 * Branches for one venue.
 *
 * This screen exists because a chain with four locations is four separate
 * paying customers and availability is per branch. "Lumen has 14 tables free"
 * is useless if they are all at the branch across town.
 */
export default function BranchesScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { venueId } = useLocalSearchParams<{ venueId: string }>();

  const venueQuery = useVenue(venueId);
  const { data: venue, isLoading, isError, error, refetch } = venueQuery;
  const state = venueScreenState({
    offline: isOfflinePaused(venueQuery),
    isLoading,
    isError,
    venue,
  });

  const openBranch = useCallback(
    (branchId: string) => {
      router.push({ pathname: '/branch/[branchId]', params: { branchId, venueId: venueId ?? '' } });
    },
    [router, venueId],
  );

  if (state !== 'ready' || !venue) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        {state === 'offline' ? (
          <QueryFailure offline onRetry={() => void refetch()} />
        ) : state === 'loading' ? (
          <QueryLoading label={t('branches.loading')} />
        ) : state === 'error' ? (
          <QueryFailure error={error} onRetry={() => void refetch()} />
        ) : (
          // Gone, not empty: an old link, or a venue suspended since the list
          // was read. "No locations listed yet" would describe a real venue.
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>{t('venue.notFound.title')}</Text>
            <Text style={styles.emptyBody}>{t('venue.notFound.body')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const open = isVenueOpenNow(venue);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Native header gives Android hardware-back and the iOS swipe for free.
          Its title is blank because the page below owns the large title —
          setting both renders the venue name twice. */}
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <View style={styles.header}>
        <Text display style={styles.venueName}>
          {venue.name}
        </Text>
        <Text style={styles.venueMeta}>
          {t('venue.typeAndBranches', {
            type: t(`venue.type.${venue.type}`),
            branches: t('venue.branchCount', { count: venue.branches.length }),
          })}
        </Text>
        <Text style={[styles.openState, open ? styles.openNow : styles.closedNow]}>
          {open ? t('venue.openNow') : t('venue.closedNow')}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>{t('branches.title')}</Text>

      <FlatList
        data={venue.branches}
        keyExtractor={(branch) => branch.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <BranchRow branch={item} locale={locale} onPress={openBranch} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>{t('branches.empty.title')}</Text>
            <Text style={styles.emptyBody}>{t('branches.empty.body')}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function BranchRow({
  branch,
  locale,
  onPress,
}: {
  branch: BranchSummary;
  locale: Parameters<typeof formatTime>[2];
  onPress: (branchId: string) => void;
}) {
  const { t } = useTranslation('diner');
  const availability = branchAvailability(branch);

  // Closing time in the BRANCH's timezone, never the device's. A tourist's
  // phone is on Moscow time and this cafe is not. Only when there is a time to
  // show: the public card says open or shut and nothing more.
  const closesAt = branch.openState.closesAtUtc
    ? formatTime(branch.openState.closesAtUtc, branch.timeZoneId, locale)
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={branch.name}
      onPress={() => onPress(branch.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.branchName} numberOfLines={1}>
          {branch.name}
        </Text>

        <Text style={styles.addressLine} numberOfLines={1}>
          {branch.addressLine}
        </Text>

        {/*
          A shut branch says so in place of the count. Every table is "free" at
          a closed venue, and a green number over it would send somebody across
          town to a locked door.
        */}
        {availability.kind === 'closed' ? (
          <Text style={styles.noneFree}>{t('branches.closed')}</Text>
        ) : (
          <>
            <Text style={styles.hours} numberOfLines={1}>
              {closesAt ? t('branches.openUntil', { time: closesAt }) : t('branches.openNow')}
            </Text>
            {availability.kind === 'freeNow' ? (
              <Text style={styles.availability}>
                {t('branches.freeNow', { count: availability.count })}
              </Text>
            ) : (
              <Text style={styles.noneFree}>{t('branches.noneFree')}</Text>
            )}
          </>
        )}
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: 2 },
  venueName: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  venueMeta: { fontSize: fontSize.sm, color: color.mutedForeground },
  openState: { marginTop: space.xs, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  openNow: { color: color.success },
  closedNow: { color: color.mutedForeground },
  sectionTitle: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touchTarget.minimum + space.lg,
    padding: space.lg,
    marginBottom: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
  },
  rowPressed: { backgroundColor: color.greenTint, transform: [{ scale: 0.97 }] },
  rowBody: { flex: 1, gap: 2 },
  branchName: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  addressLine: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.foreground,
  },
  hours: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  availability: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.success,
  },
  noneFree: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    color: color.mutedForeground,
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
  emptyBody: { fontSize: fontSize.sm, color: color.mutedForeground, textAlign: 'center' },
});
