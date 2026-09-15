import { isSessionRevoked } from '@yalla/api';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Call `onRevoked` whenever any query or mutation fails with
 * `SessionRevokedError` (K1): the account was deleted, its password changed,
 * its number proved by somebody else, or it was switched off.
 *
 * Watched on the caches rather than at each call site, so no screen can forget
 * to: the Orders tab, a review, a favourite heart and a booking all end the same
 * way. Returns the unsubscribe.
 */
export function watchSessionRevoked(queryClient: QueryClient, onRevoked: () => void): () => void {
  const stopQueries = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === 'updated' &&
      event.action.type === 'error' &&
      isSessionRevoked(event.action.error)
    ) {
      onRevoked();
    }
  });
  const stopMutations = queryClient.getMutationCache().subscribe((event) => {
    if (
      event.type === 'updated' &&
      event.action.type === 'error' &&
      isSessionRevoked(event.action.error)
    ) {
      onRevoked();
    }
  });
  return () => {
    stopQueries();
    stopMutations();
  };
}
