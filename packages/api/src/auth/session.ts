import { ApiError, NetworkError, TimeoutError } from '../errors';
import { jwtExpiresAtMs } from './jwt';
import type { TokenStorage } from './storage';

/** What every sign-in and refresh endpoint hands back. */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
}

export type AuthState =
  /** Storage not read yet. */
  | 'unknown'
  | 'signedOut'
  /** A refresh token is held; an access token is minted from it on demand. */
  | 'signedIn';

export type SignOutReason =
  /** The refresh token was rejected: expired, revoked, or spent by someone else. */
  | 'expired'
  /** The person asked to leave. */
  | 'signedOut';

export interface AuthSessionConfig {
  readonly storage: TokenStorage;
  /** The platform's refresh endpoint. Must not itself go through the session. */
  readonly refreshTokens: (refreshToken: string) => Promise<TokenPair>;
  /** Best-effort server-side revocation on sign-out. Failures are swallowed. */
  readonly revoke?: ((refreshToken: string) => Promise<void>) | undefined;
  /** Route to sign-in from here, preserving where the user was. */
  readonly onSignedOut?: ((reason: SignOutReason) => void) | undefined;
  readonly now?: (() => number) | undefined;
}

export interface AuthSession {
  /** Read storage once. Call before the first render so the app knows whether to show sign-in. */
  restore(): Promise<AuthState>;
  /**
   * A bearer token, or null when signed out.
   *
   * Refreshes first when the held token is within thirty seconds of expiry, so
   * a request goes out with a token that will still be valid when it lands.
   */
  getAccessToken(): Promise<string | null>;
  /**
   * Trade the refresh token for a new pair. **Single-flight**: any number of
   * callers arriving while one refresh is in flight all await the same promise.
   * The backend rotates refresh tokens and revokes the whole chain on reuse, so
   * two refreshes racing each other would sign the user out.
   */
  refresh(): Promise<string | null>;
  /** The current access token without any I/O, for reading claims. */
  peekAccessToken(): string | null;
  signIn(tokens: TokenPair): Promise<void>;
  signOut(): Promise<void>;
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
}

/** Refresh this long before `exp` so the request that follows never carries a dead token. */
const EXPIRY_SKEW_MS = 30_000;

export function createAuthSession(config: AuthSessionConfig): AuthSession {
  const now = config.now ?? (() => Date.now());
  const listeners = new Set<(state: AuthState) => void>();

  let state: AuthState = 'unknown';
  let accessToken: string | null = null;
  let accessExpiresAtMs = 0;
  let inflight: Promise<string | null> | null = null;

  function setState(next: AuthState) {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener(next);
  }

  function accessIsFresh(): boolean {
    return accessToken !== null && now() < accessExpiresAtMs - EXPIRY_SKEW_MS;
  }

  async function adopt(pair: TokenPair): Promise<void> {
    accessToken = pair.accessToken;
    accessExpiresAtMs = jwtExpiresAtMs(pair.accessToken) ?? now() + pair.expiresInSeconds * 1000;
    await config.storage.write(pair.refreshToken);
    setState('signedIn');
  }

  async function forget(reason: SignOutReason): Promise<void> {
    accessToken = null;
    accessExpiresAtMs = 0;
    await config.storage.clear();
    setState('signedOut');
    config.onSignedOut?.(reason);
  }

  function refresh(): Promise<string | null> {
    if (inflight) return inflight;

    inflight = (async () => {
      const refreshToken = await config.storage.read();
      if (!refreshToken) {
        // Nothing to refresh with. Not a sign-out event: nobody was signed in.
        accessToken = null;
        setState('signedOut');
        return null;
      }

      try {
        const pair = await config.refreshTokens(refreshToken);
        await adopt(pair);
        return pair.accessToken;
      } catch (error) {
        // Could not reach the server, or the server fell over: the token may
        // well still be good, so keep it and let the caller report the outage.
        if (error instanceof NetworkError || error instanceof TimeoutError) throw error;
        if (error instanceof ApiError && error.status >= 500) throw error;
        // Anything else is the backend saying no — expired, revoked, or spent.
        await forget('expired');
        return null;
      }
    })().finally(() => {
      inflight = null;
    });

    return inflight;
  }

  return {
    async restore() {
      if (state !== 'unknown') return state;
      const stored = await config.storage.read();
      setState(stored ? 'signedIn' : 'signedOut');
      return state;
    },

    async getAccessToken() {
      if (accessIsFresh()) return accessToken;
      if (state === 'signedOut') return null;
      return refresh();
    },

    refresh,

    peekAccessToken: () => accessToken,

    signIn: adopt,

    async signOut() {
      const refreshToken = await config.storage.read();
      if (refreshToken && config.revoke) {
        try {
          await config.revoke(refreshToken);
        } catch {
          // The local sign-out must succeed even when the server is unreachable.
        }
      }
      await forget('signedOut');
    },

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
