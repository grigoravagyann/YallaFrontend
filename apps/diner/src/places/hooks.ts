import { staleTime } from '@yalla/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { positionKey, usePosition, type PositionKey } from './positionStore';
import { placeRepository, type PlaceFilter } from './repository';

/**
 * The browse screens' only way to a place.
 *
 * Each hook returns the TanStack query result, so a screen has `isLoading` for
 * its skeleton, `isError` + `refetch` for its retry card and `data` for the
 * rest. Nothing here imports the mock; the repository decides.
 */

const detailKey = (placeId: string) => ['places', 'detail', placeId] as const;

export const placeKeys = {
  all: ['places'] as const,
  /**
   * One list, as read from one rounded position. The position is in the key
   * because the answer depends on it — the distances, and nearest first — so a
   * fix that appears or moves is a different answer, not a stale one.
   */
  list: (query: string, filter: PlaceFilter | undefined, position: PositionKey | null = null) =>
    [
      'places',
      'list',
      query,
      filter?.badge ?? null,
      filter?.type ?? null,
      position?.[0] ?? null,
      position?.[1] ?? null,
    ] as const,
  /** Every cached answer for one place, from whatever position — the key to invalidate. */
  detail: detailKey,
  /** One place as read from one rounded position. */
  detailAt: (placeId: string, position: PositionKey | null) =>
    [...detailKey(placeId), position?.[0] ?? null, position?.[1] ?? null] as const,
  tables: (placeId: string) => ['places', 'tables', placeId] as const,
};

export interface UsePlacesInput {
  readonly query?: string;
  readonly filter?: PlaceFilter;
}

/**
 * Places nearby, narrowed by the search box and the selected chip.
 *
 * Every query string is its own cache key, so without `keepPreviousData`
 * each keystroke would blank the list to skeletons for the round trip. The
 * last answer stays on screen (`isPlaceholderData` says so) until the new one
 * lands; skeletons are for the very first load only. The same holds when the
 * phone's position appears or moves.
 */
export function usePlaces(input: UsePlacesInput = {}) {
  const query = input.query?.trim() ?? '';
  const filter = input.filter;
  const position = positionKey(usePosition((state) => state.position));
  return useQuery({
    queryKey: placeKeys.list(query, filter, position),
    queryFn: () =>
      query === '' && filter === undefined
        ? placeRepository.listNearby()
        : placeRepository.search(query, filter),
    staleTime: staleTime.reference,
    placeholderData: keepPreviousData,
  });
}

/** One place. `null` data means the id is unknown — render the not-found state. */
export function usePlace(placeId: string | undefined) {
  const position = positionKey(usePosition((state) => state.position));
  return useQuery({
    queryKey: placeKeys.detailAt(placeId ?? '', position),
    queryFn: () => placeRepository.getById(placeId!),
    enabled: Boolean(placeId),
    staleTime: staleTime.reference,
    // A move re-reads the place for its distance with the page left on screen;
    // a different place never borrows this one's answer.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === placeId ? previous : undefined,
  });
}

/** The photo's table markers. Live data: short stale time, refreshed on focus. */
export function usePlaceTables(placeId: string | undefined) {
  return useQuery({
    queryKey: placeKeys.tables(placeId ?? ''),
    queryFn: () => placeRepository.tables(placeId!),
    enabled: Boolean(placeId),
    staleTime: staleTime.live,
    refetchOnWindowFocus: true,
  });
}
