import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../errors';
import { createAuthSession, webLocksExclusive, type TokenPair } from './session';
import { createMemoryTokenStorage } from './storage';

/**
 * Two tabs, one refresh token (review of feat/venue-console-1).
 *
 * The console keeps the refresh token in IndexedDB, which every tab of the
 * origin shares, and each tab has its own session. "Sign out everywhere else"
 * (and a password change) kills every access token at once, so every open tab
 * refreshes at the same moment. The server rotates refresh tokens and revokes
 * the whole chain when a spent one comes back: two tabs that both read
 * `refresh-0` and both spend it sign the person out everywhere. Across tabs,
 * read → refresh → store has to be one step, under a Web Lock.
 */

function jwt(n: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: 1_900_000_000, n })}.sig`;
}

/** The backend's refresh: rotates, and on reuse of a spent token revokes the chain. */
function rotatingBackend(first: string) {
  let current: string | null = first;
  let issued = 0;
  const refreshTokens = vi.fn(async (token: string): Promise<TokenPair> => {
    // Long enough for the other tab to have read the same token meanwhile.
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (token !== current) {
      current = null;
      throw new UnauthorizedError({ url: 'https://api/auth/venue/refresh' });
    }
    issued += 1;
    current = `refresh-${issued}`;
    return { accessToken: jwt(issued), refreshToken: current, expiresInSeconds: 900 };
  });
  return { refreshTokens, revoked: () => current === null };
}

/** `navigator.locks.request` for one origin: a FIFO mutex per lock name. */
function fakeLocks() {
  const tails = new Map<string, Promise<unknown>>();
  let held = 0;
  return {
    get held() {
      return held;
    },
    request<T>(name: string, run: () => Promise<T>): Promise<T> {
      const previous = tails.get(name) ?? Promise.resolve();
      const result = previous.then(async () => {
        held += 1;
        try {
          return await run();
        } finally {
          held -= 1;
        }
      });
      tails.set(
        name,
        result.catch(() => undefined),
      );
      return result;
    },
  };
}

function twoTabs(exclusive?: ReturnType<typeof webLocksExclusive>) {
  const storage = createMemoryTokenStorage('refresh-0');
  const backend = rotatingBackend('refresh-0');
  const tab = () => createAuthSession({ storage, refreshTokens: backend.refreshTokens, exclusive });
  return { storage, backend, a: tab(), b: tab() };
}

describe('two tabs refreshing at once', () => {
  it('under a Web Lock, the second tab reads the token the first one stored and both stay signed in', async () => {
    const locks = fakeLocks();
    const { storage, backend, a, b } = twoTabs(webLocksExclusive('yalla-refresh', locks));
    const [first, second] = await Promise.all([a.refresh(), b.refresh()]);

    expect(backend.revoked()).toBe(false);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(backend.refreshTokens.mock.calls.map(([token]) => token)).toEqual([
      'refresh-0',
      'refresh-1',
    ]);
    expect(await storage.read()).toBe('refresh-2');
    expect(a.getState()).toBe('signedIn');
    expect(b.getState()).toBe('signedIn');
    expect(locks.held).toBe(0);
  });

  it('runs as before where the browser has no Web Locks', () => {
    expect(webLocksExclusive('yalla-refresh', null)).toBeUndefined();
  });
});
