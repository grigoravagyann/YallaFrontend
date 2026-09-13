import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Coordinates, Place } from '../../places/model';

/**
 * What the map screen can ask of either map: move to a point. The native map
 * animates its camera; the web stand-in has no camera and ignores it.
 */
export interface PlaceMapHandle {
  animateTo(center: Coordinates): void;
}

export interface PlaceMapProps {
  /** Already filtered by the legend chips and the search field. */
  readonly places: readonly Place[];
  readonly selectedId: string | null;
  /** A marker tap selects; a tap on the map itself passes `null`. */
  readonly onSelect: (placeId: string | null) => void;
  /** Where the map opens: the diner, or Yerevan centre as the fallback. */
  readonly center: Coordinates;
  /** The blue dot. Omitted while the position is still unknown. */
  readonly userLocation?: Coordinates;
  readonly style?: StyleProp<ViewStyle>;
  readonly ref?: Ref<PlaceMapHandle>;
}

/** A span of latitude/longitude the markers fit in. */
export interface GeoBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/** Never zoom tighter than about a kilometre across, even for one marker. */
export const MIN_SPAN_DEGREES = 0.012;

/**
 * The smallest box holding every point, grown so markers at the edge are not
 * cut in half, and never narrower than `MIN_SPAN_DEGREES`.
 */
export function boundsOf(points: readonly Coordinates[], padding = 0.25): GeoBounds {
  if (points.length === 0) {
    const half = MIN_SPAN_DEGREES / 2;
    return { minLat: -half, maxLat: half, minLng: -half, maxLng: half };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  const latSpan = Math.max(maxLat - minLat, MIN_SPAN_DEGREES);
  const lngSpan = Math.max(maxLng - minLng, MIN_SPAN_DEGREES);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const halfLat = (latSpan * (1 + padding)) / 2;
  const halfLng = (lngSpan * (1 + padding)) / 2;
  return {
    minLat: midLat - halfLat,
    maxLat: midLat + halfLat,
    minLng: midLng - halfLng,
    maxLng: midLng + halfLng,
  };
}
