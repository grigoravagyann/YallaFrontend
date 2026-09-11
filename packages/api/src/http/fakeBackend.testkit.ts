import { createApiClient, type ApiClient, type ApiClientConfig } from '../client';

/**
 * A backend in a box, for the gateway tests.
 *
 * Routes are keyed `METHOD /path` exactly as the server spells them, so a test
 * reads like the request it is about. Anything not in the table is a bare 404 —
 * the same answer an unmapped route gets from ASP.NET, with no problem body —
 * which is what lets a test prove a gateway is calling a route that does not
 * exist rather than assume it.
 *
 * Not a test file itself (no `.test.` in the name), so vitest never runs it; it
 * is imported by the ones that are.
 */

export const BASE_URL = 'https://api.test.yalla.am';

export interface FakeRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly headers: Headers;
}

export interface FakeReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export type FakeRoute = FakeReply | ((request: FakeRequest) => FakeReply | Promise<FakeReply>);

/** An RFC 7807 body shaped the way `ApiExceptionMapper` writes one. */
export function problemReply(
  status: number,
  code: string,
  context?: Readonly<Record<string, unknown>>,
  detail = code,
): FakeReply {
  return {
    status,
    body: {
      type: `https://yalla.am/problems/${code}`,
      title: 'Problem',
      status,
      detail,
      code,
      traceId: 'trace-test',
      ...(context ? { context } : {}),
    },
  };
}

export interface FakeBackend {
  readonly requests: FakeRequest[];
  readonly fetchImpl: typeof globalThis.fetch;
  client(config?: Partial<ApiClientConfig>): ApiClient;
}

export function fakeBackend(routes: Readonly<Record<string, FakeRoute>>): FakeBackend {
  const requests: FakeRequest[] = [];

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = init?.method ?? 'GET';
    const raw = init?.body;
    const request: FakeRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined,
      headers: new Headers(init?.headers),
    };
    requests.push(request);

    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response(null, { status: 404 });

    const reply = typeof route === 'function' ? await route(request) : route;
    const status = reply.status ?? 200;
    if (reply.body === undefined) {
      return new Response(null, { status, headers: { ...reply.headers } });
    }
    return new Response(JSON.stringify(reply.body), {
      status,
      headers: {
        'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
        ...reply.headers,
      },
    });
  };

  return {
    requests,
    fetchImpl,
    client: (config = {}) => createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl, ...config }),
  };
}
