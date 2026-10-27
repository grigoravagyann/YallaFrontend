import { type FavoriteBranch, MAX_FAVORITES } from '../../contracts/favorites';
import { TooManyFavoritesError, isFeatureNotEnabled } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import { favoritesFromWire, type WireFavoriteList } from '../placesMapping';
import { type DinerHttpContext, branchQuery } from './context';

type Schemas = components['schemas'];

export function favoritesMethods(
  ctx: DinerHttpContext,
): Pick<YallaGateway, 'listFavorites' | 'addFavorite' | 'removeFavorite' | 'mergeFavorites'> {
  const { client } = ctx;
  return {
    // --- Favourites (K11) -----------------------------------------------------------
    //
    // The diner's own token, `Diner` policy: an unverified account may keep
    // hearts. The position rides along like the browse list's, rounded the same.

    async listFavorites(position): Promise<readonly FavoriteBranch[]> {
      const { data } = await client.get<WireFavoriteList>('/api/diner/favorites', {
        query: branchQuery({ position }),
      });
      return favoritesFromWire(data, client.baseUrl);
    },

    async addFavorite(branchId): Promise<void> {
      try {
        await client.put(`/api/diner/favorites/${encodeURIComponent(branchId)}`);
      } catch (error) {
        // The route's one 409 is the cap. A 404 (unknown or inactive) passes through.
        if (!isFeatureNotEnabled(error) && error instanceof ApiError && error.status === 409) {
          throw new TooManyFavoritesError({
            url: error.url,
            requestId: error.requestId,
            max: MAX_FAVORITES,
          });
        }
        throw error;
      }
    },

    async removeFavorite(branchId): Promise<void> {
      await client.delete(`/api/diner/favorites/${encodeURIComponent(branchId)}`);
    },

    async mergeFavorites(branchIds, position): Promise<readonly FavoriteBranch[]> {
      try {
        const { data } = await client.put<WireFavoriteList>(
          '/api/diner/favorites',
          {
            branchIds: [...new Set(branchIds)],
          } satisfies Schemas['Yalla.Application.Diners.MergeFavoritesCommand'],
          { query: branchQuery({ position }) },
        );
        return favoritesFromWire(data, client.baseUrl);
      } catch (error) {
        if (!isFeatureNotEnabled(error) && error instanceof ApiError && error.status === 409) {
          throw new TooManyFavoritesError({
            url: error.url,
            requestId: error.requestId,
            max: MAX_FAVORITES,
          });
        }
        throw error;
      }
    },
  };
}
