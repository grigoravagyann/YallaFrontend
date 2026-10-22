import { MAX_BRANCH_SEARCH_LENGTH } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { CategoryChips, type CategoryOption } from '../../src/components/explore/CategoryChips';
import {
  ExploreFilterSheet,
  NO_QUICK_FILTERS,
  QUICK_FILTERS,
  type QuickFilters,
} from '../../src/components/explore/ExploreFilterSheet';
import { ExploreHeader } from '../../src/components/explore/ExploreHeader';
import {
  EXPLORE_CARD_HEIGHT,
  EXPLORE_CARD_RADIUS,
  ExplorePlaceCard,
} from '../../src/components/explore/ExplorePlaceCard';
import { ExploreSearch } from '../../src/components/explore/ExploreSearch';
import { nearestFirst, repeatedVenues } from '../../src/components/explore/exploreList';
import { Rise, riseDelay } from '../../src/components/motion/Rise';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useNotificationCount } from '../../src/hooks/useNotificationCount';
import { usePlaces } from '../../src/places/hooks';
import type { Place, PlaceType } from '../../src/places/model';
import { useActiveTab } from '../../src/stores/tab';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  layout,
  space,
  typography,
} from '../../src/theme';

/** "Nearby" as a filter: under this many kilometres, by the phone's own position. */
const NEARBY_KM = 2;
/** Skeleton cards while the list loads — about what fits under the chips. */
const SKELETON_ROWS = 4;
/** One rhythm between the search, the chips, the heading and every card. */
const GAP = 10;
/** The white sheet's rounded top. */
const SHEET_RADIUS = 28;

type Category = 'all' | PlaceType;

/** The chips, in order; keys as literals so the i18n check sees each one. */
const CATEGORIES: readonly { readonly key: Category; readonly labelKey: string }[] = [
  { key: 'all', labelKey: 'explore.filter.all' },
  { key: 'cafe', labelKey: 'explore.filter.cafes' },
  { key: 'restaurant', labelKey: 'explore.filter.restaurants' },
  { key: 'bar', labelKey: 'explore.filter.bars' },
];

/**
 * Explore — the first screen anyone sees.
 *
 * On white: the SHURJ wordmark from the logo, the Map pill and the bell. Below it a white sheet with a rounded top carries the
 * search field (its filter button opens Open now / Nearby), the category chips
 * — All, Cafés, Restaurants, Bars — and "Discover places", nearest first, as
 * full-width photo cards. The top stays put while the list scrolls under it,
 * so the search field never leaves the screen while somebody types.
 *
 * Five states, each drawn explicitly: loading (skeletons), offline, failed,
 * empty (two kinds: nothing matched, nothing nearby) and the list itself.
 */
