import { Ionicons } from '@expo/vector-icons';
import { MAX_BRANCH_SEARCH_LENGTH } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { openURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { BottomSheetCard } from '../src/components/BottomSheetCard';
import { Chip, chipHeight } from '../src/components/Chip';
import { ErrorState } from '../src/components/ErrorState';
import { IconButton } from '../src/components/IconButton';
import { PlaceMap } from '../src/components/map/PlaceMap';
import type { PlaceMapHandle } from '../src/components/map/types';
import { PlaceRow } from '../src/components/places/PlaceRow';
import { Screen } from '../src/components/Screen';
import { Text, TextInput } from '../src/components/Text';
import { useUserLocation } from '../src/hooks/useUserLocation';
import { usePlaces } from '../src/places/hooks';
import type { Place, PlaceType } from '../src/places/model';
import {
  actionIcon,
  colors,
  iconSize,
  layout,
  placeTypeIcon,
  radius,
  shadows,
  space,
  typography,
} from '../src/theme';

const LEGEND: readonly PlaceType[] = ['restaurant', 'cafe'];
/** Height of the legend row (a medium chip), which the card sits above. */
const LEGEND_HEIGHT = chipHeight.md;
/** How long the "showing Yerevan centre" note stays before it goes on its own. */
const NOTICE_MS = 7000;
/** Full-bleed: the map runs under the status bar; the overlays add the insets themselves. */
const NO_EDGES: readonly Edge[] = [];

/**
 * A driving-directions link the phone's own maps app understands: Apple Maps
 * on iOS, the `geo:` intent on Android, Google Maps in a browser tab elsewhere.
 */
function directionsUrls(
  place: Place,
): { readonly preferred: string; readonly fallback: string } | null {
  // A place with no location set has no pin and nowhere to route to.
  if (!place.coords) return null;
  const { latitude, longitude } = place.coords;
  const label = encodeURIComponent(place.name);
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  const preferred = Platform.select({
    ios: `https://maps.apple.com/?daddr=${latitude},${longitude}&q=${label}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
    default: fallback,
  });
  return { preferred, fallback };
}

/**
 * The map: every place as a pin, the diner as a blue dot, one card for the
 * pin you tapped and nothing else. The list is a tap away (the button on the
 * right of the search row, or back) and never drawn here — a map with a list
 * under it is neither.
 */
export default function MapScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<PlaceMapHandle>(null);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PlaceType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);

  const placesQuery = usePlaces({
    query,
    ...(typeFilter ? { filter: { type: typeFilter } } : {}),
  });
  const { data, isLoading, isError, error, refetch } = placesQuery;
  const offline = isOfflinePaused(placesQuery) && !data;
  const unavailable =
    isError && error instanceof Error && error.name === 'PlaceApiNotImplementedError';
  const places: readonly Place[] = useMemo(() => data ?? [], [data]);

  // A pin filtered away is no longer selected, whatever `selectedId` says.
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedId) ?? null,
    [places, selectedId],
  );
  // The card keeps its last place while it slides out, so it does not go blank
  // mid-animation. Adjusted during render: the new place must show on the
  // same frame the card starts to slide in.
  const [cardPlace, setCardPlace] = useState<Place | null>(null);
  if (selectedPlace && selectedPlace !== cardPlace) setCardPlace(selectedPlace);

  const location = useUserLocation();
  const coordsRef = useRef(location.coords);
  useEffect(() => {
    coordsRef.current = location.coords;
  }, [location.coords]);

  // The note is shown once per visit: it goes when tapped, or after a while.
  const showNotice = (location.isFallback || Platform.OS === 'web') && !noticeDismissed;
  useEffect(() => {
    if (!showNotice) return;
    const timer = setTimeout(() => setNoticeDismissed(true), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [showNotice]);
  const notice = [
    location.isFallback ? t('map.locationFallback') : null,
    Platform.OS === 'web' ? t('map.webFallback') : null,
  ]
    .filter((line): line is string => line !== null)
    .join(' ');

  const locateMe = useCallback(() => {
    // After a refusal, asking again is the only way to a real fix; either
    // way the camera ends up on whatever the answer is.
    void location.refresh().then(() => mapRef.current?.animateTo(coordsRef.current));
  }, [location]);

  const openDetails = useCallback(
    (placeId: string) => {
      router.push({ pathname: '/place/[placeId]', params: { placeId } });
    },
    [router],
  );

  const openDirections = useCallback((place: Place) => {
    const urls = directionsUrls(place);
    if (!urls) return;
    const { preferred, fallback } = urls;
    void openURL(preferred).catch(() => openURL(fallback).catch(() => undefined));
  }, []);

  const backToList = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // The legend sits on the safe edge; the card above the legend; the locate
  // button above whichever of those is the top.
  const legendBottom = insets.bottom + space.lg;
  const cardOffset = LEGEND_HEIGHT + space.md;
  const cardVisible = selectedPlace !== null;
  const locateBottom =
    legendBottom + cardOffset + (cardVisible && cardHeight > 0 ? cardHeight + space.md : 0);
  const problem = offline || isError;

  return (
    <Screen edges={NO_EDGES}>
      <PlaceMap
        ref={mapRef}
        places={places}
        selectedId={selectedPlace?.id ?? null}
        onSelect={setSelectedId}
        center={location.coords}
        {...(location.isLocating ? {} : { userLocation: location.coords })}
        style={StyleSheet.absoluteFill}
      />

      {/* Top overlay: back, search this area, back to the list. */}
      <View style={[styles.topRow, { top: insets.top + space.md }]} pointerEvents="box-none">
        <IconButton
          icon={actionIcon.back}
          accessibilityLabel={t('map.backToList')}
          onPress={backToList}
        />
        <View style={styles.search}>
          <Ionicons name={actionIcon.search} size={iconSize.md} color={colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('map.searchArea')}
            placeholderTextColor={colors.textSubtle}
            autoCorrect={false}
            returnKeyType="search"
            // The server refuses a longer search outright.
            maxLength={MAX_BRANCH_SEARCH_LENGTH}
            accessibilityLabel={t('map.searchArea')}
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
        <IconButton
          icon={actionIcon.list}
          accessibilityLabel={t('map.backToList')}
          onPress={backToList}
        />
      </View>

      {/* Under the search row: the fallback note, or the loading pill. */}
      <View
        style={[styles.underRow, { top: insets.top + space.md + layout.touchTarget + space.sm }]}
        pointerEvents="box-none"
      >
        {showNotice ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notice}
            onPress={() => setNoticeDismissed(true)}
            style={({ pressed }) => [styles.notice, pressed && styles.noticePressed]}
          >
            <Ionicons name={actionIcon.location} size={iconSize.sm} color={colors.textMuted} />
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}
        {isLoading ? (
          <View style={styles.loading} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.noticeText}>{t('explore.loading')}</Text>
          </View>
        ) : null}
      </View>

      {/* My location, floating above the card. */}
      <IconButton
        icon={actionIcon.locate}
        size="lg"
        variant="primary"
        accessibilityLabel={t('map.myLocation')}
        onPress={locateMe}
        style={[styles.locate, { bottom: locateBottom }]}
      />

      {/* The selected place. One card, no list. */}
      <BottomSheetCard visible={cardVisible} bottomOffset={cardOffset}>
        {cardPlace ? (
          <View onLayout={(event) => setCardHeight(event.nativeEvent.layout.height + space.lg * 2)}>
            <PlaceRow
              place={cardPlace}
              onViewDetails={() => openDetails(cardPlace.id)}
              onDirections={() => openDirections(cardPlace)}
            />
          </View>
        ) : null}
      </BottomSheetCard>

      {/* Offline or failed: said in the card's place, with a way to try again. */}
      <BottomSheetCard visible={problem} bottomOffset={cardOffset}>
        {offline ? (
          <ErrorState offline onRetry={() => void refetch()} style={styles.problem} />
        ) : unavailable ? (
          <ErrorState
            title={t('net.notAvailable')}
            body={t('net.notAvailableBody')}
            style={styles.problem}
          />
        ) : (
          <ErrorState onRetry={() => void refetch()} style={styles.problem} />
        )}
      </BottomSheetCard>

      {/* Legend: two chips that also filter the pins. */}
      <View style={[styles.legend, { bottom: legendBottom }]} pointerEvents="box-none">
        {LEGEND.map((type) => (
          <Chip
            key={type}
            label={t(`map.filter.${type}`)}
            icon={placeTypeIcon[type]}
            selected={typeFilter === type}
            onPress={() => setTypeFilter(typeFilter === type ? null : type)}
            style={styles.legendChip}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.touchTarget,
    paddingLeft: space.md + 2,
    paddingRight: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  underRow: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    alignItems: 'center',
    gap: space.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  noticePressed: { backgroundColor: colors.surfaceMuted },
  noticeText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  locate: { position: 'absolute', right: layout.screenPadding },
  problem: { paddingVertical: space.sm },
  legend: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
  },
  legendChip: { ...shadows.card },
});
