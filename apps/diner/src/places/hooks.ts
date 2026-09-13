import { staleTime } from '@yalla/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { placeRepository, type PlaceFilter } from './repository';

/**
 * The browse screens' only way to a place.
 *
 * Each hook returns the TanStack query result, so a screen has `isLoading` for
 * its skeleton, `isError` + `refetch` for its retry card and `data` for the
 * rest. Nothing here imports the mock; the repository decides.
 */

export const placeKeys = {
  all: ['places'] as const,
  list: (query: string, filter: PlaceFilter | undefined) =>
    ['places', 'list', query, filter?.badge ?? null, filter?.type ?? null] as const,
  detail: (placeId: string) => ['places', 'detail', placeId] as const,
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
 * lands; skeletons are for the very first load only.
 */
export function usePlaces(input: UsePlacesInput = {}) {
  const query = input.query?.trim() ?? '';
  const filter = input.filter;
  return useQuery({
    queryKey: placeKeys.list(query, filter),
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
  return useQuery({
    queryKey: placeKeys.detail(placeId ?? ''),
    queryFn: () => placeRepository.getById(placeId!),
    enabled: Boolean(placeId),
    staleTime: staleTime.reference,
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
