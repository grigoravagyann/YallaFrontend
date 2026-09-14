import type { AuthSession } from '@yalla/api';
import type { QueryClient } from '@tanstack/react-query';
import { accountKeys } from '../data/accountQueries';
import { resetDinerScopedQueries } from '../data/dinerScope';
import { useSession } from '../stores/session';

/**
 * Sign the diner out of this phone. One path for every way out: the Profile
 * tab's "Log out", a deleted account, and a session the server revoked.
 *
 * The token session forgets the refresh token — and tells the server, when it
 * can reach it. Whatever that does, the local half runs in `finally`: the
 * account leaves the store, the profile is dropped and every per-diner answer
 * (orders, the review, favourites, notifications) is reset, so none of it
 * greets whoever uses this phone next. A server that cannot be reached is no
 * reason to leave somebody signed in on a phone they handed back.
 *
 * The remembered number, name and email stay, as the store intends: prefill,
 * not a session.
 */
export async function signOut(queryClient: QueryClient, auth: AuthSession): Promise<void> {
  try {
    await auth.signOut();
  } catch {
    // Reported nowhere on purpose: the local sign-out below is the part that matters.
  } finally {
    useSession.getState().clear();
    queryClient.removeQueries({ queryKey: accountKeys.profile });
    resetDinerScopedQueries(queryClient);
  }
}
