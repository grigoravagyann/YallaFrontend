import {
  createApiClient,
  createAuthSession,
  createMemoryIdentityStore,
  createMemoryTokenStorage,
  createMockVenueUserAuth,
  createVenueUserAuth,
  type AuthSession,
  type SignOutReason,
} from '@yalla/api';
import { readConfig } from '../config';
import { createIdbTokenStorage } from './tokenStorage';

/**
 * The console's token session.
 *
 * Access token in memory, refresh token in IndexedDB, one refresh in flight at
 * a time. The refresh call goes through a *bare* client with no session
 * attached, so a 401 on the refresh endpoint cannot trigger another refresh.
 *
 * Sign-out — asked for, or forced by a rejected refresh — is broadcast so the
 * router can send the user to sign-in with where they were preserved. The
 * session itself knows nothing about routes.
 */
const config = readConfig();

/** The sign-in response's display name, kept for `getCurrentUser`. */
export const identityStore = createMemoryIdentityStore();

const signedOutListeners = new Set<(reason: SignOutReason) => void>();

export function onSignedOut(listener: (reason: SignOutReason) => void): () => void {
  signedOutListeners.add(listener);
  return () => {
    signedOutListeners.delete(listener);
  };
}

/**
 * Against the mock data source the venue auth honours only the reset link
 * the console mock issues (QA F15); sign-in stays with the dev role switcher.
 */
const venueAuth = config.api
  ? createVenueUserAuth(createApiClient({ baseUrl: config.api.baseUrl }))
  : createMockVenueUserAuth();

export const authSession: AuthSession = config.api
  ? createAuthSession({
      storage: createIdbTokenStorage(),
      refreshTokens: venueAuth.refreshTokens,
      revoke: venueAuth.signOut,
      onSignedOut: (reason) => {
        identityStore.set(null);
        for (const listener of signedOutListeners) listener(reason);
      },
    })
  : // The mock has no accounts; the dev role switcher plays that part.
    createAuthSession({
      storage: createMemoryTokenStorage(),
      refreshTokens: () => Promise.reject(new Error('The mock data source has no token session.')),
    });

/** Venue-user sign-in: email and password, then a token pair the session keeps. */
export async function signIn(email: string, password: string): Promise<void> {
  const { tokens, identity } = await venueAuth.signIn(email, password);
  identityStore.set(identity);
  await authSession.signIn(tokens);
}

export function signOut(): Promise<void> {
  return authSession.signOut();
}

/**
 * Spend a sign-in link on a password.
 *
 * Nothing is signed in afterwards, deliberately: the person sets a password
 * and then signs in with it like everyone else, so the link never becomes a
 * second way of holding a session. Through the bare client, as sign-in is.
 */
export async function resetPassword(resetToken: string, newPassword: string): Promise<void> {
  await venueAuth.resetPassword(resetToken, newPassword);
}
