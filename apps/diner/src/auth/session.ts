import {
  createApiClient,
  createAuthSession,
  createDinerAuth,
  createMemoryTokenStorage,
  type AuthSession,
} from '@yalla/api';
import { apiConfig, dataSource } from '../config';
import { useSession } from '../stores/session';
import { createSecureTokenStorage } from './tokenStorage';

/**
 * The diner's token session.
 *
 * Access token in memory, refresh token in the device keychain, one refresh in
 * flight at a time. The refresh call goes through a *bare* client with no
 * session attached, so a 401 on the refresh endpoint itself cannot trigger
 * another refresh.
 *
 * When a refresh is rejected — the chain was revoked, or thirty days passed —
 * the verification state is cleared, so the next "Reserve" tap sends the diner
 * back through phone verification with their table still selected underneath.
 * That is the diner app's sign-in, and it already preserves where they were.
 */
function buildSession(): AuthSession {
  if (dataSource === 'mock' || !apiConfig) {
    return createAuthSession({
      storage: createMemoryTokenStorage(),
      refreshTokens: () => Promise.reject(new Error('The mock data source has no token session.')),
    });
  }

  const bare = createApiClient({ baseUrl: apiConfig.baseUrl });
  const dinerAuth = createDinerAuth(bare);

  return createAuthSession({
    storage: createSecureTokenStorage(),
    refreshTokens: dinerAuth.refreshTokens,
    revoke: dinerAuth.signOut,
    onSignedOut: (reason) => {
      if (reason === 'expired') useSession.getState().clear();
    },
  });
}

export const authSession: AuthSession = buildSession();
