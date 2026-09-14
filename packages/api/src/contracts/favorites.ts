import type { BranchListing } from './places';

/**
 * Favourites, synced to the diner's account (K11).
 *
 * Signed in, the hearts live on the server: `GET/PUT/DELETE /api/diner/favorites`.
 * Signed out, the app keeps them on the phone and uploads them once, on sign-in,
 * through the bulk merge — which adds and never removes, so a heart made on a
 * second phone is not lost to an older list from the first.
 */

/** The most places one account may save. One more is refused with a 409. */
export const MAX_FAVORITES = 500;

/** One saved place, with its listing as the Explore list would show it. */
export interface FavoriteBranch {
  readonly branchId: string;
  readonly createdAtUtc: string;
  readonly listing: BranchListing;
}
