import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../client';
import { UnauthorizedError } from '../errors';
import { createVenueUserAuth } from './endpoints';
import { createAuthSession } from './session';
import { createMemoryTokenStorage } from './storage';

const BASE = 'https://api.test.yalla.am';

function noContent() {
  return new Response(null, { status: 204 });
}

function problem(status: number, code: string) {
  return new Response(
    JSON.stringify({
      code,
      status,
      title: 'Problem',
      detail: `Detail for ${code}.`,
      type: `https://yalla.am/problems/${code}`,
      traceId: 'trace-1',
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function sent(fetchImpl: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchImpl.mock.calls[call] as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Headers,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

/**
 * The two password-reset calls.
 *
 * Both are anonymous by construction: the link is the whole credential, and a
 * request that carried a bearer — or refreshed one on the endpoint's own 401 —
 * would tie somebody else's session to a password they are not setting.
 */
describe('resetting a venue-user password', () => {
  it('spends the link with no bearer, even when the client holds a token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(noContent());
    const auth = createVenueUserAuth(
      createApiClient({ baseUrl: BASE, fetch: fetchImpl, getToken: () => 'held-token' }),
    );

    await auth.resetPassword('tok-1', 'correct horse battery staple');

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/auth/venue/reset-password`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({
      resetToken: 'tok-1',
      newPassword: 'correct horse battery staple',
    });
    expect(request.headers.has('authorization')).toBe(false);
  });

  it('reports a spent link as 401 without trying to refresh anything', async () => {
    const refreshTokens = vi.fn();
    const session = createAuthSession({
      storage: createMemoryTokenStorage('refresh-0'),
      refreshTokens,
    });
    const fetchImpl = vi.fn().mockResolvedValue(problem(401, 'reset-token-invalid'));
    const auth = createVenueUserAuth(
      createApiClient({ baseUrl: BASE, fetch: fetchImpl, auth: session }),
    );

    await expect(
      auth.resetPassword('tok-spent', 'correct horse battery staple'),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('asks for a link by email, anonymously, in the language given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const auth = createVenueUserAuth(
      createApiClient({ baseUrl: BASE, fetch: fetchImpl, getToken: () => 'held-token' }),
    );

    await auth.requestPasswordReset('owner@lumen.am', 'hy');

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/auth/venue/request-password-reset`);
    expect(request.body).toEqual({ email: 'owner@lumen.am', localeCode: 'hy' });
    expect(request.headers.has('authorization')).toBe(false);
  });
});
