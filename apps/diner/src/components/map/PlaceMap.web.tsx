import { useImperativeHandle, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTranslation } from '@yalla/i18n';
import { isLocated, type Coordinates } from '../../places/model';
import { colors } from '../../theme';
import { MARKER_BOX_HEIGHT, MARKER_BOX_WIDTH, PlaceMarker } from './PlaceMarker';
import { boundsOf, type PlaceMapProps } from './types';
import { USER_DOT_BOX, UserLocationDot } from './UserLocationDot';

/** Room kept clear for the screen's overlays: the search row, the card, the legend. */
const PAD = { top: 130, bottom: 250, side: 44 };
/** Stroke widths of the stylised streets. */
const ROAD = 14;
const LANE = 7;

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Projection {
  (point: Coordinates): { x: number; y: number };
}

/**
 * Longitude and latitude onto pixels, one scale for both axes (longitude
 * shrunk by the cosine of the latitude, so a kilometre east is as long as a
 * kilometre north), fitted into the clear part of the canvas.
 */
function projectionFor(points: readonly Coordinates[], size: Size): Projection {
  const bounds = boundsOf(points, 0.35);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLng = (bounds.minLng + bounds.maxLng) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const spanX = (bounds.maxLng - bounds.minLng) * cosLat;
  const spanY = bounds.maxLat - bounds.minLat;
  const availWidth = Math.max(size.width - PAD.side * 2, 1);
  const availHeight = Math.max(size.height - PAD.top - PAD.bottom, 1);
  const scale = Math.min(availWidth / spanX, availHeight / spanY);
  const originX = PAD.side + availWidth / 2;
  const originY = PAD.top + availHeight / 2;
  return (point) => ({
    x: originX + (point.longitude - midLng) * cosLat * scale,
    y: originY - (point.latitude - midLat) * scale,
  });
}

/**
 * The browser's stand-in for the map: a cream canvas with a few soft streets
 * and the same pins the phone shows, placed by a linear projection.
 *
 * It exists so the map screen — its controls, its selection card, its legend —
 * can be exercised in a browser during QA. It is not a map of Yerevan, and
 * the screen says so (`map.webFallback`).
 */
export function PlaceMap({
  places: allPlaces,
  selectedId,
  onSelect,
  center,
  userLocation,
  style,
  ref,
}: PlaceMapProps) {
  const { t } = useTranslation('diner');
  // A place with no location set gets no pin, rather than one at a guess.
  const places = useMemo(() => allPlaces.filter(isLocated), [allPlaces]);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  // Nothing to pan on a static canvas; the handle exists so the screen need
  // not know which map it holds.
  useImperativeHandle(ref, () => ({ animateTo: () => undefined }), []);

  const project = useMemo(() => {
    const anchors = [center, ...places.map((place) => place.coords)];
    if (userLocation) anchors.push(userLocation);
    return projectionFor(anchors, size);
  }, [center, places, userLocation, size]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const ready = size.width > 0 && size.height > 0;
  const user = ready && userLocation ? project(userLocation) : null;

  return (
    <View style={[styles.canvas, style]} onLayout={onLayout}>
      <Pressable accessible={false} onPress={() => onSelect(null)} style={StyleSheet.absoluteFill}>
        {ready ? <Streets width={size.width} height={size.height} /> : null}
      </Pressable>

      {user ? (
        <UserLocationDot
          accessibilityLabel={t('map.myLocation')}
          style={[
            styles.pinned,
            { left: user.x - USER_DOT_BOX / 2, top: user.y - USER_DOT_BOX / 2 },
          ]}
        />
      ) : null}

      {ready
        ? places.map((place) => {
            const at = project(place.coords);
            const selected = place.id === selectedId;
            return (
              <PlaceMarker
                key={place.id}
                type={place.type}
                selected={selected}
                accessibilityLabel={place.name}
                onPress={() => onSelect(place.id)}
                style={[
                  styles.pinned,
                  {
                    left: at.x - MARKER_BOX_WIDTH / 2,
                    top: at.y - MARKER_BOX_HEIGHT,
                    zIndex: selected ? 2 : 1,
                  },
                ]}
              />
            );
          })
        : null}
    </View>
  );
}

/**
 * A handful of streets, a square and a park, drawn in fractions of the canvas.
 * Decorative: it gives the pins something to sit on and nothing else.
 */
function Streets({ width: w, height: h }: Size) {
  const roads = [
    // A wide avenue sweeping across the middle.
    `M0 ${h * 0.46} C ${w * 0.3} ${h * 0.4}, ${w * 0.6} ${h * 0.52}, ${w} ${h * 0.44}`,
    // A ring road curving through the lower half.
    `M${w * 0.08} ${h} C ${w * 0.15} ${h * 0.7}, ${w * 0.5} ${h * 0.62}, ${w * 0.92} ${h * 0.78}`,
    // Two cross streets.
    `M${w * 0.3} 0 L ${w * 0.36} ${h}`,
    `M${w * 0.68} 0 C ${w * 0.66} ${h * 0.3}, ${w * 0.74} ${h * 0.7}, ${w * 0.7} ${h}`,
    // A diagonal from the top-left.
    `M0 ${h * 0.2} L ${w * 0.55} ${h * 0.62}`,
  ];

  return (
    <Svg width={w} height={h} pointerEvents="none">
      <Rect x={0} y={0} width={w} height={h} fill={colors.background} />
      {/* City blocks. */}
      <Rect
        x={w * 0.42}
        y={h * 0.16}
        width={w * 0.2}
        height={h * 0.14}
        rx={10}
        fill={colors.surfaceMuted}
      />
      <Rect
        x={w * 0.1}
        y={h * 0.56}
        width={w * 0.18}
        height={h * 0.1}
        rx={10}
        fill={colors.surfaceMuted}
      />
      <Rect
        x={w * 0.76}
        y={h * 0.52}
        width={w * 0.2}
        height={h * 0.18}
        rx={10}
        fill={colors.surfaceMuted}
      />
      {/* A park. */}
      <Circle cx={w * 0.82} cy={h * 0.26} r={Math.min(w, h) * 0.09} fill={colors.successSoft} />
      {/* Streets: an edge first, then the lighter lane on top. */}
      {roads.map((d, index) => (
        <Path
          key={`edge-${index}`}
          d={d}
          stroke={colors.border}
          strokeWidth={ROAD}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {roads.map((d, index) => (
        <Path
          key={`lane-${index}`}
          d={d}
          stroke={colors.surface}
          strokeWidth={LANE}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  pinned: { position: 'absolute' },
});
