import type { VenueSummary, VenueType } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { QueryFailure, QueryLoading } from '../../src/components/QueryState';
import { Text, TextInput } from '../../src/components/Text';
import { VenueCard } from '../../src/components/VenueCard';
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
 * It has to look worth browsing rather than like a utility, so the venue cards
 * lead with the one number only this app can show: how many tables are free
 * right now.
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

  const openVenue = useCallback(
    (venueId: string) => {
      // Object form, not a template string: typed routes match on the route
      // pattern, so a literal path is not assignable.
      router.push({ pathname: '/venue/[venueId]', params: { venueId } });
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text display style={styles.city}>
          {t('explore.city')}
        </Text>
        <Text style={styles.count}>{t('explore.placesNearby', { count: venues.length })}</Text>
      </View>

      {/* A way back to a tab you wandered off. Not a persistent bar: it only
          exists while there is somewhere to go back to. */}
      {activeTabId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/tab/[tabId]', params: { tabId: activeTabId } })}
          style={({ pressed }) => [styles.resume, pressed && styles.resumePressed]}
        >
          <Text style={styles.resumeTitle}>{t('tab.resumeTitle')}</Text>
          <Text style={styles.resumeAction}>{t('tab.resumeAction')}</Text>
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
          renderItem={({ item }) => <VenueCard venue={item} onPress={openVenue} />}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
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
  count: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
  },
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
  resumeTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.primaryPressed,
  },
  resumeAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.primaryPressed,
  },
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  search: {
    minHeight: touchTarget.regular,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.foreground,
    fontSize: fontSize.md,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chip: {
    minHeight: touchTarget.small,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipActive: {
    borderColor: color.primaryPressed,
    backgroundColor: color.greenTint,
  },
  chipText: { fontSize: fontSize.sm, color: color.foreground },
  chipTextActive: { color: color.primaryPressed, fontWeight: fontWeight.medium },
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
