import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from './auth/session';
import { createMemoryTokenStorage } from './auth/storage';
import { createApiClient } from './client';
import {
  SessionRevokedError,
  UnauthorizedError,
  describeFailure,
  isSessionRevoked,
} from './errors';

const BASE = 'https://api.test.yalla.am';

function problem(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Problem',
      status,
      detail: code,
      code,
      traceId: 't',
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

async function signedInSession() {
  const refreshTokens = vi.fn(async () => ({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
    expiresInSeconds: 900,
  }));
  const auth = createAuthSession({ storage: createMemoryTokenStorage('refresh-1'), refreshTokens });
  await auth.signIn({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSeconds: 900 });
  return { auth, refreshTokens };
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * K1: a diner session the server ended is refused with `session-revoked`. The
 * server's rule is "refresh once, and sign out if the refresh is refused too":
 * a password set or changed moves the session on but keeps the refresh tokens,
 * while a deletion or a displacement revokes them.
 */
describe('a revoked session', () => {
  it('refreshes once and carries on when the refresh is accepted, as after a password change', async () => {
    const { auth, refreshTokens } = await signedInSession();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(problem(401, 'session-revoked'))
      .mockResolvedValueOnce(ok());

    const response = await createApiClient({ baseUrl: BASE, fetch: fetchImpl, auth }).get(
      '/api/diner/me',
    );

    expect(response.data).toEqual({ ok: true });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retried = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(retried.headers).get('authorization')).toBe('Bearer access-2');
    expect(auth.getState()).toBe('signedIn');
  });

  it('rejects with SessionRevokedError and signs out when the refresh is refused too, as after a deletion', async () => {
    const { auth, refreshTokens } = await signedInSession();
    refreshTokens.mockRejectedValueOnce(new Error('refresh-token-revoked'));
    const fetchImpl = vi.fn().mockResolvedValue(problem(401, 'session-revoked'));

    const error = await createApiClient({ baseUrl: BASE, fetch: fetchImpl, auth })
      .get('/api/diner/me')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionRevokedError);
    // Still a 401 to everything that reads one as "signed out".
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(isSessionRevoked(error)).toBe(true);
    expect(describeFailure(error)).toBe('unauthorized');
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    // No retry with nothing to retry with.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.getState()).toBe('signedOut');
  });

  it('rejects with SessionRevokedError when the retry after a refresh is refused again', async () => {
    const { auth, refreshTokens } = await signedInSession();
    // A fresh response per call: a body can be read once.
    const fetchImpl = vi.fn().mockImplementation(async () => problem(401, 'session-revoked'));

    const error = await createApiClient({ baseUrl: BASE, fetch: fetchImpl, auth })
      .get('/api/diner/me')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionRevokedError);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('still refreshes and retries for an ordinary 401', async () => {
    const { auth, refreshTokens } = await signedInSession();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(problem(401, 'unauthenticated'))
      .mockResolvedValueOnce(ok());

    await createApiClient({ baseUrl: BASE, fetch: fetchImpl, auth }).get('/api/diner/me');

    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not refresh for a wrong password either: the token was accepted', async () => {
    const { auth, refreshTokens } = await signedInSession();
    const fetchImpl = vi.fn().mockResolvedValue(problem(401, 'invalid-credentials'));

    await expect(
      createApiClient({ baseUrl: BASE, fetch: fetchImpl, auth }).delete('/api/diner/me', {
        body: { password: 'wrong', code: null },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(auth.getState()).toBe('signedIn');
  });
});
