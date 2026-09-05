import { describe, expect, it, vi } from 'vitest';
import { NetworkError, UnauthorizedError } from '../errors';
import { createAuthSession, type TokenPair } from './session';
import { createMemoryTokenStorage } from './storage';

/** A JWT-shaped token whose payload carries `exp`. Not signed; the client never verifies. */
function jwt(expSeconds: number, extra: Record<string, unknown> = {}): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: expSeconds, ...extra })}.sig`;
}

const NOW = 1_800_000_000_000;

function pair(n: number, lifetimeSeconds = 900): TokenPair {
  return {
    accessToken: jwt(NOW / 1000 + lifetimeSeconds, { n }),
    refreshToken: `refresh-${n}`,
    expiresInSeconds: lifetimeSeconds,
  };
}

describe('single-flight refresh', () => {
  it('spends the refresh token exactly once when several callers race', async () => {
    const storage = createMemoryTokenStorage('refresh-0');
    let calls = 0;
    const refreshTokens = vi.fn(async (token: string) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(token).toBe('refresh-0');
      return pair(1);
    });
    const session = createAuthSession({ storage, refreshTokens, now: () => NOW });

    const results = await Promise.all([
      session.refresh(),
      session.refresh(),
      session.getAccessToken(),
      session.getAccessToken(),
      session.refresh(),
    ]);

    expect(calls).toBe(1);
    expect(new Set(results).size).toBe(1);
    expect(await storage.read()).toBe('refresh-1');
    expect(session.getState()).toBe('signedIn');
  });

  it('allows a fresh refresh once the previous one has settled', async () => {
    const storage = createMemoryTokenStorage('refresh-0');
    const refreshTokens = vi
      .fn<(token: string) => Promise<TokenPair>>()
      .mockResolvedValueOnce(pair(1))
      .mockResolvedValueOnce(pair(2));
    const session = createAuthSession({ storage, refreshTokens, now: () => NOW });

    await session.refresh();
    await session.refresh();

    expect(refreshTokens).toHaveBeenCalledTimes(2);
    expect(refreshTokens.mock.calls[1]?.[0]).toBe('refresh-1');
  });
});

describe('access token lifecycle', () => {
  it('returns the held token while it is fresh, without touching the network', async () => {
    const refreshTokens = vi.fn();
    const session = createAuthSession({
      storage: createMemoryTokenStorage(),
      refreshTokens,
      now: () => NOW,
    });
    await session.signIn(pair(1));

    expect(await session.getAccessToken()).toBe(pair(1).accessToken);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it('refreshes before a request when the token is within the expiry skew', async () => {
    let now = NOW;
    const refreshTokens = vi.fn(async () => pair(2));
    const session = createAuthSession({
      storage: createMemoryTokenStorage(),
      refreshTokens,
      now: () => now,
    });
    await session.signIn(pair(1, 900));

    now = NOW + 890_000; // ten seconds before exp: inside the 30s skew.
    const token = await session.getAccessToken();

    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(token).toBe(pair(2).accessToken);
  });

  it('restores as signed in when a refresh token is stored, and mints access lazily', async () => {
    const refreshTokens = vi.fn(async () => pair(1));
    const session = createAuthSession({
      storage: createMemoryTokenStorage('refresh-0'),
      refreshTokens,
      now: () => NOW,
    });

    expect(await session.restore()).toBe('signedIn');
    expect(session.peekAccessToken()).toBeNull();
    expect(await session.getAccessToken()).toBe(pair(1).accessToken);
  });

  it('restores as signed out with nothing stored, and never calls refresh', async () => {
    const refreshTokens = vi.fn();
    const onSignedOut = vi.fn();
    const session = createAuthSession({
      storage: createMemoryTokenStorage(),
      refreshTokens,
      onSignedOut,
      now: () => NOW,
    });

    expect(await session.restore()).toBe('signedOut');
    expect(await session.getAccessToken()).toBeNull();
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

describe('a rejected refresh', () => {
  it('clears tokens and reports the sign-out as expired', async () => {
    const storage = createMemoryTokenStorage('refresh-0');
    const onSignedOut = vi.fn();
    const session = createAuthSession({
      storage,
      refreshTokens: () =>
        Promise.reject(new UnauthorizedError({ url: 'https://api/auth/diner/refresh' })),
      onSignedOut,
      now: () => NOW,
    });

    expect(await session.refresh()).toBeNull();
    expect(await storage.read()).toBeNull();
    expect(session.getState()).toBe('signedOut');
    expect(onSignedOut).toHaveBeenCalledWith('expired');
  });

  it('keeps the tokens when the server could not be reached — the token may still be good', async () => {
    const storage = createMemoryTokenStorage('refresh-0');
    const onSignedOut = vi.fn();
    const session = createAuthSession({
      storage,
      refreshTokens: () =>
        Promise.reject(new NetworkError({ url: 'https://api/auth/diner/refresh' })),
      onSignedOut,
      now: () => NOW,
    });

    await expect(session.refresh()).rejects.toBeInstanceOf(NetworkError);
    expect(await storage.read()).toBe('refresh-0');
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('revokes best-effort, clears storage and notifies listeners', async () => {
    const storage = createMemoryTokenStorage('refresh-0');
    const revoke = vi.fn(async () => undefined);
    const onSignedOut = vi.fn();
    const states: string[] = [];
    const session = createAuthSession({
      storage,
      refreshTokens: vi.fn(),
      revoke,
      onSignedOut,
      now: () => NOW,
    });
    session.subscribe((state) => states.push(state));

    await session.signOut();

    expect(revoke).toHaveBeenCalledWith('refresh-0');
    expect(await storage.read()).toBeNull();
    expect(onSignedOut).toHaveBeenCalledWith('signedOut');
    expect(states).toEqual(['signedOut']);
  });

  it('still signs out locally when revocation fails', async () => {
    const storage = createMemoryTokenStorage('refresh-0');
    const session = createAuthSession({
      storage,
      refreshTokens: vi.fn(),
      revoke: () => Promise.reject(new NetworkError({ url: 'https://api/auth/diner/sign-out' })),
      now: () => NOW,
    });

    await session.signOut();
    expect(await storage.read()).toBeNull();
    expect(session.getState()).toBe('signedOut');
  });
});
