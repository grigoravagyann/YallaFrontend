import type { QueryClient } from '@tanstack/react-query';

/**
 * Forget everything the last session read, on every path that ends one or
 * starts one.
 *
 * The app's `QueryClient` is a module singleton (`bootstrap.tsx`) that outlives
 * a session, and the console's keys name a venue or a branch, not a caller. So
 * the cache is the only thing standing between "the owner just left" and "the
 * manager who signs in next on this tab is shown the owner's branches" — a
 * `managedVenue` answer is the same key for both of them, and within
 * `staleTime.reference` it would be handed straight back.
 *
 * One helper rather than a list repeated at each site, because the sites are
 * easy to miss: the sign-out listener in the console's router, the sign-in
 * form, and the password page a sign-in link opens — which sits *outside* the
 * console's router, so a sign-out from there fires with no listener mounted
 * and only the page itself can do the forgetting. A rejected refresh reaches
 * the same listener as a sign-out, and the sign-in form runs regardless of
 * how the last session ended, so the form is the backstop for all of them.
 *
 * Two families go, two stay:
 *
 * - `['currentUser']` — the identity the router is built from. *Reset* rather
 *   than removed, so a mounted `useCurrentUser` asks again straight away and
 *   the router re-forms around whoever is signed in now (or nobody).
 * - `['console', …]` — everything read on that identity's behalf.
 * - `['public', …]` and `['availability', …]` stay: the diner-facing page's
 *   venue, menu, room and booking are the same for everyone looking, and a
 *   held booking is the diner's by its token, not by any console session.
 * - `['staff', …]` stays: the counter tablet holds a device credential of its
 *   own, and its route never reaches the console's session at all.
 */
export async function forgetSessionQueries(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ queryKey: ['console'] });
  await queryClient.resetQueries({ queryKey: ['currentUser'] });
}
