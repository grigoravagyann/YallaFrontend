import { Ionicons } from '@expo/vector-icons';
import { MAX_BRANCH_SEARCH_LENGTH } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { Rise, riseDelay } from '../../src/components/motion/Rise';
import { usePressScale } from '../../src/components/motion/usePressScale';
import { PhotoImage } from '../../src/components/PhotoImage';
import {
  PlaceRowCard,
  ROW_CARD_HEIGHT,
  ROW_PHOTO_WIDTH,
} from '../../src/components/places/PlaceRowCard';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text, TextInput } from '../../src/components/Text';
import { useDinerProfile } from '../../src/data/accountQueries';
import { useNotificationCount } from '../../src/hooks/useNotificationCount';
import { initialsOf } from '../../src/lib/initials';
import { usePlaces } from '../../src/places/hooks';
import type { Place, PlaceBadge, PlaceType } from '../../src/places/model';
import { useSession } from '../../src/stores/session';
import { useActiveTab } from '../../src/stores/tab';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  iconSize,
  layout,
  placeTypeIcon,
  radius,
  space,
  typography,
  type IoniconName,
} from '../../src/theme';

const FILTERS: readonly PlaceBadge[] = ['popular', 'new'];
/** The kinds of place, after the badges: a café for coffee, a restaurant for dinner. */
const TYPES: readonly PlaceType[] = ['cafe', 'restaurant'];
/** Quick filters the list applies itself: the server knows nothing of "now" or "here". */
const QUICK = ['openNow', 'nearby'] as const;
type Quick = (typeof QUICK)[number];
type QuickState = Readonly<Record<Quick, boolean>>;
const NO_QUICK: QuickState = { openNow: false, nearby: false };
/** "Nearby" as a filter: under this many kilometres, by the phone's own position. */
const NEARBY_KM = 2;
/** Skeleton cards while the list loads — about what fits under the categories. */
const SKELETON_ROWS = 4;
const AVATAR = 48;
const TILE_HEIGHT = 94;

/**
 * What a category tile narrows the list to. A bar is not a kind of place the
 * model has (a place is a café or a restaurant), so the Bars tile filters on
 * this side and finds nothing — "nothing matched", honestly, rather than a
 * list of restaurants under a heading that says bars.
 */
type Kind = PlaceType | 'bar';

interface Category {
  readonly kind: Kind;
  readonly labelKey: string;
  readonly icon: IoniconName;
}

const CATEGORIES: readonly Category[] = [
  { kind: 'cafe', labelKey: 'explore.filter.cafes', icon: placeTypeIcon.cafe },
  { kind: 'restaurant', labelKey: 'explore.filter.restaurants', icon: placeTypeIcon.restaurant },
  { kind: 'bar', labelKey: 'explore.filter.bars', icon: 'beer-outline' },
];

