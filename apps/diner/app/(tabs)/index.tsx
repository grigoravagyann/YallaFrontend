import { Ionicons } from '@expo/vector-icons';
import { MAX_BRANCH_SEARCH_LENGTH } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { PlaceHeroCard } from '../../src/components/places/PlaceHeroCard';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text, TextInput } from '../../src/components/Text';
import { usePlaces } from '../../src/places/hooks';
import type { Place, PlaceBadge } from '../../src/places/model';
import { useActiveTab } from '../../src/stores/tab';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  typography,
} from '../../src/theme';

const FILTERS: readonly PlaceBadge[] = ['popular', 'new'];
/** Skeleton cards while the list loads — about what fits under the header. */
const SKELETON_ROWS = 4;

/**
 * Explore — the first screen anyone sees.
 *
 * A title, a search field, two chips and a column of photo-first cards. The
 * photo is the card: name, kind, rating and distance sit on it, with the
 * Open / Closed pill in the corner, so a scan down the list is a scan of the
 * neighbourhood. The map button top-right opens the same places as pins.
 *
 * Five states, each drawn explicitly: loading (skeletons), offline, failed,
 * empty (two kinds: nothing matched, nothing nearby) and the list itself.
 */
export default function ExploreScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const navClearance = useNavClearance();

  const [query, setQuery] = useState('');
  // Every place nearby to start with. "Popular" is earned — twenty sittings a
  // month, or strong reviews — and a new city has few that carry it, so opening
  // on it would greet most diners with "nothing matched". Tapping a selected
  // chip clears it.
  const [badge, setBadge] = useState<PlaceBadge | null>(null);
  const activeTabId = useActiveTab((s) => s.activeTabId);

  const placesQuery = usePlaces({ query, ...(badge ? { filter: { badge } } : {}) });
  const { data, isLoading, isError, error, isFetching, isPlaceholderData, refetch } = placesQuery;
  // An offline query is paused, never failed: without this the screen spins.
  const offline = isOfflinePaused(placesQuery) && !data;
  // Until the backend publishes browse endpoints, real mode rejects with this.
  const unavailable =
    isError && error instanceof Error && error.name === 'PlaceApiNotImplementedError';
  // Stable identity, so `?? []` does not hand FlatList a fresh array per render.
  const places: readonly Place[] = useMemo(() => data ?? [], [data]);
  const filtering = query.trim() !== '' || badge !== null;

  const openPlace = useCallback(
    (placeId: string) => {
      // Object form, not a template string: typed routes match on the route
      // pattern, so a literal path is not assignable.
      router.push({ pathname: '/place/[placeId]', params: { placeId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Place }) => <PlaceHeroCard place={item} onPress={openPlace} />,
    [openPlace],
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text display style={styles.title}>
          {t('explore.title')}
        </Text>
        <IconButton
          icon={actionIcon.map}
          shape="square"
          accessibilityLabel={t('explore.mapButton')}
          onPress={() => router.push('/map')}
        />
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
        <View style={styles.search}>
          <Ionicons name={actionIcon.search} size={iconSize.md} color={colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            autoCorrect={false}
            returnKeyType="search"
            // The server refuses a longer search outright.
            maxLength={MAX_BRANCH_SEARCH_LENGTH}
            accessibilityLabel={t('explore.searchPlaceholder')}
          />
          {query ? (
            <IconButton
              icon={actionIcon.close}
              size="sm"
              variant="ghost"
              iconColor={colors.textMuted}
              accessibilityLabel={t('explore.searchClear')}
              onPress={() => setQuery('')}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.chips}>
        {FILTERS.map((value) => (
          <Chip
            key={value}
            label={t(`explore.filter.${value}`)}
            size="sm"
            selected={badge === value}
            // Tapping the selected chip clears it: no chip means every place.
            onPress={() => setBadge(badge === value ? null : value)}
          />
        ))}
      </View>

      {offline ? (
        <ErrorState offline onRetry={() => void refetch()} />
      ) : isLoading ? (
        <SkeletonList />
      ) : unavailable ? (
        <ErrorState title={t('net.notAvailable')} body={t('net.notAvailableBody')} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(place) => place.id}
          renderItem={renderItem}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={[styles.list, { paddingBottom: navClearance }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          // A search in flight keeps the last list on screen, a shade quieter,
          // instead of tearing it down for skeletons on every keystroke.
          style={isPlaceholderData && styles.listStale}
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
            filtering ? (
              <EmptyState
                icon={actionIcon.search}
                title={t('explore.empty.title')}
                body={t('explore.empty.body')}
                {...(query
                  ? { action: { label: t('explore.searchClear'), onPress: () => setQuery('') } }
                  : {})}
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
    </Screen>
  );
}

/** The space between cards. FlatList draws it between items and nowhere else. */
function Gap() {
  return <View style={styles.gap} />;
}

/** The list's shape while it loads: the same height and corners as the cards. */
function SkeletonList() {
  return (
    <View style={styles.list} accessibilityElementsHidden>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton
          key={index}
          height={layout.heroCardHeight}
          borderRadius={radius.card}
          style={index > 0 && styles.gapAbove}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  title: { ...typography.title, color: colors.text },
  resume: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.md,
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  resumePressed: { backgroundColor: colors.border },
  resumeText: { ...typography.body, fontWeight: fontWeight.medium, color: colors.primary },
  searchWrap: { paddingHorizontal: layout.screenPadding, paddingBottom: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.controlHeight,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    borderRadius: radius.search,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
  },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  listStale: { opacity: 0.6 },
  gap: { height: layout.cardGap },
  gapAbove: { marginTop: layout.cardGap },
});
