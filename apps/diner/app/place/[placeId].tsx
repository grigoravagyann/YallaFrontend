import { isOfflinePaused } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { PhotoImage } from '../../src/components/PhotoImage';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { AmenityChips } from '../../src/components/place/AmenityChips';
import { PlaceActions } from '../../src/components/place/PlaceActions';
import { ReviewComposer } from '../../src/components/place/ReviewComposer';
import { PlaceTabs, type PlaceTab } from '../../src/components/place/PlaceTabs';
import { PlaceMetaRow, usePlaceCopy } from '../../src/components/places/placeCopy';
import { TableLegend } from '../../src/components/tables/TableLegend';
import { TablePhotoView } from '../../src/components/tables/TablePhotoView';
import { placeKeys, usePlace, usePlaceTables } from '../../src/places/hooks';
import {
  formatClock,
  tablePhotoOf,
  type Place,
  type TablePhotoMarker,
} from '../../src/places/model';
import { floorPlanParams } from '../../src/places/navigation';
import { PlaceMenu } from '../../src/places/PlaceMenu';
import { ReviewList } from '../../src/places/ReviewList';
import { useFavorites, useIsFavorite } from '../../src/stores/favorites';
import {
  actionIcon,
  colors,
  fontWeight,
  layout,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
} from '../../src/theme';

/** How far the white sheet climbs over the hero photo. */
const SHEET_OVERLAP = 20;
/** The hero is about two fifths of the screen. */
const HERO_FRACTION = 0.4;

/**
 * One place: photos, the facts, the menu and — the core of the product — the
 * live table photo you book from.
 *
 * `placeId` is the API branch id, so Book, the floor plan and the confirm
 * screen underneath all key on the same thing.
 */
export default function PlaceDetailsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(windowHeight * HERO_FRACTION);

  const placeQuery = usePlace(placeId);
  const tablesQuery = usePlaceTables(placeId);

  // The markers are read every few seconds, the place every few minutes. When
  // the markers name a different cover than the place holds, the cover has
  // changed: read the place again — once per new cover — so the hero agrees.
  const queryClient = useQueryClient();
  const markersPhoto = tablesQuery.data?.photo;
  const placeCover = placeQuery.data ? tablePhotoOf(placeQuery.data) : undefined;
  const refreshedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!placeId || markersPhoto === undefined || placeCover === undefined) return;
    if (markersPhoto === placeCover || refreshedFor.current === markersPhoto) return;
    refreshedFor.current = markersPhoto;
    void queryClient.invalidateQueries({ queryKey: placeKeys.detail(placeId) });
  }, [placeId, markersPhoto, placeCover, queryClient]);

  const openBooking = useCallback(
    (table?: TablePhotoMarker) => {
      if (!placeId) return;
      router.push({
        pathname: '/book/[placeId]',
        params: table
          ? {
              placeId,
              tableId: table.tableId,
              tableLabel: table.label,
              capacityMin: String(table.capacityMin),
              capacityMax: String(table.capacityMax),
            }
          : { placeId },
      });
    },
    [router, placeId],
  );

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const retry = useCallback(() => {
    void placeQuery.refetch();
    void tablesQuery.refetch();
  }, [placeQuery, tablesQuery]);

  if (placeQuery.isLoading || (!placeQuery.data && placeQuery.isFetching)) {
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <DetailsSkeleton heroHeight={heroHeight} onBack={back} />
      </Screen>
    );
  }

  if (placeQuery.isError || isOfflinePaused(placeQuery)) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <HeaderRow onBack={back} />
        <ErrorState offline={isOfflinePaused(placeQuery)} onRetry={retry} style={styles.centered} />
      </Screen>
    );
  }

  const place = placeQuery.data ?? null;
  if (!place) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <HeaderRow onBack={back} />
        <EmptyState
          icon={actionIcon.error}
          title={t('floorPlan.notFound')}
          action={{ label: t('floorPlan.back'), onPress: back }}
          style={styles.centered}
        />
      </Screen>
    );
  }

  return (
    <PlaceDetails
      place={place}
      tables={tablesQuery.data?.tables ?? place.tables}
      // The markers' own photo once they have answered: their positions refer to it.
      tablePhoto={tablesQuery.data ? tablesQuery.data.photo : tablePhotoOf(place)}
      heroHeight={heroHeight}
      onBack={back}
      onBook={openBooking}
    />
  );
}

interface PlaceDetailsProps {
  readonly place: Place;
  readonly tables: readonly TablePhotoMarker[];
  /** The cover the markers sit on; `null` when there is none. */
  readonly tablePhoto: string | null;
  readonly heroHeight: number;
  readonly onBack: () => void;
  readonly onBook: (table?: TablePhotoMarker) => void;
}

