import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from './auth/session';
import { createMemoryTokenStorage } from './auth/storage';
import { createApiClient } from './client';
import {
  type ApiError,
  AuthError,
  ConcurrencyConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  describeFailure,
  isConcurrencyConflict,
  isRetryable,
} from './errors';

const BASE = 'https://api.test.yalla.am';

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

/** A problem document the way the backend's `UnifiedErrorEnvelope` writes one. */
function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      code,
      status,
      title: 'Problem',
      detail: `Detail for ${code}.`,
      type: `https://yalla.am/problems/${code}`,
      traceId: 'trace-1',
      ...extra,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function clientWith(fetchImpl: typeof globalThis.fetch, extra = {}) {
  return createApiClient({ baseUrl: BASE, fetch: fetchImpl, ...extra });
}

function jwt(expSeconds: number, tag: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: expSeconds, tag })}.sig`;
}

describe('url building', () => {
  it('joins the base url and path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await clientWith(fetchImpl).get('/api/branches/7');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/api/branches/7`);
  });

  it('tolerates a trailing slash on the base and a missing leading slash on the path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await createApiClient({ baseUrl: `${BASE}/`, fetch: fetchImpl }).get('branches/7');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/branches/7`);
  });

  it('appends query parameters and skips null/undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl).get('/tables', {
      query: { branchId: 7, includeClosed: false, area: undefined, cursor: null },
    });
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get('branchId')).toBe('7');
    expect(url.searchParams.get('includeClosed')).toBe('false');
    expect(url.searchParams.has('area')).toBe(false);
    expect(url.searchParams.has('cursor')).toBe(false);
  });
});

describe('headers', () => {
  it('injects a bearer token from the getter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl, { getToken: () => 'abc' }).get('/x');
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer abc');
  });

  it('omits the header when signed out', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl, { getToken: () => null }).get('/x');
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.has('authorization')).toBe(false);
  });

  it('sends no token at all for skipAuth requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl, { getToken: () => 'abc' }).post(
      '/api/auth/diner/refresh',
      {},
      {
        skipAuth: true,
      },
    );
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.has('authorization')).toBe(false);
  });

  it('sends If-Match when a row version is supplied', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl).post('/x', { a: 1 }, { ifMatch: 'W/"7"' });
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.get('if-match')).toBe('W/"7"');
  });
});

describe('responses', () => {
  it('returns the parsed body and the ETag', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 1 }, { headers: { etag: 'W/"9"' } }));
    const response = await clientWith(fetchImpl).get<{ id: number }>('/x');
    expect(response.data.id).toBe(1);
    expect(response.version).toBe('W/"9"');
  });

  it('handles 204 with no body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const response = await clientWith(fetchImpl).post('/x');
    expect(response.data).toBeNull();
    expect(response.status).toBe(204);
  });
});

describe('problem details mapping', () => {
  it('409 is a recognisable conflict carrying the server current state', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        problem(409, 'table-state-conflict', { context: { currentState: 'Occupied' } }),
      );
    const error = await clientWith(fetchImpl)
      .post('/api/branches/b/tables/t/seat-walk-in', {})
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect(isConcurrencyConflict(error)).toBe(true);
    const conflict = error as ConcurrencyConflictError;
    expect(conflict.code).toBe('table-state-conflict');
    expect(conflict.currentState).toEqual({ currentState: 'Occupied' });
    expect(conflict.message).toBe('Detail for table-state-conflict.');
    expect(conflict.requestId).toBe('trace-1');
    expect(isRetryable(conflict)).toBe(false);
    expect(describeFailure(conflict)).toBe('conflict');
  });

  it('422 is an invalid transition with the specific reason', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(problem(422, 'invalid-table-transition'));
    const error = await clientWith(fetchImpl)
      .post('/x', {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).reason).toBe('Detail for invalid-table-transition.');
    expect(describeFailure(error)).toBe('invalid');
  });

  it('400 is a validation error with field messages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        problem(400, 'validation-failed', { errors: { partySize: ['Must be at least 1.'] } }),
      );
    const error = await clientWith(fetchImpl)
      .post('/x', {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors['partySize']).toEqual(['Must be at least 1.']);
  });

  it('403 is forbidden — never refreshed, never retried', async () => {
    const refreshTokens = vi.fn();
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('r0'),
      refreshTokens,
    });
    await auth.signIn({
      accessToken: jwt(9_999_999_999, 'a'),
      refreshToken: 'r0',
      expiresInSeconds: 900,
    });
    const fetchImpl = vi.fn().mockResolvedValue(problem(403, 'forbidden'));

    const error = await clientWith(fetchImpl, { auth })
      .get('/x')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toBeInstanceOf(AuthError);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(describeFailure(error)).toBe('forbidden');
  });

  it('maps 404, 429 and 5xx to their own types', async () => {
    const at = (response: Response) =>
      clientWith(vi.fn().mockResolvedValue(response))
        .get('/x')
        .catch((e: unknown) => e);
    expect(await at(problem(404, 'not-found'))).toBeInstanceOf(NotFoundError);
    expect(await at(problem(429, 'rate-limited'))).toBeInstanceOf(TooManyRequestsError);
    expect(await at(problem(503, 'internal-error'))).toBeInstanceOf(ServerError);
  });

  it('survives a non-problem body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<html>gateway timeout</html>', { status: 504 }));
    const error = await clientWith(fetchImpl)
      .get('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServerError);
    expect((error as ApiError).problem).toBeUndefined();
  });
});

