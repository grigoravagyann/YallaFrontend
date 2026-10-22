import { Ionicons } from '@expo/vector-icons';
import { isOfflinePaused } from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { FocusedStatusBar } from '../../src/components/FocusedStatusBar';
import { HeartPop, useSavePop } from '../../src/components/HeartPop';
import { IconButton } from '../../src/components/IconButton';
import { PhotoImage } from '../../src/components/PhotoImage';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { BookingBlockedNote } from '../../src/components/bookings/GuestRecord';
import { AmenityChips } from '../../src/components/place/AmenityChips';
import { BookCta, CtaFooter } from '../../src/components/place/BookCta';
import { PlaceActions, openUrl } from '../../src/components/place/PlaceActions';
import { ReviewComposer } from '../../src/components/place/ReviewComposer';
import { PlaceTabs, placeTabs, type PlaceTab } from '../../src/components/place/PlaceTabs';
import { usePlaceCopy } from '../../src/components/places/placeCopy';
import { placeDistrict } from '../../src/components/places/placeTitle';
import { RoomPhotosView } from '../../src/components/tables/RoomPhotosView';
import { TableLegend } from '../../src/components/tables/TableLegend';
import { useBookingBlock } from '../../src/data/bookingBlock';
import { usePlace, usePlaceRooms } from '../../src/places/hooks';
import {
  formatClock,
  type Place,
  type PlaceRoom,
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
  iconSize,
  layout,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
  type IoniconName,
} from '../../src/theme';

/** The hero is about a third of the screen (292 of 844 in the design). */
const HERO_FRACTION = 0.35;
/** The compact bar's row under the status bar: a 44 button with 16 above and below. */
const BAR_ROW = layout.touchTarget + space.lg * 2;
/** The compact bar fades in over this stretch of scroll, and takes taps past its middle. */
const BAR_FADE_FROM = 120;
const BAR_FADE_TO = 180;
const BAR_LIVE_AT = (BAR_FADE_FROM + BAR_FADE_TO) / 2;
/** How long a section asked for on open is chased while the page fills in. */
const PENDING_SECTION_MS = 2500;
/** How far under the compact bar a section's top must be to count as the one being read. */
const SECTION_PROBE = space.xxl;

/**
 * One place: photos, the facts, the menu and — the core of the product — its
 * rooms as photos with every table pinned live, which you book from.
 *
 * `placeId` is the API branch id, so Book, the room photos at a chosen time
 * and the confirm screen underneath all key on the same thing.
 */
export default function PlaceDetailsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  // `section` opens the page already scrolled to a part of it — the rating
  // stars on a closed bill land on Reviews, where the composer is.
  const { placeId, section, rating } = useLocalSearchParams<{
    placeId: string;
    section?: string;
    rating?: string;
  }>();
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(windowHeight * HERO_FRACTION);

  const placeQuery = usePlace(placeId);
  const roomsQuery = usePlaceRooms(placeId);

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
    void roomsQuery.refetch();
  }, [placeQuery, roomsQuery]);

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
      // The live read once it has answered; the page's own until then.
      rooms={roomsQuery.data ?? place.rooms}
      heroHeight={heroHeight}
      initialSection={placeTabs.find((key) => key === section) ?? null}
      initialRating={rating ? Number(rating) : undefined}
      onBack={back}
      onBook={openBooking}
    />
  );
}

interface PlaceDetailsProps {
  readonly place: Place;
  readonly rooms: readonly PlaceRoom[];
  readonly heroHeight: number;
  /** Scroll here once the page has laid out; null opens at the top. */
  readonly initialSection: PlaceTab | null;
  /** Stars to start the review form with (from a closed bill). */
  readonly initialRating: number | undefined;
  readonly onBack: () => void;
  readonly onBook: (table?: TablePhotoMarker) => void;
}

