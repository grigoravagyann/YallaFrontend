import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import {
  ApiError,
  AuthError,
  ConcurrencyConflictError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  ValidationError,
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

function clientWith(fetchImpl: typeof globalThis.fetch, extra = {}) {
  return createApiClient({ baseUrl: BASE, fetch: fetchImpl, ...extra });
}

describe('url building', () => {
  it('joins the base url and path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await clientWith(fetchImpl).get('/branches/7');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/branches/7`);
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
    await clientWith(fetchImpl, { getToken: () => 'tok-123' }).get('/me');
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer tok-123');
  });

  it('awaits an async token getter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl, { getToken: async () => 'tok-async' }).get('/me');
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer tok-async');
  });

  it('omits the header when signed out', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl, { getToken: () => null }).get('/venues');
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has('authorization')).toBe(false);
  });

  it('sends If-Match when a row version is supplied', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl).put('/tables/3', { status: 'occupied' }, { ifMatch: 'W/"v9"' });
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('if-match')).toBe('W/"v9"');
  });

  it('sets a json content type only when there is a body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = clientWith(fetchImpl);

    await client.get('/venues');
    expect((fetchImpl.mock.calls[0]?.[1]?.headers as Headers).has('content-type')).toBe(false);

    await client.post('/bookings', { tableId: '3' });
    expect((fetchImpl.mock.calls[1]?.[1]?.headers as Headers).get('content-type')).toBe(
      'application/json',
    );
  });
});

describe('responses', () => {
  it('returns the parsed body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: '3', label: 'T3' }));
    const result = await clientWith(fetchImpl).get<{ id: string }>('/tables/3');
    expect(result.data).toEqual({ id: '3', label: 'T3' });
    expect(result.status).toBe(200);
  });

  it('surfaces the ETag so it can be fed back as If-Match', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '3' }, { headers: { etag: 'W/"v9"' } }));
    const result = await clientWith(fetchImpl).get('/tables/3');
    expect(result.version).toBe('W/"v9"');
  });

  it('handles 204 with no body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await clientWith(fetchImpl).delete('/bookings/3');
    expect(result.data).toBeNull();
    expect(result.status).toBe(204);
  });
});

describe('409 Conflict', () => {
  // The expected outcome when two people tap the same free table a second apart.
  it('is surfaced as a recognisable concurrency error, not a generic failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ title: 'Conflict' }, { status: 409 }));

    await expect(clientWith(fetchImpl).post('/tables/3/seat')).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
  });

  it('is identifiable through the isConcurrencyConflict guard', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 409 }));
    try {
      await clientWith(fetchImpl).post('/tables/3/seat');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isConcurrencyConflict(error)).toBe(true);
    }
  });

  it('carries the row versions when the backend reports them', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ expectedVersion: 'W/"v9"', actualVersion: 'W/"v10"' }, { status: 409 }),
      );

    try {
      await clientWith(fetchImpl).put('/tables/3', {}, { ifMatch: 'W/"v9"' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const conflict = error as ConcurrencyConflictError;
      expect(conflict.expectedVersion).toBe('W/"v9"');
      expect(conflict.actualVersion).toBe('W/"v10"');
    }
  });

  it('falls back to the ETag header for the actual version', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 409, headers: { etag: 'W/"v11"' } }));
    try {
      await clientWith(fetchImpl).put('/tables/3', {});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ConcurrencyConflictError).actualVersion).toBe('W/"v11"');
    }
  });

  it('is not retryable — the same stale version will conflict again', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 409 }));
    await clientWith(fetchImpl)
      .put('/tables/3', {})
      .catch((error: unknown) => {
        expect(isRetryable(error)).toBe(false);
      });
  });
});

describe('other error mapping', () => {
  it.each([
    [401, AuthError],
    [403, AuthError],
    [404, NotFoundError],
    [400, ValidationError],
    [422, ValidationError],
    [500, ServerError],
    [503, ServerError],
  ])('maps %i to the right error type', async (status, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status }));
    await expect(clientWith(fetchImpl).get('/x')).rejects.toBeInstanceOf(expected);
  });

  it('maps an unhandled 4xx to the base ApiError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 418 }));
    const error = await clientWith(fetchImpl)
      .get('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ServerError);
    expect((error as ApiError).status).toBe(418);
  });

  it('extracts ProblemDetails field errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ errors: { partySize: ['Must be at least 1.'] } }, { status: 400 }),
      );
    const error = await clientWith(fetchImpl)
      .post('/bookings', {})
      .catch((e: unknown) => e);
    expect((error as ValidationError).errors['partySize']).toEqual(['Must be at least 1.']);
  });

  it('captures the request id for support', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 500, headers: { 'x-request-id': 'req-42' } }));
    const error = await clientWith(fetchImpl)
      .get('/x')
      .catch((e: unknown) => e);
    expect((error as ApiError).requestId).toBe('req-42');
  });

  it('wraps a transport failure as NetworkError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await clientWith(fetchImpl)
      .get('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    // The basement-wifi case: the mutation definitely did not apply.
    expect((error as NetworkError).status).toBe(0);
  });

  it('reports a timeout distinctly from a network failure', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    ) as unknown as typeof globalThis.fetch;

    const error = await clientWith(fetchImpl)
      .get('/slow', { timeoutMs: 10 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });
});

describe('isRetryable', () => {
  it('is true for transport and server failures', () => {
    expect(isRetryable(new NetworkError({ url: BASE }))).toBe(true);
    expect(isRetryable(new TimeoutError({ url: BASE, timeoutMs: 1 }))).toBe(true);
    expect(isRetryable(new ServerError({ status: 500, url: BASE }))).toBe(true);
  });

  it('is false for client errors that will not change on retry', () => {
    expect(isRetryable(new NotFoundError({ url: BASE }))).toBe(false);
    expect(isRetryable(new AuthError({ status: 401, url: BASE }))).toBe(false);
    expect(isRetryable(new ConcurrencyConflictError({ url: BASE }))).toBe(false);
    expect(isRetryable(new Error('something else'))).toBe(false);
  });
});