describe('401 and the refresh flow', () => {
  function sessionWith(
    refreshTokens: (
      token: string,
    ) =>
      | Promise<never>
      | Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }>,
  ) {
    const onSignedOut = vi.fn();
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('r0'),
      refreshTokens,
      onSignedOut,
    });
    return { auth, onSignedOut };
  }

  it('refreshes once and retries once when a request gets a 401', async () => {
    const refreshTokens = vi.fn(async () => ({
      accessToken: jwt(9_999_999_999, 'fresh'),
      refreshToken: 'r1',
      expiresInSeconds: 900,
    }));
    const { auth } = sessionWith(refreshTokens);
    await auth.signIn({
      accessToken: jwt(9_999_999_999, 'stale'),
      refreshToken: 'r0',
      expiresInSeconds: 900,
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(problem(401, 'token-rejected'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const response = await clientWith(fetchImpl, { auth }).get<{ ok: boolean }>('/x');

    expect(response.data.ok).toBe(true);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    const retryHeaders = (fetchImpl.mock.calls[1]?.[1] as RequestInit).headers as Headers;
    expect(retryHeaders.get('authorization')).toBe(`Bearer ${jwt(9_999_999_999, 'fresh')}`);
  });

  it('four parallel 401s spend the refresh token exactly once', async () => {
    const refreshTokens = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        accessToken: jwt(9_999_999_999, 'fresh'),
        refreshToken: 'r1',
        expiresInSeconds: 900,
      };
    });
    const { auth } = sessionWith(refreshTokens);
    await auth.signIn({
      accessToken: jwt(9_999_999_999, 'stale'),
      refreshToken: 'r0',
      expiresInSeconds: 900,
    });

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const token = (init?.headers as Headers).get('authorization');
      return token === `Bearer ${jwt(9_999_999_999, 'fresh')}`
        ? jsonResponse({ ok: true })
        : problem(401, 'token-rejected');
    });

    const client = clientWith(fetchImpl as unknown as typeof globalThis.fetch, { auth });
    const results = await Promise.all([1, 2, 3, 4].map((n) => client.get(`/x/${n}`)));

    expect(results).toHaveLength(4);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });

  it('signs out and surfaces UnauthorizedError when the refresh is rejected', async () => {
    const { auth, onSignedOut } = sessionWith(() =>
      Promise.reject(new UnauthorizedError({ url: `${BASE}/api/auth/diner/refresh` })),
    );
    await auth.signIn({
      accessToken: jwt(9_999_999_999, 'stale'),
      refreshToken: 'r0',
      expiresInSeconds: 900,
    });
    const fetchImpl = vi.fn().mockResolvedValue(problem(401, 'token-rejected'));

    const error = await clientWith(fetchImpl, { auth })
      .get('/x')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(onSignedOut).toHaveBeenCalledWith('expired');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(describeFailure(error)).toBe('unauthorized');
  });

  it('does not refresh on a 401 from an auth endpoint itself', async () => {
    const refreshTokens = vi.fn();
    const { auth } = sessionWith(refreshTokens);
    const fetchImpl = vi.fn().mockResolvedValue(problem(401, 'token-rejected'));

    await expect(
      clientWith(fetchImpl, { auth }).post('/api/auth/venue/sign-in', {}, { skipAuth: true }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(refreshTokens).not.toHaveBeenCalled();
  });
});

describe('transport failures', () => {
  it('wraps a transport failure as NetworkError, which reads as offline', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await clientWith(fetchImpl)
      .get('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(describeFailure(error)).toBe('offline');
    expect(isRetryable(error)).toBe(true);
  });

  it('reports a timeout distinctly from a network failure', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const error = await clientWith(fetchImpl as unknown as typeof globalThis.fetch)
      .get('/x', { timeoutMs: 5 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(describeFailure(error)).toBe('offline');
  });
});
