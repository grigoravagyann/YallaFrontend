import type { QueryClient } from '@tanstack/react-query';
import { useSession } from '../stores/session';

/**
 * Queries whose answer belongs to whoever is signed in, and so must not outlive
 * them on a shared phone.
 *
 * The keys are written out rather than imported from `orders/hooks` and the
 * review composer: both pull in the gateway, and this module is tested without
 * a phone. `['dinerOrders']` is `dinerOrderKeys.all`.
 */
const DINER_SCOPED_KEYS = [['dinerOrders'], ['places', 'myReview']] as const;

/** This diner's own review of one place — `GET /api/diner/branches/{id}/review`. */
export const myReviewKey = (placeId: string) => ['places', 'myReview', placeId] as const;

/**
 * Forget every per-diner answer.
 *
 * `resetQueries`, not `removeQueries`: a screen still mounted (the Orders tab
 * stays mounted behind the tab bar) keeps observing, and a removed query would
 * leave it showing the last person's data with nothing to refetch. A reset
 * clears the data and refetches only what is on screen and allowed to run.
 */
export function resetDinerScopedQueries(queryClient: QueryClient): void {
  for (const queryKey of DINER_SCOPED_KEYS) void queryClient.resetQueries({ queryKey });
}

/**
 * Reset them whenever the session changes hands: a sign-out, a refresh the
 * server refused, a sign-in, or a different account signing in over the last.
 *
 * Watching the store covers every path at once — the Profile tab's log out,
 * `restoreDinerSession`'s listener and the sign-in mutations — rather than
 * trusting each to remember. Returns the unsubscribe.
 */
export function resetDinerQueriesOnSessionChange(queryClient: QueryClient): () => void {
  let lastAccount = useSession.getState().profile?.dinerUserId ?? null;
  return useSession.subscribe((state, previous) => {
    let changedHands = state.signedIn !== previous.signedIn;
    const account = state.profile?.dinerUserId ?? null;
    if (account !== null) {
      if (lastAccount !== null && account !== lastAccount) changedHands = true;
      lastAccount = account;
    }
    if (!state.signedIn) lastAccount = null;
    if (changedHands) resetDinerScopedQueries(queryClient);
  });
}
