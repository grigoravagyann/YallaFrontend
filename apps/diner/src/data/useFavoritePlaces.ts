import { staleTime } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { currentLocale } from '@yalla/i18n';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { placeFromListing } from '../places/httpMapping';
import { usePlaces } from '../places/hooks';
import type { Place } from '../places/model';
import { usePosition } from '../places/positionStore';
import { useFavorites } from '../stores/favorites';
import { useSession } from '../stores/session';
import { favoriteKeys } from './favoriteQueries';

export interface FavoritePlaces {
  readonly places: readonly Place[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/**
 * The Favorites screen's list.
 *
 * Signed in, the account's saved places from `GET /api/diner/favorites`, newest
 * first, each with its listing and a distance when the phone has a position —
 * the same query the hearts are synced from, so a heart unset anywhere leaves
 * this list at once. Signed out, the hearts on this phone, resolved against the
 * places Explore lists.
 */
export function useFavoritePlaces(): FavoritePlaces {
  const gateway = useGateway();
  const signedIn = useSession((state) => state.signedIn);
  const position = usePosition((state) => state.position);
  const remoteIds = useFavorites((state) => state.remoteIds);
  const localIds = useFavorites((state) => state.localIds);
  const hydrated = useFavorites((state) => state.hydrated);

  const account = useQuery({
    queryKey: favoriteKeys.list(),
    queryFn: () => gateway.listFavorites(position ?? undefined),
    enabled: signedIn,
    staleTime: staleTime.frequent,
  });
  const browse = usePlaces();

  const accountPlaces = useMemo(() => {
    const context = { now: new Date(), locale: currentLocale(), position };
    // Unconfirmed un-saves leave at once; a place saved a moment ago joins when
    // the list is read back with its listing.
    const shown = remoteIds ? new Set(remoteIds) : null;
    return (account.data ?? [])
      .filter((favorite) => !shown || shown.has(favorite.branchId))
      .map((favorite) => placeFromListing(favorite.listing, context));
  }, [account.data, remoteIds, position]);

  const phonePlaces = useMemo(() => {
    const byId = new Map((browse.data ?? []).map((place) => [place.id, place] as const));
    return localIds.flatMap((id) => {
      const place = byId.get(id);
      return place ? [place] : [];
    });
  }, [browse.data, localIds]);

  if (signedIn) {
    return {
      places: accountPlaces,
      isLoading: account.isLoading,
      isError: account.isError && !account.data,
      refetch: () => void account.refetch(),
    };
  }
  return {
    places: phonePlaces,
    isLoading: localIds.length > 0 && (browse.isLoading || !hydrated),
    isError: localIds.length > 0 && browse.isError && !browse.data,
    refetch: () => void browse.refetch(),
  };
}