/** Morning until noon, afternoon until six, evening after — and through the night. */
function dayPeriod(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Explore — the first screen anyone sees.
 *
 * A greeting with the way to the map and to notifications, a search field,
 * a row of quick filters, three category tiles and the places nearby as
 * photo-left row cards. The top stays put while the list scrolls under it,
 * so the search field never leaves the screen while somebody types.
 *
 * Five states, each drawn explicitly: loading (skeletons), offline, failed,
 * empty (two kinds: nothing matched, nothing nearby) and the list itself.
 */
export default function ExploreScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const navClearance = useNavClearance();

  const signedIn = useSession((s) => s.signedIn);
  const guestName = useSession((s) => s.guestName);
  const profile = useSession((s) => s.profile);
  const unread = useNotificationCount();
  // The greeting names the account, so read it here too: Explore is where a
  // restored session lands, before Profile has ever been opened.
  useDinerProfile();

  const [query, setQuery] = useState('');
  // Every place nearby to start with. "Popular" is earned — twenty sittings a
  // month, or strong reviews — and a new city has few that carry it, so opening
  // on it would greet most diners with "nothing matched". Tapping a selected
  // chip clears it.
  const [badge, setBadge] = useState<PlaceBadge | null>(null);
  // A kind of place narrows the list the same way a badge does; the two combine.
  const [kind, setKind] = useState<Kind | null>(null);
  const [quick, setQuick] = useState<QuickState>(NO_QUICK);
  const activeTabId = useActiveTab((s) => s.activeTabId);

  const type = kind === 'bar' ? null : kind;
  const filter = badge || type ? { ...(badge ? { badge } : {}), ...(type ? { type } : {}) } : null;
  const placesQuery = usePlaces({ query, ...(filter ? { filter } : {}) });
  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } = placesQuery;
  // The unfiltered list, for the category tiles' photos: the same query as the
  // list's own when nothing is filtered, so it costs no request of its own.
  const nearby = usePlaces().data;
  // An offline query is paused, never failed: without this the screen spins.
  const offline = isOfflinePaused(placesQuery) && !data;

  // Stable identity, so `?? []` does not hand FlatList a fresh array per render.
  const shown: readonly Place[] = useMemo(() => {
    if (kind === 'bar') return [];
    const places = data ?? [];
    if (!quick.openNow && !quick.nearby) return places;
    return places.filter(
      (place) =>
        (!quick.openNow || place.openState.isOpen) &&
        (!quick.nearby || (place.distanceKm !== null && place.distanceKm < NEARBY_KM)),
    );
  }, [data, kind, quick]);

  const chipFiltering = badge !== null || kind !== null || quick.openNow || quick.nearby;
  const filtering = query.trim() !== '' || chipFiltering;

  const clearFilters = useCallback(() => {
    setBadge(null);
    setKind(null);
    setQuick(NO_QUICK);
  }, []);

  const categoryPhoto = useMemo(() => {
    const source = nearby ?? data ?? [];
    const photoOf = (placeType: PlaceType) =>
      source.find((place) => place.type === placeType && place.photos[0])?.photos[0];
    return { cafe: photoOf('cafe'), restaurant: photoOf('restaurant'), bar: undefined };
  }, [nearby, data]);

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
          <PlaceRowCard place={item} onPress={openPlace} />
        </View>
      </Rise>
    ),
    [openPlace, stale],
  );

  const name = signedIn ? (profile?.displayName ?? guestName) : null;
  const shownName = name?.trim() || t('common:appName');
  const photoUrl = signedIn ? profile?.photo?.thumbnailUrl : undefined;
  const greeting = t(`explore.greeting.${dayPeriod(new Date().getHours())}`);
  const unreadLabel = unread > 99 ? '99+' : String(unread);
  const bellLabel =
    unread > 0 ? `${t('profile.notifications')}, ${unreadLabel}` : t('profile.notifications');

  const listHeader = (
    <View>
      <View style={styles.sectionRow}>
        <Text display accessibilityRole="header" style={styles.sectionTitle}>
          {t('explore.sections.categories')}
        </Text>
        <AllLink label={t('explore.filter.all')} onPress={clearFilters} />
      </View>
      <View style={styles.tiles}>
        {CATEGORIES.map((category) => (
          <CategoryTile
            key={category.kind}
            label={t(category.labelKey)}
            icon={category.icon}
            photo={categoryPhoto[category.kind]}
            selected={kind === category.kind}
            onPress={() => setKind(kind === category.kind ? null : category.kind)}
          />
        ))}
      </View>
      <Text display accessibilityRole="header" style={[styles.sectionTitle, styles.nearbyTitle]}>
        {t('explore.sections.nearby')}
      </Text>
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar photoUrl={photoUrl} name={shownName} />
        <View
          style={styles.hello}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${greeting} ${shownName}`}
        >
          <Text numberOfLines={1} style={styles.greeting}>
            {greeting}
          </Text>
          <Text display numberOfLines={1} style={styles.name}>
            {shownName}
          </Text>
        </View>
        <GlassPill
          icon={actionIcon.map}
          label={t('explore.map')}
          accessibilityLabel={t('explore.mapButton')}
          onPress={() => router.push('/map')}
        />
        <View>
          <IconButton
            icon="notifications-outline"
            accessibilityLabel={bellLabel}
            onPress={() => router.push('/notifications')}
          />
          {unread > 0 ? <View pointerEvents="none" style={styles.unreadDot} /> : null}
        </View>
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
          <Ionicons name={actionIcon.search} size={17} color={colors.textMuted} />
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
          {/* Decoration: the chips under the field are the filters. */}
          <View
            style={styles.filterMark}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="options-outline" size={iconSize.sm} color={colors.onPrimary} />
          </View>
        </View>
      </View>

      {/* Scrolls sideways: six chips never fit, in any of the three languages. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {QUICK.map((value) => (
          <Chip
            key={value}
            label={t(`explore.quick.${value}`)}
            selected={quick[value]}
            onPress={() => setQuick({ ...quick, [value]: !quick[value] })}
          />
        ))}
        {FILTERS.map((value) => (
          <Chip
            key={value}
            label={t(`explore.filter.${value}`)}
            selected={badge === value}
            // Tapping the selected chip clears it: no chip means every place.
            onPress={() => setBadge(badge === value ? null : value)}
          />
        ))}
        {TYPES.map((value) => (
          <Chip
            key={value}
            label={t(`place.type.${value}`)}
            icon={placeTypeIcon[value]}
            selected={kind === value}
            onPress={() => setKind(kind === value ? null : value)}
          />
        ))}
      </ScrollView>

      {offline ? (
        <ErrorState offline onRetry={() => void refetch()} />
      ) : isError && !isLoading ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <FlatList
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
              <SkeletonRows />
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
    </Screen>
  );
}

/**
 * The diner's photo, or their initials on the brand fill — also when the photo
 * will not load, rather than a broken-image glyph where a face should be.
 */
function Avatar({
  photoUrl,
  name,
}: {
  readonly photoUrl: string | undefined;
  readonly name: string;
}) {
  // The photo that failed, not a flag, so a new photo gets its own attempt.
  const [failed, setFailed] = useState<string | null>(null);
  if (photoUrl && failed !== photoUrl) {
    return (
      <PhotoImage
        source={photoUrl}
        style={styles.avatar}
        onLoad={(size) => {
          if (!size) setFailed(photoUrl);
        }}
      />
    );
  }
  return (
    <View
      style={[styles.avatar, styles.avatarInitials]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text display style={styles.initials}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** The map button: a glass pill with its glyph and a short label. */
function GlassPill({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  readonly icon: IoniconName;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [styles.pill, pressed && styles.glassPressed]}
      >
        <Ionicons name={icon} size={18} color={colors.text} />
        <Text numberOfLines={1} style={styles.pillLabel}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** "All →" beside the categories: every filter off, the search left alone. */
function AllLink({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.allLink, pressed && styles.allLinkPressed]}
    >
      <Text style={styles.allLabel}>{label}</Text>
      <Ionicons name="arrow-forward-outline" size={12} color={colors.primary} />
    </Pressable>
  );
}

/** One of the three category photos; tapping it narrows the list, again clears it. */
function CategoryTile({
  label,
  icon,
  photo,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly icon: IoniconName;
  readonly photo: string | undefined;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={[styles.tileWrap, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.tile, selected && styles.tileSelected]}
      >
        {photo ? (
          <PhotoImage source={photo} gradient={0.6} style={StyleSheet.absoluteFill} />
        ) : null}
        {/* The glyph in its own glass circle up top: in the pill beside the
            label it cut "Ռեստորաններ" to "Ռեստոր…" on a 390pt phone. */}
        <View style={styles.tileGlyph}>
          <Ionicons name={icon} size={13} color={colors.onImage} />
        </View>
        <View style={styles.tilePill}>
          <Text numberOfLines={1} style={styles.tileLabel}>
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The space between cards. FlatList draws it between items and nowhere else. */
function Gap() {
  return <View style={styles.gap} />;
}

/** The list's shape while it loads: the row card's photo on the left, four lines beside it. */
function SkeletonRows() {
  return (
    <View
      style={styles.skeletons}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <Skeleton width={ROW_PHOTO_WIDTH} height={ROW_CARD_HEIGHT} borderRadius={0} />
          <View style={styles.skeletonBody}>
            <Skeleton width="72%" height={14} />
            <Skeleton width="48%" height={10} />
            <Skeleton width="84%" height={10} />
            <Skeleton width="56%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: radius.pill },
  avatarInitials: {
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.h3, fontWeight: displayWeight.semibold, color: colors.onPrimary },
  hello: { flex: 1, minWidth: 0 },
  greeting: { ...typography.caption, color: colors.textMuted },
  name: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  pill: {
    height: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  glassPressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  pillLabel: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.text },
  unreadDot: {
    position: 'absolute',
    top: -1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  resume: {
    marginHorizontal: layout.screenPadding,
    marginTop: space.md,
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
  searchWrap: { paddingHorizontal: layout.screenPadding, paddingTop: space.md + 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    height: 50,
    paddingLeft: space.lg,
    paddingRight: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
  },
  filterMark: {
    width: layout.touchTarget - 2,
    height: layout.touchTarget - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Never squeezed by the list under it: the web build lets a ScrollView shrink.
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm + 2,
    paddingBottom: space.xs,
  },
  list: { paddingHorizontal: layout.screenPadding },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  nearbyTitle: { marginTop: space.xl + 2, marginBottom: space.sm + 2 },
  allLink: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: 2,
  },
  allLinkPressed: { opacity: 0.7 },
  allLabel: { fontSize: 13, lineHeight: 18, color: colors.primary },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  tileWrap: { flex: 1, minWidth: 0 },
  tile: {
    height: TILE_HEIGHT,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileSelected: { borderWidth: 2, borderColor: colors.primary },
  tilePill: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: space.xs,
    height: 28,
    justifyContent: 'center',
    paddingLeft: space.sm,
    paddingRight: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.overlayDark,
  },
  tileGlyph: {
    position: 'absolute',
    top: space.xs + 2,
    left: space.xs + 2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: fontWeight.medium,
    color: colors.onImage,
  },
  stale: { opacity: 0.6 },
  gap: { height: space.sm },
  skeletons: { gap: space.sm },
  skeletonCard: {
    flexDirection: 'row',
    height: ROW_CARD_HEIGHT,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  skeletonBody: {
    flex: 1,
    gap: space.sm + 2,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
});
