import { useTranslation } from '@yalla/i18n';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import type { Coordinates } from '../../places/model';
import { colors } from '../../theme';
import { PlaceMarker } from './PlaceMarker';
import { boundsOf, type GeoBounds, type PlaceMapProps } from './types';
import { UserLocationDot } from './UserLocationDot';

/** How far the camera travels on "my location", in degrees — about a kilometre. */
const LOCATE_DELTA = 0.01;
/** Room the overlays take, so a fitted set of pins lands in the clear part of the map. */
const FIT_PADDING = { top: 150, right: 48, bottom: 260, left: 48 };
/** Snapshot the markers once they have painted; before that they would be blank. */
const SETTLE_MS = 700;
/** How long a marker keeps redrawing after its selection flips — the spring's length. */
const REDRAW_MS = 600;

function regionOf(bounds: GeoBounds): Region {
  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
    latitudeDelta: bounds.maxLat - bounds.minLat,
    longitudeDelta: bounds.maxLng - bounds.minLng,
  };
}

function compact(ids: readonly (string | null)[]): readonly string[] {
  return ids.filter((id): id is string => id !== null);
}

/**
 * The real map, on the phone.
 *
 * Custom marker views are expensive in `react-native-maps`: every re-render of
 * a child is re-snapshotted into a bitmap on the UI thread. So each marker
 * tracks its own view only while something is happening to it — the first
 * paint, and the half-second its spring runs after being selected or
 * deselected — and is a frozen image the rest of the time.
 */
export function PlaceMap({
  places,
  selectedId,
  onSelect,
  center,
  userLocation,
  style,
  ref,
}: PlaceMapProps) {
  const { t } = useTranslation('diner');
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  // Opens on the diner; the pins are fitted in once they arrive (below).
  const [initialRegion] = useState<Region>(() => regionOf(boundsOf([center])));
  const fitted = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      animateTo(target: Coordinates) {
        mapRef.current?.animateToRegion(
          { ...target, latitudeDelta: LOCATE_DELTA, longitudeDelta: LOCATE_DELTA },
          450,
        );
      },
    }),
    [],
  );

  // Fit the pins once, the first time the map and the places are both here.
  useEffect(() => {
    if (!ready || fitted.current || places.length === 0) return;
    fitted.current = true;
    mapRef.current?.fitToCoordinates([center, ...places.map((place) => place.coords)], {
      edgePadding: FIT_PADDING,
      animated: true,
    });
  }, [ready, places, center]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  // The markers whose selection just changed keep redrawing while they spring.
  // Adjusted during render so the first frame of the spring is not missed.
  const [redrawing, setRedrawing] = useState<{ ids: readonly string[]; forId: string | null }>({
    ids: [],
    forId: selectedId,
  });
  if (redrawing.forId !== selectedId) {
    setRedrawing({ ids: compact([redrawing.forId, selectedId]), forId: selectedId });
  }
  useEffect(() => {
    if (redrawing.ids.length === 0) return;
    const timer = setTimeout(() => setRedrawing((state) => ({ ...state, ids: [] })), REDRAW_MS);
    return () => clearTimeout(timer);
  }, [redrawing]);

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={initialRegion}
      onMapReady={() => setReady(true)}
      onPress={() => onSelect(null)}
      // The blue dot is ours, so the two never disagree about where the diner is.
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      loadingEnabled
      loadingBackgroundColor={colors.background}
      loadingIndicatorColor={colors.primary}
    >
      {userLocation ? (
        <Marker
          coordinate={userLocation}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={!settled}
          zIndex={0}
          // Not a place: tapping it does nothing, and it needs no callout.
          tappable={false}
        >
          <UserLocationDot animated={false} accessibilityLabel={t('map.myLocation')} />
        </Marker>
      ) : null}
      {places.map((place) => {
        const selected = place.id === selectedId;
        return (
          <Marker
            key={place.id}
            identifier={place.id}
            coordinate={place.coords}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={!settled || redrawing.ids.includes(place.id)}
            zIndex={selected ? 2 : 1}
            onPress={(event) => {
              // Android also reports a marker tap as a map tap; that would
              // deselect what was just selected.
              event.stopPropagation();
              onSelect(place.id);
            }}
          >
            <PlaceMarker type={place.type} selected={selected} accessibilityLabel={place.name} />
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: colors.background },
});