function PlaceDetails({
  place,
  tables,
  tablePhoto,
  heroHeight,
  onBack,
  onBook,
}: PlaceDetailsProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const copy = usePlaceCopy(place);

  const favorite = useIsFavorite(place.id);
  const toggleFavorite = useFavorites((state) => state.toggle);

  const [tab, setTab] = useState<PlaceTab>('about');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  // Light status bar over the photo; dark once the white sheet has scrolled
  // up under it, or the clock would be white on white.
  const [sheetUnderBar, setSheetUnderBar] = useState(false);
  const onSheetScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const under = event.nativeEvent.contentOffset.y > heroHeight - insets.top - SHEET_OVERLAP;
      setSheetUnderBar((current) => (current === under ? current : under));
    },
    [heroHeight, insets.top],
  );

  const photos = place.photos.length > 0 ? place.photos : [''];

  const onHeroScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (windowWidth <= 0) return;
      const index = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
      setPhotoIndex(Math.max(0, Math.min(photos.length - 1, index)));
    },
    [windowWidth, photos.length],
  );

  const share = useCallback(() => {
    const message = [place.name, place.address, place.website ?? ''].filter(Boolean).join('\n');
    // The web build has no share sheet outside a secure context; a refused
    // share is nothing to report.
    void Share.share({ message, title: place.name }).catch(() => undefined);
  }, [place.name, place.address, place.website]);

  const openFloorPlan = useCallback(() => {
    // Slugs, names and the zone travel with it: the floor plan reads the
    // booking rules by slug and never has to look the venue up again.
    router.push({ pathname: '/branch/[branchId]', params: floorPlanParams(place) });
  }, [router, place]);

  const openAllReviews = useCallback(() => {
    router.push({ pathname: '/place/[placeId]/reviews', params: { placeId: place.id } });
  }, [router, place.id]);

  const { isOpen, opensAt, closesAt } = place.openState;
  const hours =
    opensAt && closesAt
      ? t('place.todayHours', {
          open: formatClock(opensAt, locale),
          close: formatClock(closesAt, locale),
        })
      : null;
  const badge = place.badges[0];
  // Known from the place's own page (K9). Book is not offered where the app
  // cannot book, and the page says why instead.
  const bookingsOff = place.acceptsAppBookings === false;

  return (
    <Screen edges={['left', 'right']} backgroundColor={colors.surface}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={sheetUnderBar ? 'dark' : 'light'} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onSheetScroll}
        scrollEventThrottle={32}
      >
        {/* Hero: swipeable photos under the status bar, controls floating on top. */}
        <View style={{ height: heroHeight }}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, index) => `${index}-${uri}`}
            renderItem={({ item }) => (
              <PhotoImage
                source={item}
                gradient={0.45}
                accessibilityLabel={place.name}
                style={{ width: windowWidth, height: heroHeight }}
              />
            )}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onScroll={onHeroScroll}
            onMomentumScrollEnd={onHeroScroll}
            scrollEventThrottle={16}
          />
          <View style={[styles.heroControls, { top: insets.top + space.sm }]}>
            <IconButton
              icon={actionIcon.back}
              accessibilityLabel={t('floorPlan.back')}
              variant="translucent"
              onPress={onBack}
            />
            <View style={styles.heroRight}>
              <IconButton
                icon={favorite ? actionIcon.favorited : actionIcon.favorite}
                accessibilityLabel={favorite ? t('place.unfavorite') : t('place.favorite')}
                variant="translucent"
                // White on the glass either way: the filled heart says saved,
                // and red on the glass fails 3:1 over a light photo.
                onPress={() => toggleFavorite(place.id)}
              />
              <IconButton
                icon={actionIcon.share}
                accessibilityLabel={t('place.share')}
                variant="translucent"
                onPress={share}
              />
            </View>
          </View>
          {photos.length > 1 ? (
            <View pointerEvents="none" style={styles.counter}>
              <Text style={styles.counterText}>
                {t('place.photoCounter', { index: photoIndex + 1, total: photos.length })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* The sheet. */}
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text display numberOfLines={2} style={styles.title}>
              {place.name}
            </Text>
            {badge ? <Badge variant={badge} size="sm" style={styles.titleBadge} /> : null}
          </View>
          <Text numberOfLines={1} style={styles.typeLine}>
            {copy.typeLine}
          </Text>
          <PlaceMetaRow place={place} order="ratingFirst" style={styles.metaRow} />

          <View style={styles.openRow}>
            <Badge variant={isOpen ? 'open' : 'closed'} size="sm" />
            {hours ? (
              <Text numberOfLines={1} style={styles.hours}>
                {hours}
              </Text>
            ) : null}
          </View>

          <PlaceActions
            place={place}
            saved={favorite}
            onToggleSave={() => toggleFavorite(place.id)}
            style={styles.actions}
          />

          {/* The tables: the reason the photo is there. Directly under the
              hero and the actions, at the same place whichever tab is open —
              never pushed under a long menu. */}
          <SectionHeader
            label={t('tables.title')}
            icon={actionIcon.table}
            trailing={
              <Button
                label={t('tables.floorPlan')}
                variant="text"
                fullWidth={false}
                onPress={openFloorPlan}
                style={styles.floorPlanLink}
              />
            }
            style={styles.tablesHeader}
          />
          {tablePhoto && tables.length > 0 ? (
            <>
              <Text style={styles.subtitle}>{t('tables.subtitle')}</Text>
              <TablePhotoView
                photo={tablePhoto}
                tables={tables}
                selectedTableId={selectedTableId}
                onSelect={setSelectedTableId}
                onBook={onBook}
                style={styles.tablePhoto}
              />
              <TableLegend style={styles.legend} />
            </>
          ) : (
            // No cover, or no table placed on it yet: say so, rather than draw
            // a gallery picture or an empty frame the diner is told to tap
            // tables on. The floor plan link above and Book below still work.
            <Text style={[styles.subtitle, styles.noTablePhoto]}>{t('tables.notOnPhoto')}</Text>
          )}

          <PlaceTabs value={tab} onChange={setTab} style={styles.tabs} />
          <View style={styles.tabBody}>
            {tab === 'about' ? (
              <>
                <Text style={styles.about}>{place.about}</Text>
                <AmenityChips amenities={place.amenities} style={styles.amenities} />
              </>
            ) : tab === 'menu' ? (
              <PlaceMenu placeId={place.id} />
            ) : (
              <>
                <ReviewList placeId={place.id} reviews={place.reviews} />
                {place.ratingCount > place.reviews.length ? (
                  <Button
                    label={t('place.reviews.seeAll', { count: place.ratingCount })}
                    variant="outline"
                    onPress={openAllReviews}
                    style={styles.seeAll}
                  />
                ) : null}
                <ReviewComposer placeId={place.id} style={styles.composer} />
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {bookingsOff ? (
          <View style={styles.bookingsOff} accessibilityRole="summary">
            <Text style={styles.bookingsOffTitle}>{t('place.bookingsOff.title')}</Text>
            <Text style={styles.bookingsOffBody}>{t('place.bookingsOff.body')}</Text>
          </View>
        ) : (
          <Button label={t('place.bookTable')} size="large" onPress={() => onBook()} />
        )}
      </View>
    </Screen>
  );
}

function HeaderRow({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.plainHeader}>
      <IconButton
        icon={actionIcon.back}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
        onPress={onBack}
      />
    </View>
  );
}

function DetailsSkeleton({ heroHeight, onBack }: { heroHeight: number; onBack: () => void }) {
  const { t } = useTranslation('diner');
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.scroll}>
      <Skeleton height={heroHeight} borderRadius={0} />
      <View style={[styles.heroControls, { top: insets.top + space.sm }]}>
        <IconButton
          icon={actionIcon.back}
          accessibilityLabel={t('floorPlan.back')}
          variant="translucent"
          onPress={onBack}
        />
      </View>
      <View style={[styles.sheet, styles.skeletonSheet]}>
        <Skeleton width="70%" height={28} />
        <Skeleton width="55%" height={14} />
        <Skeleton width="45%" height={14} />
        <View style={styles.skeletonTiles}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              height={layout.actionTile}
              borderRadius={radius.tile}
              style={styles.skeletonTile}
            />
          ))}
        </View>
        <Skeleton height={44} />
        <Skeleton height={14} />
        <Skeleton height={14} />
        <Skeleton width="80%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: space.xl },
  centered: { flex: 1, justifyContent: 'center' },
  plainHeader: { paddingHorizontal: space.sm, paddingVertical: space.xs },

  heroControls: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroRight: { flexDirection: 'row', gap: space.sm },
  counter: {
    position: 'absolute',
    right: space.lg,
    bottom: SHEET_OVERLAP + space.md,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  counterText: {
    ...typography.caption,
    ...tabularNumbers,
    fontWeight: fontWeight.medium,
    color: colors.onImage,
  },

  sheet: {
    marginTop: -SHEET_OVERLAP,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface,
    ...shadows.float,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  titleBadge: { alignSelf: 'center' },
  typeLine: { ...typography.body, color: colors.textMuted, marginTop: space.xs },
  metaRow: { marginTop: space.sm },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  hours: { ...typography.body, color: colors.text, flexShrink: 1 },
  actions: { marginTop: space.lg },
  tabs: { marginTop: space.sm },
  tabBody: { paddingTop: space.lg, paddingBottom: space.sm },
  about: { ...typography.body, color: colors.text },
  amenities: { marginTop: space.md },
  seeAll: { marginTop: space.md },
  composer: { marginTop: space.lg },

  tablesHeader: { marginTop: space.xl },
  floorPlanLink: { paddingHorizontal: space.sm, minHeight: layout.touchTarget - 8 },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: space.xs },
  tablePhoto: { marginTop: space.md },
  legend: { marginTop: space.md, marginBottom: space.lg },
  noTablePhoto: { marginBottom: space.lg },

  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  bookingsOff: { gap: space.xs, paddingVertical: space.xs },
  bookingsOffTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  bookingsOffBody: { ...typography.body, color: colors.textMuted },

  skeletonSheet: { gap: space.md, paddingBottom: space.xl },
  skeletonTiles: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  skeletonTile: { flex: 1 },
});
