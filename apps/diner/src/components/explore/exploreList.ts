import type { Place } from '../../places/model';

/**
 * Nearest first; a place with no known distance goes last. Stable, so places
 * at the same distance — or a list with no distances at all, before the phone
 * has a position — keep the order the server sent.
 */
export function nearestFirst<P extends Pick<Place, 'distanceKm'>>(places: readonly P[]): P[] {
  const far = Number.POSITIVE_INFINITY;
  return [...places].sort((a, b) => (a.distanceKm ?? far) - (b.distanceKm ?? far));
}

/**
 * The venue names listed more than once: two branches of one venue. Their
 * cards name the branch as well, so the two can be told apart.
 */
export function repeatedVenues(places: readonly Pick<Place, 'venueName'>[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const place of places) {
    const venue = place.venueName.trim();
    if (seen.has(venue)) repeated.add(venue);
    seen.add(venue);
  }
  return repeated;
}
