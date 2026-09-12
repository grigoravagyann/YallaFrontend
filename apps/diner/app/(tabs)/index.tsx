import { venueAvailability, venueFreeTables, type VenueSummary, type VenueType } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { QueryFailure, QueryLoading } from '../../src/components/QueryState';
import { Text, TextInput } from '../../src/components/Text';
import { VenueRow } from '../../src/components/VenueRow';
import { useVenues } from '../../src/data/queries';
import { useActiveTab } from '../../src/stores/tab';

type Filter = 'all' | 'cafes' | 'restaurants';

const FILTERS: readonly { key: Filter; type: VenueType | null }[] = [
  { key: 'all', type: null },
  { key: 'cafes', type: 'cafe' },
  { key: 'restaurants', type: 'restaurant' },
];

/**
 * Explore — the first screen anyone sees.
 *
 * The city is the title and the lead line under it is the number only this
 * app can show: how many tables are free across the city right now. The list
 * below is rows on the page, not cards, and each row carries its free count
 * twice — as a sentence and as green squares — so a scan down the list is a
 * scan of the city's free tables.
 *
 * Four states, explicitly: loading, empty, error and offline. The last two are
 * told apart by the client, not guessed here.
 */
export default function ExploreScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const activeTabId = useActiveTab((s) => s.activeTabId);

  const venuesQuery = useVenues();
  const { data, isLoading, isError, error, isFetching, refetch } = venuesQuery;
  // An offline query is paused, never failed: without this the screen spins.
  const offline = isOfflinePaused(venuesQuery);
  // Stable identity, so the filter memo below is not defeated by `?? []`
  // producing a fresh array on every render.
  const venues: readonly VenueSummary[] = useMemo(() => data ?? [], [data]);

  // Free tables at open branches only — see `venueFreeTables`. Said above the
  // list because it is the whole pitch, and left out when it is zero: "0
  // tables free in 12 places" at 02:00 is true and reads as a broken app.
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const wanted = FILTERS.find((f) => f.key === filter)?.type ?? null;

    return venues.filter((venue) => {
      if (wanted && venue.type !== wanted) return false;
      if (!needle) return true;
      // Match branch names too: someone searching "Cascade" means the branch.
      return (
        venue.name.toLocaleLowerCase().includes(needle) ||
        venue.branches.some((b) => b.name.toLocaleLowerCase().includes(needle))
      );
    });
  }, [venues, query, filter]);

  // Over the rows on screen, not the whole city: with "Cafes" selected the
  // line above three cafés must not quote the restaurants' tables too.
  const freeAcrossCity = useMemo(
    () => visible.reduce((total, venue) => total + venueFreeTables(venue), 0),
    [visible],
  );
  // The places those tables are at — not every row, which would count the
  // ones saying "Closed" a few lines down.
  const placesWithFree = useMemo(
    () => visible.filter((venue) => venueAvailability(venue).kind === 'freeNow').length,
    [visible],
  );

  const openVenue = useCallback(
    (venueId: string) => {
      // Object form, not a template string: typed routes match on the route
      // pattern, so a literal path is not assignable.
      router.push({ pathname: '/venue/[venueId]', params: { venueId } });
    },
    [router],
  );

  const places = t('explore.placesNearby', { count: venues.length });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text display style={styles.city}>
          {t('explore.city')}
        </Text>
        {freeAcrossCity > 0 ? (
          <Text style={styles.lead}>
            <Text style={styles.leadFree}>{t('explore.freeLead', { count: freeAcrossCity })}</Text>
            {` ${t('explore.inPlaces', { count: placesWithFree })}`}
          </Text>
        ) : (
          <Text style={styles.lead}>{places}</Text>
        )}
      </View>

      {/* A way back to a tab you wandered off. Not a persistent bar: it only
          exists while there is somewhere to go back to. */}
      {activeTabId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/tab/[tabId]', params: { tabId: activeTabId } })}
          style={({ pressed }) => [styles.resume, pressed && styles.resumePressed]}
        >
          <Text style={styles.resumeText}>{t('tab.resumeTitle')}</Text>
          <Text style={styles.resumeText}>{t('tab.resumeAction')}</Text>
        </Pressable>
      ) : null}

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('explore.searchPlaceholder')}
          placeholderTextColor={color.mutedForeground}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('explore.searchPlaceholder')}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.chips}>
        {FILTERS.map(({ key }) => {
          const active = key === filter;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(`explore.filter.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {offline && !data ? (
        <QueryFailure offline onRetry={() => void refetch()} />
      ) : isLoading ? (
        <QueryLoading label={t('explore.loading')} />
      ) : isError ? (
        <QueryFailure error={error} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(venue) => venue.id}
          renderItem={({ item }) => <VenueRow venue={item} onPress={openVenue} />}
          ItemSeparatorComponent={Rule}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          // Pull to refresh: the free-table counts move, and a diner who has
          // been staring at the list for a minute wants the current ones.
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
          // An empty search result needs a real message, not a blank screen.
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>{t('explore.empty.title')}</Text>
              <Text style={styles.emptyBody}>{t('explore.empty.body')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/** The hairline between rows. FlatList draws it between items and nowhere else. */
function Rule() {
  return <View style={styles.rule} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  rule: { height: 1, backgroundColor: color.border },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  city: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  lead: {
    marginTop: 2,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
  },
  leadFree: { fontWeight: fontWeight.medium, color: color.successInk },
  resume: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.greenTint,
  },
  resumePressed: { opacity: 0.8 },
  resumeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.primaryInk,
  },
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  search: {
    minHeight: touchTarget.regular,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderInteractive,
    backgroundColor: color.surface,
    color: color.foreground,
    fontSize: fontSize.md,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  chip: {
    minHeight: touchTarget.small,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderInteractive,
    backgroundColor: color.surface,
  },
  chipActive: {
    borderColor: color.primaryInk,
    backgroundColor: color.greenTint,
  },
  chipText: { fontSize: fontSize.sm, color: color.foreground },
  chipTextActive: { color: color.primaryInk, fontWeight: fontWeight.medium },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  centered: { alignItems: 'center', paddingTop: space.xxl, gap: space.sm },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: color.mutedForeground,
    textAlign: 'center',
  },
});
