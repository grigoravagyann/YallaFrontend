import { PLACE_TYPES, type Place, type PlaceType } from './model';

/**
 * The photo on each Explore category tile: the first place of that kind that
 * has one, in the order the list has them — so the Bars tile shows a bar, and
 * a kind with no place photographed yet keeps its plain tile.
 */
export function categoryPhotos(
  places: readonly Pick<Place, 'type' | 'photos'>[],
): Readonly<Record<PlaceType, string | undefined>> {
  const photoOf = (type: PlaceType) =>
    places.find((place) => place.type === type && place.photos[0])?.photos[0];
  return Object.fromEntries(PLACE_TYPES.map((type) => [type, photoOf(type)])) as Record<
    PlaceType,
    string | undefined
  >;
}
