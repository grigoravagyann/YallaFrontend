/**
 * Favourites' query keys, apart from `favoriteQueries.ts` (which reaches the
 * phone's storage) so the sign-out and session-scope tests can seed them.
 */
export const favoriteKeys = {
  all: ['favorites'] as const,
  list: () => ['favorites', 'list'] as const,
};
