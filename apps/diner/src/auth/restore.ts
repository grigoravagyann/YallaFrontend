import type { AuthSession } from '@yalla/api';
import { EMPTY_PROFILE, useSession, type ProfileStorage } from '../stores/session';

/**
 * Bring the diner back as they left: signed in if the keychain still holds a
 * refresh token, with the number and name they booked under.
 *
 * "Signed in" comes from the token session, not from having passed the verify
 * screen this launch. Before this, a restored session counted as unverified, so
 * a returning diner's "Reserve" cost another SMS against the hourly per-number
 * limit, and push registration — which waits on being signed in — never ran
 * again after a relaunch, leaving reminders going to a rotated token.
 *
 * Returns the unsubscribe for the session listener, which keeps the cache in
 * step when a refresh is refused later.
 */
export async function restoreDinerSession(deps: {
  readonly auth: AuthSession;
  readonly profile: ProfileStorage;
}): Promise<() => void> {
  const [state, stored] = await Promise.all([
    deps.auth.restore(),
    deps.profile.read().catch(() => EMPTY_PROFILE),
  ]);

  const session = useSession.getState();
  session.hydrate(stored);
  if (state === 'signedIn') session.setSignedIn(true);

  return deps.auth.subscribe((next) => {
    if (next === 'signedIn') useSession.getState().setSignedIn(true);
    if (next === 'signedOut') useSession.getState().setSignedIn(false);
  });
}
