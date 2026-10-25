import { NotFoundError } from '../../errors';
import { MAX_FAVORITES } from '../../contracts/favorites';
import { TooManyFavoritesError } from '../../contracts/errors';
import { validationFailed } from '../problems';
import { type DinerMockContext, URL_TAG, type MockGateway } from './context';

/** The diner's favourites. */
export function favoritesMethods(
  ctx: DinerMockContext,
): Pick<MockGateway, 'listFavorites' | 'addFavorite' | 'removeFavorite' | 'mergeFavorites'> {
  const { favoriteList, favoritesOf, liveListing, me, now, wait } = ctx;
  return {
    // --- Favourites (K11) ------------------------------------------------------

    async listFavorites(position) {
      await wait();
      return favoriteList(me(), position);
    },

    async addFavorite(branchId) {
      await wait();
      const url = `${URL_TAG}/api/diner/favorites/${branchId}`;
      const accountId = me();
      if (!liveListing(branchId)) throw new NotFoundError({ url });
      const saved = favoritesOf(accountId);
      if (saved.has(branchId)) return;
      if (saved.size >= MAX_FAVORITES) throw new TooManyFavoritesError({ url, max: MAX_FAVORITES });
      saved.set(branchId, { atUtc: now().toISOString(), order: (ctx.favoriteOrder += 1) });
    },

    async removeFavorite(branchId) {
      await wait();
      favoritesOf(me()).delete(branchId);
    },

    /**
     * Adds what is missing and never removes. A place that is no longer listed
     * is skipped rather than failing the whole upload: the hearts were made
     * while signed out, possibly weeks ago, and one closed café must not cost
     * the diner the rest. Nothing is written when the result would pass the cap.
     */
    async mergeFavorites(branchIds, position) {
      await wait();
      const url = `${URL_TAG}/api/diner/favorites`;
      const accountId = me();
      if (branchIds.length > MAX_FAVORITES) {
        throw validationFailed(url, [
          {
            field: 'branchIds',
            message: `At most ${MAX_FAVORITES} places at once.`,
            bound: 'max',
            max: MAX_FAVORITES,
          },
        ]);
      }
      const saved = favoritesOf(accountId);
      const missing = [...new Set(branchIds)].filter((id) => !saved.has(id) && liveListing(id));
      if (saved.size + missing.length > MAX_FAVORITES) {
        throw new TooManyFavoritesError({ url, max: MAX_FAVORITES });
      }
      for (const id of missing) {
        saved.set(id, { atUtc: now().toISOString(), order: (ctx.favoriteOrder += 1) });
      }
      return favoriteList(accountId, position);
    },
  };
}