function PlaceDetails({
  place,
  rooms,
  heroHeight,
  initialSection,
  initialRating,
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
  const { popKey, onSavePress } = useSavePop();
  const toggleFavorite = useFavorites((state) => state.toggle);

  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  /*
   * Motion off the scroll, all on the native driver: the photo drifts down
   * inside its frame as the page climbs (parallax) and the frame stretches
   * when pulled down past the top; the compact bar fades in once the name
   * has gone under it. Nothing moves for anyone who asked for less motion
   * except the bar's fade, which follows the finger.
   */
  const reducedMotion = useReducedMotion();
  const [scrollY] = useState(() => new Animated.Value(0));
  const barHeight = insets.top + BAR_ROW;

  // The page is one long read — Menu, Rooms, Reviews, About — and the tabs
  // jump to a section and follow the one being read. The scroll is read on
  // every event but React only hears when the answer changes.
  const scrollRef = useRef<ScrollView>(null);
  const sectionTops = useRef<Partial<Record<PlaceTab, number>>>({});
  const frame = useRef({ viewport: 0, content: 0, barHeight });
  const [tab, setTab] = useState<PlaceTab>('menu');
  const shownTab = useRef<PlaceTab>('menu');
  /** The section a tap is scrolling to; the tabs hold still until it arrives. */
  const heading = useRef<PlaceTab | null>(null);
  const [barLive, setBarLive] = useState(false);
  const barLiveRef = useRef(false);
  useEffect(() => {
    frame.current.barHeight = barHeight;
  }, [barHeight]);

  const onScrollAt = useCallback((y: number) => {
    const live = y > BAR_LIVE_AT;
    if (live !== barLiveRef.current) {
      barLiveRef.current = live;
      setBarLive(live);
    }
    const { viewport, content, barHeight: bar } = frame.current;
    let active: PlaceTab = placeTabs[0]!;
    if (y > 0 && viewport > 0 && y + viewport >= content - 2) {
      // At the very end the last section is the one being read, however short.
      for (const key of placeTabs) if (sectionTops.current[key] !== undefined) active = key;
    } else {
      for (const key of placeTabs) {
        const top = sectionTops.current[key];
        if (top !== undefined && top <= y + bar + SECTION_PROBE) active = key;
      }
    }
    if (heading.current) {
      if (heading.current !== active) return;
      heading.current = null;
    }
    if (active !== shownTab.current) {
      shownTab.current = active;
      setTab(active);
    }
  }, []);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );
  // The native driver still reports the offset back to a JS listener.
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => onScrollAt(value));
    return () => scrollY.removeListener(id);
  }, [scrollY, onScrollAt]);

  /*
   * Where each section starts in the scroll. Measured against the content
   * rather than read from `onLayout`: on the web `onLayout` only fires when a
   * block's size changes, so a section pushed down by the menu arriving would
   * keep its old place.
   */
  const contentRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const roomsRef = useRef<View>(null);
  const reviewsRef = useRef<View>(null);
  const aboutRef = useRef<View>(null);
  const measureSection = useCallback((key: PlaceTab, then?: (top: number) => void) => {
    const content = contentRef.current;
    const node = {
      menu: menuRef,
      rooms: roomsRef,
      reviews: reviewsRef,
      about: aboutRef,
    }[key].current;
    if (!content || !node) return;
    node.measureLayout(
      content,
      (_x, y) => {
        sectionTops.current[key] = y;
        then?.(y);
      },
      () => undefined,
    );
  }, []);
  const measureSections = useCallback(() => {
    for (const key of placeTabs) measureSection(key);
  }, [measureSection]);

  /**
   * The section asked for on open. Sections above it arrive late and push it
   * down, so it is chased on each content change — for a short while only,
   * and never once the diner has touched, scrolled or picked a tab.
   */
  const pendingSection = useRef<PlaceTab | null>(initialSection);
  const pendingUntil = useRef(0);
  useEffect(() => {
    pendingUntil.current = Date.now() + PENDING_SECTION_MS;
  }, []);
  const takeOver = useCallback(() => {
    pendingSection.current = null;
  }, []);
  const goTo = useCallback(
    (next: PlaceTab) => {
      shownTab.current = next;
      setTab(next);
      measureSection(next, (top) => {
        heading.current = next;
        scrollRef.current?.scrollTo({
          y: Math.max(0, top - frame.current.barHeight - space.sm),
          animated: !reducedMotion,
        });
      });
    },
    [measureSection, reducedMotion],
  );
  const chase = useCallback(() => {
    const section = pendingSection.current;
    if (!section) return;
    if (Date.now() > pendingUntil.current) {
      pendingSection.current = null;
      return;
    }
    goTo(section);
  }, [goTo]);
  const pickTab = useCallback(
    (next: PlaceTab) => {
      takeOver();
      goTo(next);
    },
    [goTo, takeOver],
  );

  const frameStretch = useMemo(
    () =>
      reducedMotion
        ? undefined
        : {
            // Pulled down past the top: the frame grows from its bottom edge,
            // its clip with it, so no gap opens above the photo.
            transform: [
              {
                translateY: scrollY.interpolate({
                  inputRange: [-heroHeight, 0],
                  outputRange: [-heroHeight / 2, 0],
                  extrapolate: 'clamp',
                }),
              },
              {
                scale: scrollY.interpolate({
                  inputRange: [-heroHeight, 0],
                  outputRange: [2, 1],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
    [heroHeight, reducedMotion, scrollY],
  );
  const photoParallax = useMemo(
    () =>
      reducedMotion
        ? undefined
        : {
            transform: [
              {
                translateY: scrollY.interpolate({
                  inputRange: [0, heroHeight],
                  outputRange: [0, heroHeight * 0.45],
                  extrapolate: 'clamp',
                }),
              },
              {
                scale: scrollY.interpolate({
                  inputRange: [0, heroHeight],
                  outputRange: [1, 1 + heroHeight / 2400],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
    [heroHeight, reducedMotion, scrollY],
  );
  const barMotion = useMemo(
    () => ({
      opacity: scrollY.interpolate({
        inputRange: [BAR_FADE_FROM, BAR_FADE_TO],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      ...(reducedMotion
        ? {}
        : {
            transform: [
              {
                translateY: scrollY.interpolate({
                  inputRange: [BAR_FADE_FROM, BAR_FADE_TO],
                  outputRange: [-8, 0],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }),
    }),
    [reducedMotion, scrollY],
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

  const openRoomsAtTime = useCallback(() => {
    // The same rooms at a time the diner picks. Slugs, names and the zone
    // travel with it: that screen reads the booking rules by slug and never
    // has to look the venue up again.
    router.push({ pathname: '/branch/[branchId]', params: floorPlanParams(place) });
  }, [router, place]);

  const openAllReviews = useCallback(() => {
    router.push({ pathname: '/place/[placeId]/reviews', params: { placeId: place.id } });
  }, [router, place.id]);

  const toggleSave = useCallback(() => {
    onSavePress(!favorite);
    toggleFavorite(place.id);
  }, [favorite, onSavePress, toggleFavorite, place.id]);

  // "Restaurant · Armenian · Kentron": the kind, the cuisine, the district the
  // venue set — or the street, for one that has not set it.
  const kindLine = [copy.typeLine, placeDistrict(place)].filter(Boolean).join(' · ');

  // "4.6 · 120 reviews", in the locale's digits.
  const rating = useMemo(() => {
    if (place.rating === null) return t('place.noReviews');
    const tag = intlTag(locale);
    return t('place.ratingReviews', {
      count: place.ratingCount,
      rating: new Intl.NumberFormat(tag, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(place.rating),
      countLabel: new Intl.NumberFormat(tag).format(place.ratingCount),
    });
  }, [locale, place.rating, place.ratingCount, t]);

  const { isOpen, opensAt, closesAt, todayNote } = place.openState;
  // Open: until when. Shut: today's hours, if it opens today at all. A special
  // day says what it is beside them ("New Year"), closed all day included.
  const hoursLine =
    isOpen && closesAt
      ? t('place.until', { time: formatClock(closesAt, locale) })
      : !isOpen && opensAt && closesAt
        ? t('place.todayHours', {
            open: formatClock(opensAt, locale),
            close: formatClock(closesAt, locale),
          })
        : null;
  const hoursNote = [hoursLine, todayNote].filter(Boolean).join(' · ') || null;
  const website = place.website?.trim() ?? '';
  // Known from the place's own page (K9). Book is not offered where the app
  // cannot book, and the page says why instead.
  const bookingsOff = place.acceptsAppBookings === false;
  // Paused after three no-shows in three days (guest record, 2026-10-20):
  // Book stays in its place, off, with until when above it.
  const pausedUntil = useBookingBlock();

  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Light over the photo; dark once the white compact bar is under it. */}
      <FocusedStatusBar style={barLive ? 'dark' : 'light'} />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          heading.current = null;
          takeOver();
        }}
        // The web build never fires onScrollBeginDrag: a touch or a wheel
        // there is the diner taking over just the same.
        onTouchStart={takeOver}
        {...({ onWheel: takeOver } as object)}
        onLayout={(event) => {
          frame.current.viewport = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_, height) => {
          frame.current.content = height;
          measureSections();
          // Sections above it (the menu, the rooms) arrive after the first
          // layout and push it down, so the scroll is re-aimed each time the
          // content grows until the diner scrolls themselves.
          chase();
        }}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} collapsable={false}>
          {/* Hero: swipeable photos under the status bar, fading into the page. */}
          <Animated.View style={[styles.heroFrame, { height: heroHeight }, frameStretch]}>
            <Animated.View style={[StyleSheet.absoluteFill, photoParallax]}>
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
            </Animated.View>
            <LinearGradient
              pointerEvents="none"
              colors={[
                colors.glass,
                colors.overlayClear,
                colors.backgroundClear,
                colors.background,
              ]}
              locations={[0, 0.3, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* On the photo, but neither stretched nor drifting with it. */}
          <View pointerEvents="box-none" style={[styles.heroOverlay, { height: heroHeight }]}>
            <View style={[styles.heroControls, { top: insets.top + space.sm }]}>
              <IconButton
                icon={actionIcon.back}
                accessibilityLabel={t('floorPlan.back')}
                variant="translucent"
                onPress={onBack}
              />
              <View style={styles.heroRight}>
                <IconButton
                  icon={actionIcon.share}
                  accessibilityLabel={t('place.share')}
                  variant="translucent"
                  onPress={share}
                />
                <HeartPop popKey={popKey}>
                  <IconButton
                    icon={favorite ? actionIcon.favorited : actionIcon.favorite}
                    accessibilityLabel={favorite ? t('place.unfavorite') : t('place.favorite')}
                    variant="translucent"
                    // White on the glass either way: the filled heart says saved,
                    // and amber on the glass fails 3:1 over a light photo.
                    onPress={toggleSave}
                  />
                </HeartPop>
              </View>
            </View>
            {photos.length > 1 ? (
              <>
                <View pointerEvents="none" style={styles.dots}>
                  {photos.map((uri, index) => (
                    <View
                      key={`${index}-${uri}`}
                      style={[styles.dot, index === photoIndex && styles.dotActive]}
                    />
                  ))}
                </View>
                <View pointerEvents="none" style={styles.counter}>
                  <Text style={styles.counterText}>
                    {t('place.photoCounter', { index: photoIndex + 1, total: photos.length })}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Name, kind and where, rating, distance, open now. */}
          <View style={[styles.pad, styles.titleBlock]}>
            <Text display accessibilityRole="header" numberOfLines={2} style={styles.title}>
              {place.name}
            </Text>
            <Text numberOfLines={1} style={styles.kindLine}>
              {kindLine}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                {place.rating !== null ? (
                  <Ionicons name={actionIcon.star} size={13} color={colors.ratingStar} />
                ) : null}
                <Text style={styles.metaText}>{rating}</Text>
              </View>
              {copy.distance ? <Text style={styles.metaText}>{copy.distance}</Text> : null}
              <Badge variant={isOpen ? 'open' : 'closed'} size="sm" />
              {hoursNote ? (
                <Text numberOfLines={1} style={[styles.metaText, styles.hours]}>
                  {hoursNote}
                </Text>
              ) : null}
            </View>
          </View>

          <PlaceActions
            place={place}
            onMenu={() => pickTab('menu')}
            style={[styles.pad, styles.actions]}
          />

          <PlaceTabs value={tab} onChange={pickTab} style={[styles.pad, styles.tabs]} />

          {/* Menu: the dishes, section by section. */}
          <View
            ref={menuRef}
            collapsable={false}
            onLayout={measureSections}
            style={[styles.pad, styles.firstSection]}
          >
            <PlaceMenu placeId={place.id} />
          </View>

          {/* Rooms: the photos, every table pinned where it stands, live. */}
          <View
            ref={roomsRef}
            collapsable={false}
            onLayout={measureSections}
            style={[styles.pad, styles.section]}
          >
            <View style={styles.sectionHead}>
              <Text
                display
                accessibilityRole="header"
                numberOfLines={1}
                style={styles.sectionTitle}
              >
                {t('tables.title')}
              </Text>
              <Button
                label={t('tables.pickTime')}
                variant="text"
                fullWidth={false}
                onPress={openRoomsAtTime}
                style={styles.pickTime}
              />
            </View>
            {rooms.length > 0 ? (
              <>
                <Text style={styles.subtitle}>{t('tables.subtitle')}</Text>
                <RoomPhotosView
                  rooms={rooms}
                  selectedTableId={selectedTableId}
                  onSelect={setSelectedTableId}
                  onBook={onBook}
                  // Where the app cannot book, the bar says so rather than offer Book.
                  canBook={!bookingsOff}
                  photoStyle={styles.roomPhoto}
                  style={styles.roomPhotos}
                />
                <TableLegend style={styles.legend} />
              </>
            ) : (
              // No room photographed yet: say so, rather than draw an empty
              // frame the diner is told to tap tables on. Book below still works.
              <Text style={styles.subtitle}>{t('tables.notOnPhoto')}</Text>
            )}
          </View>

          {/* Reviews, and the diner's own. */}
          <View
            ref={reviewsRef}
            collapsable={false}
            onLayout={measureSections}
            style={[styles.pad, styles.section]}
          >
            <Text display accessibilityRole="header" style={styles.sectionTitle}>
              {t('place.tab.reviews')}
            </Text>
            <View style={styles.sectionBody}>
              <ReviewList placeId={place.id} reviews={place.reviews} />
              {place.ratingCount > place.reviews.length ? (
                <Button
                  label={t('place.reviews.seeAll', { count: place.ratingCount })}
                  variant="outline"
                  onPress={openAllReviews}
                  style={styles.seeAll}
                />
              ) : null}
              <ReviewComposer
                placeId={place.id}
                timeZoneId={place.timeZoneId}
                initialRating={initialRating}
                style={styles.composer}
              />
            </View>
          </View>

          {/* About: the venue's words, what it offers, where and when. */}
          <View
            ref={aboutRef}
            collapsable={false}
            onLayout={measureSections}
            style={[styles.pad, styles.section]}
          >
            <Text display accessibilityRole="header" style={styles.sectionTitle}>
              {t('place.tab.about')}
            </Text>
            <View style={styles.sectionBody}>
              {place.about ? <Text style={styles.about}>{place.about}</Text> : null}
              <AmenityChips amenities={place.amenities} />
              <View style={styles.facts}>
                {place.address ? <Fact icon={actionIcon.location} text={place.address} /> : null}
                {place.openState.todayLabel || todayNote ? (
                  <Fact
                    icon={actionIcon.time}
                    text={[place.openState.todayLabel, todayNote].filter(Boolean).join(' · ')}
                  />
                ) : null}
                {website ? (
                  <Fact
                    icon={actionIcon.website}
                    text={website.replace(/^https?:\/\//iu, '').replace(/\/$/u, '')}
                    accessibilityLabel={`${t('place.action.website')}: ${website}`}
                    onPress={() =>
                      openUrl(/^https?:\/\//iu.test(website) ? website : `https://${website}`)
                    }
                  />
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* The compact bar, once the name has scrolled under it. Out of the
          accessibility tree, and untappable, until it is there. */}
      <Animated.View
        pointerEvents={barLive ? 'auto' : 'none'}
        aria-hidden={!barLive}
        style={[styles.bar, { height: barHeight, paddingTop: insets.top }, barMotion]}
      >
        <View pointerEvents="none" style={styles.barGround} />
        <IconButton
          icon={actionIcon.back}
          accessibilityLabel={t('floorPlan.back')}
          variant="surface"
          onPress={onBack}
          style={styles.barBack}
        />
        <Text display numberOfLines={1} style={styles.barTitle}>
          {place.name}
        </Text>
      </Animated.View>

      <CtaFooter bottomInset={insets.bottom}>
        {bookingsOff ? (
          <View style={styles.bookingsOff} accessibilityRole="summary">
            <Text style={styles.bookingsOffTitle}>{t('place.bookingsOff.title')}</Text>
            <Text style={styles.bookingsOffBody}>{t('place.bookingsOff.body')}</Text>
          </View>
        ) : pausedUntil ? (
          <View style={styles.paused}>
            <BookingBlockedNote untilUtc={pausedUntil} />
            <BookCta label={t('place.bookTable')} glyph disabled onPress={() => onBook()} />
          </View>
        ) : (
          <BookCta label={t('place.bookTable')} glyph onPress={() => onBook()} />
        )}
      </CtaFooter>
    </Screen>
  );
}

/** One line of the About section: a glyph and a fact, pressable when it opens something. */
function Fact({
  icon,
  text,
  onPress,
  accessibilityLabel,
}: {
  icon: IoniconName;
  text: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} />
      <Text style={[styles.factText, onPress && styles.factLink]}>{text}</Text>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="link"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      onPress={onPress}
      style={({ pressed }) => [styles.fact, pressed && styles.factPressed]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.fact}>{body}</View>
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
      <View style={[styles.pad, styles.skeletonBody]}>
        <Skeleton width="70%" height={30} />
        <Skeleton width="55%" height={14} />
        <Skeleton width="45%" height={14} />
        <View style={styles.skeletonTiles}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} borderRadius={radius.card} style={styles.skeletonTile} />
          ))}
        </View>
        <Skeleton height={layout.touchTarget} />
        <Skeleton height={56} borderRadius={radius.tile} />
        <Skeleton height={56} borderRadius={radius.tile} />
      </View>
    </View>
  );
}

const DOT = 6;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: space.xl },
  centered: { flex: 1, justifyContent: 'center' },
  plainHeader: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  pad: { marginHorizontal: layout.screenPadding },

  heroFrame: { overflow: 'hidden', backgroundColor: colors.skeleton },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  heroControls: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroRight: { flexDirection: 'row', gap: space.sm + 2 },
  // On a dark pill of their own, level with the counter: the hero fades into
  // the white page here, and bare cream dots vanished into it.
  dots: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: space.lg,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.overlayDark,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.photoDotIdle,
  },
  dotActive: { width: DOT * 3, backgroundColor: colors.onImage },
  counter: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  counterText: {
    ...typography.caption,
    ...tabularNumbers,
    color: colors.onImage,
  },

  titleBlock: { gap: space.xs, paddingTop: space.xs },
  title: { fontSize: 26, lineHeight: 32, fontWeight: fontWeight.bold, color: colors.text },
  kindLine: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: space.md,
    rowGap: space.xs,
    marginTop: space.xs,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  metaText: { fontSize: 12.5, lineHeight: 18, ...tabularNumbers, color: colors.text },
  hours: { flexShrink: 1 },

  actions: { marginTop: space.md + 2 },
  tabs: { marginTop: space.md + 2 },
  firstSection: { marginTop: space.md + 2 },
  section: { marginTop: space.xxl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: fontWeight.bold,
    color: colors.text,
    flexShrink: 1,
  },
  sectionBody: { marginTop: space.md, gap: space.md },
  pickTime: { marginLeft: 'auto', paddingHorizontal: space.sm, minHeight: layout.touchTarget },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: space.xs },
  roomPhotos: { marginTop: space.md },
  roomPhoto: { borderRadius: radius.card + 2 },
  legend: { marginTop: space.md },
  seeAll: { marginTop: space.xs },
  composer: { marginTop: space.sm },
  about: { ...typography.body, color: colors.text },
  facts: { gap: space.xs },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.touchTarget - 8,
    borderRadius: radius.small,
  },
  factPressed: { opacity: 0.7 },
  factText: { ...typography.body, color: colors.text, flexShrink: 1 },
  factLink: { color: colors.primary },

  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    ...shadows.float,
  },
  barGround: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.sheet,
    opacity: 0.94,
  },
  barBack: { flexShrink: 0 },
  barTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },

  bookingsOff: { gap: space.xs, paddingVertical: space.xs },
  paused: { gap: space.sm },
  bookingsOffTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  bookingsOffBody: { ...typography.body, color: colors.textMuted },

  skeletonBody: { gap: space.md, paddingTop: space.md, paddingBottom: space.xl },
  skeletonTiles: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  skeletonTile: { flex: 1 },
});