export default function ExploreScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const navClearance = useNavClearance();

  const unread = useNotificationCount();

  const [query, setQuery] = useState('');
  // Every place nearby to start with; a chip narrows the list to one kind.
  const [kind, setKind] = useState<PlaceType | null>(null);
  const [quick, setQuick] = useState<QuickFilters>(NO_QUICK_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeTabId = useActiveTab((s) => s.activeTabId);

  const placesQuery = usePlaces({ query, ...(kind ? { filter: { type: kind } } : {}) });
  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } = placesQuery;
  // An offline query is paused, never failed: without this the screen spins.
  const offline = isOfflinePaused(placesQuery) && !data;

  // Nearest first, as the server sends them; sorted again here (stably, so a
  // list with no distances keeps its order) so a quick filter never reorders it.
  const shown: readonly Place[] = useMemo(() => {
    const places = nearestFirst(data ?? []);
    if (!quick.openNow && !quick.nearby) return places;
    return places.filter(
      (place) =>
        (!quick.openNow || place.openState.isOpen) &&
        (!quick.nearby || (place.distanceKm !== null && place.distanceKm < NEARBY_KM)),
    );
  }, [data, quick]);
  const repeated = useMemo(() => repeatedVenues(shown), [shown]);

  const quickCount = QUICK_FILTERS.filter((key) => quick[key]).length;
  const chipFiltering = kind !== null || quickCount > 0;
  const filtering = query.trim() !== '' || chipFiltering;

  const clearFilters = useCallback(() => {
    setKind(null);
    setQuick(NO_QUICK_FILTERS);
  }, []);

  const openPlace = useCallback(
    (placeId: string) => {
      // Object form, not a template string: typed routes match on the route
      // pattern, so a literal path is not assignable.
      router.push({ pathname: '/place/[placeId]', params: { placeId } });
    },
    [router],
  );

  // A search in flight keeps the last list on screen, a shade quieter, instead
  // of tearing it down for skeletons on every keystroke.
  const stale = isPlaceholderData;
  const renderItem = useCallback(
    ({ item, index }: { item: Place; index: number }) => (
      <Rise delay={riseDelay(index)}>
        {/* Inside the Rise: its own opacity would override a dim set on it. */}
        <View style={stale && styles.stale}>
          <ExplorePlaceCard
            place={item}
            onPress={openPlace}
            showBranch={repeated.has(item.venueName.trim())}
          />
        </View>
      </Rise>
    ),
    [openPlace, stale, repeated],
  );

  const categories: readonly CategoryOption<Category>[] = useMemo(
    () => CATEGORIES.map((category) => ({ key: category.key, label: t(category.labelKey) })),
    [t],
  );

  const unreadLabel = unread > 99 ? '99+' : String(unread);
  const bellLabel =
    unread > 0 ? `${t('profile.notifications')}, ${unreadLabel}` : t('profile.notifications');

  const listHeader = (
    <Text display accessibilityRole="header" style={styles.sectionTitle}>
      {t('explore.discover')}
    </Text>
  );

  return (
    <Screen backgroundColor={colors.exploreGround}>
      <ExploreHeader
        brandName={t('explore.brandName')}
        mapAccessibilityLabel={t('explore.mapButton')}
        onMap={() => router.push('/map')}
        bellLabel={bellLabel}
        unread={unread > 0}
        onBell={() => router.push('/notifications')}
      />

      <View style={styles.sheet}>
        {/* The line between the header and the search, in the logo's burgundy. */}
        <View pointerEvents="none" style={styles.sheetEdge} />
        {/* A way back to a tab you wandered off. Not a persistent bar: it only
            exists while there is somewhere to go back to. */}
        {activeTabId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/tab/[tabId]', params: { tabId: activeTabId } })
            }
            style={({ pressed }) => [styles.resume, pressed && styles.resumePressed]}
          >
            <Text style={styles.resumeText}>{t('tab.resumeTitle')}</Text>
            <Text style={styles.resumeText}>{t('tab.resumeAction')}</Text>
          </Pressable>
        ) : null}

        <View style={styles.searchWrap}>
          <ExploreSearch
            value={query}
            onChangeText={setQuery}
            placeholder={t('explore.searchPlaceholder')}
            maxLength={MAX_BRANCH_SEARCH_LENGTH}
            clearLabel={t('explore.searchClear')}
            filtersLabel={t('explore.filterSheet.title')}
            activeFilters={quickCount}
            onFilters={() => setFiltersOpen(true)}
          />
        </View>

        <CategoryChips
          options={categories}
          selected={kind ?? 'all'}
          onSelect={(key) => setKind(key === 'all' ? null : key)}
          accessibilityLabel={t('explore.sections.categories')}
        />

        {offline ? (
          <ErrorState offline onRetry={() => void refetch()} />
        ) : isError && !isLoading ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <FlatList
            style={styles.listView}
            data={isLoading ? [] : shown}
            keyExtractor={(place) => place.id}
            renderItem={renderItem}
            ItemSeparatorComponent={Gap}
            ListHeaderComponent={listHeader}
            contentContainerStyle={[styles.list, { paddingBottom: navClearance }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            // Pull to refresh: Open / Closed moves with the clock, and a diner who
            // has been staring at the list for a minute wants the current one.
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={() => void refetch()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            // An empty result needs a real message, not a blank screen — and a
            // different one for "nothing matched" than for "nothing around here".
            ListEmptyComponent={
              isLoading ? (
                <SkeletonCards />
              ) : filtering ? (
                <EmptyState
                  icon={actionIcon.search}
                  title={t('explore.empty.title')}
                  body={t(chipFiltering ? 'explore.empty.fewerFilters' : 'explore.empty.body')}
                  action={{
                    label: t(chipFiltering ? 'explore.clearFilters' : 'explore.searchClear'),
                    onPress: () => {
                      setQuery('');
                      clearFilters();
                    },
                  }}
                />
              ) : (
                <EmptyState
                  icon={actionIcon.location}
                  title={t('explore.empty.nearby.title')}
                  body={t('explore.empty.nearby.body')}
                />
              )
            }
          />
        )}
      </View>

      <ExploreFilterSheet
        visible={filtersOpen}
        value={quick}
        onChange={setQuick}
        onClose={() => setFiltersOpen(false)}
      />
    </Screen>
  );
}

/** The space between cards. FlatList draws it between items and nowhere else. */
function Gap() {
  return <View style={styles.gap} />;
}

/** The list's shape while it loads: the cards' own size and corners. */
function SkeletonCards() {
  return (
    <View
      style={styles.skeletons}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} height={EXPLORE_CARD_HEIGHT} borderRadius={EXPLORE_CARD_RADIUS} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetEdge: {
    position: 'absolute',
    // A little below the sheet's top, closer to the header than to the search.
    top: 4,
    left: layout.screenPadding,
    right: layout.screenPadding,
    height: 1,
    backgroundColor: colors.logoInk,
  },
  sheet: {
    flex: 1,
    marginTop: space.sm,
    paddingTop: 18,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    backgroundColor: colors.surface,
  },
  resume: {
    marginHorizontal: layout.screenPadding,
    marginBottom: GAP,
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  resumePressed: { backgroundColor: colors.border },
  resumeText: { ...typography.body, fontWeight: fontWeight.medium, color: colors.primary },
  searchWrap: { paddingHorizontal: layout.screenPadding, marginBottom: GAP },
  listView: { flex: 1 },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: GAP },
  sectionTitle: {
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.2,
    fontWeight: displayWeight.bold,
    color: colors.brand,
    marginBottom: GAP,
  },
  stale: { opacity: 0.6 },
  gap: { height: GAP },
  skeletons: { gap: GAP },
});
