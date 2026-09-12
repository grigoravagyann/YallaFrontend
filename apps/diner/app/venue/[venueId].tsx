import {
  branchAvailability,
  isVenueOpenNow,
  venueFreeTables,
  type BranchSummary,
} from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { FreeTablesGlyph } from '../../src/components/FreeTablesGlyph';
import { QueryFailure, QueryLoading } from '../../src/components/QueryState';
import { Text } from '../../src/components/Text';
import { useVenue } from '../../src/data/queries';
import { branchHoursLine } from '../../src/lib/branchHours';
import { venueScreenState } from '../../src/lib/browse';

/**
 * Branches for one venue.
 *
 * This screen exists because a chain with four locations is four separate
 * paying customers and availability is per branch. "Lumen has 14 tables free"
 * is useless if they are all at the branch across town — so every branch row
 * carries its own count, its own glyph and its own closing time.
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
  const free = venueFreeTables(venue);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Native header gives Android hardware-back and the iOS swipe for free.
          Its title is blank because the page below owns the large title —
          setting both renders the venue name twice. */}
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <FlatList
        data={venue.branches}
        keyExtractor={(branch) => branch.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
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
            {/* Open with a count is one sentence in green; open with none, or
                shut, is a quiet one — and "none free" is said, so this header
                never disagrees with the Explore row that led here. */}
            {open && free > 0 ? (
              <Text style={[styles.openState, styles.openNow]}>
                {t('venue.openAcross', { count: free })}
              </Text>
            ) : (
              <Text style={[styles.openState, styles.closedNow]}>
                {open ? t('venue.noneFreeNow') : t('venue.closedNow')}
              </Text>
            )}
            <Text style={styles.sectionTitle}>{t('branches.title')}</Text>
          </View>
        }
        renderItem={({ item }) => <BranchRow branch={item} locale={locale} onPress={openBranch} />}
        ItemSeparatorComponent={Rule}
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

  // Times in the BRANCH's timezone, never the device's. A tourist's phone is
  // on Moscow time and this cafe is not. Only when there is a time to show:
  // the public card says open or shut and nothing more.
  const closesAt = branch.openState.closesAtUtc
    ? formatTime(branch.openState.closesAtUtc, branch.timeZoneId, locale)
    : null;
  const opensAt = branch.openState.opensAtUtc
    ? formatTime(branch.openState.opensAtUtc, branch.timeZoneId, locale)
    : null;

  /*
   * A shut branch says so in place of the count — and says when it opens,
   * when it knows. Every table is "free" at a closed venue, and a green
   * number over it would send somebody across town to a locked door.
   */
  const hours = branchHoursLine(availability, { opensAt, closesAt });
  const hoursLine = t(hours.key, hours.params);

  const availabilityLine =
    availability.kind === 'freeNow'
      ? t('branches.freeNow', { count: availability.count })
      : availability.kind === 'noneFreeNow'
        ? t('branches.noneFree')
        : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[branch.name, hoursLine, availabilityLine].filter(Boolean).join('. ')}
      onPress={() => onPress(branch.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <Text display style={styles.branchName} numberOfLines={1}>
          {branch.name}
        </Text>
        <Text style={styles.addressLine} numberOfLines={1}>
          {branch.addressLine}
        </Text>
        <Text style={styles.hours} numberOfLines={1}>
          {hoursLine}
        </Text>
        {availabilityLine ? (
          <Text style={[styles.availability, availability.kind !== 'freeNow' && styles.noneFree]}>
            {availabilityLine}
          </Text>
        ) : null}
      </View>

      <FreeTablesGlyph availability={availability} />
    </Pressable>
  );
}

/** The hairline between rows. FlatList draws it between items and nowhere else. */
function Rule() {
  return <View style={styles.rule} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  header: { paddingTop: space.lg, gap: 2 },
  venueName: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  venueMeta: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  openState: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, fontWeight: fontWeight.medium },
  openNow: { color: color.successInk },
  closedNow: { color: color.mutedForeground },
  sectionTitle: {
    paddingTop: space.xl,
    paddingBottom: space.xs,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touchTarget.minimum + space.lg,
    paddingVertical: space.lg,
  },
  rule: { height: 1, backgroundColor: color.border },
  rowPressed: { opacity: 0.7 },
  rowBody: { flex: 1, gap: 2 },
  branchName: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  addressLine: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
  },
  hours: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  availability: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: fontWeight.medium,
    color: color.successInk,
  },
  noneFree: { fontWeight: fontWeight.regular, color: color.mutedForeground },
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
