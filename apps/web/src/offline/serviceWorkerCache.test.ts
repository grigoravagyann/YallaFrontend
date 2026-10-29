import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the service worker actually serves from cache.
 *
 * The one rule that matters here is a negative one:
 *
 *     SHELL ASSETS ARE CACHED. API RESPONSES ARE NEVER CACHED.
 *
 * A cached floor plan is the worst failure this product has, because it looks
 * correct. A waiter reading a table this worker served from disk, believing it
 * is free, walks a party into somebody's dinner — and nothing on screen says
 * the room is forty seconds old.
 *
 * Reading `sw.js` and agreeing with it is not an audit. So this evaluates the
 * real file in a stub of the worker global, dispatches the requests a running
 * tablet actually makes, and records which ones the worker takes over. The
 * answer is the assertion, not a comment.
 */

const SW_SOURCE = readFileSync(resolve(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');

const ORIGIN = 'https://yalla.example';

interface FetchHandler {
  (event: FakeFetchEvent): void;
}

/**
 * The three fields `sw.js` reads off a request.
 *
 * A real `Request` cannot be constructed with `mode: 'navigate'` outside a
 * browser — undici refuses it — and a navigation is the case that matters most
 * here, so the stand-in is structural.
 */
interface FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
}

interface FakeFetchEvent {
  readonly request: FakeRequest;
  respondWith(response: unknown): void;
}

/** How the worker treated one request. */
type Treatment =
  /** `respondWith` was called: the worker owns the answer. */
  | 'handled'
  /** The handler returned without responding: straight to the network. */
  | 'passthrough';

function loadWorker(network: () => Promise<Response> = async () => new Response('')): {
  dispatch: (request: FakeRequest) => Treatment;
  respond: (request: FakeRequest) => Promise<unknown>;
  cacheMatches: ReturnType<typeof vi.fn>;
  installed: () => Promise<readonly string[]>;
} {
  const handlers = new Map<string, FetchHandler>();
  const cacheMatches = vi.fn(async (_request: unknown) => undefined as unknown);
  const addAll = vi.fn(async (_requests: readonly { url: string }[]) => undefined);

  const cache = {
    addAll,
    put: vi.fn(async () => undefined),
    match: cacheMatches,
  };

  const self = {
    location: new URL(`${ORIGIN}/`),
    addEventListener: (type: string, handler: FetchHandler) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };

  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: cacheMatches,
  };

  // The real file, evaluated. Nothing here reimplements its rules.
  const run = new Function('self', 'caches', 'fetch', 'Request', SW_SOURCE) as (
    s: unknown,
    c: unknown,
    f: unknown,
    r: unknown,
  ) => void;
  // A worker resolves a relative URL against its own origin; Node's Request
  // cannot, so the precache list is recorded as written.
  class WorkerRequest {
    constructor(readonly url: string) {}
  }
  run(self, caches, vi.fn(network), WorkerRequest);

  const fetchHandler = handlers.get('fetch');
  if (!fetchHandler) throw new Error('sw.js registered no fetch handler');

  return {
    cacheMatches,
    async installed() {
      const install = handlers.get('install') as unknown as
        ((event: { waitUntil(p: Promise<unknown>): void }) => void) | undefined;
      let done: Promise<unknown> = Promise.resolve();
      install?.({ waitUntil: (p) => (done = p) });
      await done;
      return (addAll.mock.calls[0]?.[0] ?? []).map((r) => r.url);
    },
    respond(request: FakeRequest): Promise<unknown> {
      let answer: Promise<unknown> = Promise.resolve(undefined);
      fetchHandler({
        request,
        respondWith: (response) => {
          answer = Promise.resolve(response);
        },
      });
      return answer;
    },
    dispatch(request: FakeRequest): Treatment {
      let treatment: Treatment = 'passthrough';
      fetchHandler({
        request,
        respondWith: () => {
          treatment = 'handled';
        },
      });
      return treatment;
    },
  };
}

function get(url: string, init: { method?: string; mode?: string } = {}): FakeRequest {
  return { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' };
}

describe('the service worker', () => {
  let worker: ReturnType<typeof loadWorker>;

  beforeEach(() => {
    worker = loadWorker();
  });

  it('never touches an API response, same-origin or not', () => {
    // The rule the whole file exists for. Both spellings: the API lives on
    // another origin today, and a reverse proxy could put it on this one
    // tomorrow.
    expect(worker.dispatch(get('http://localhost:5086/api/branches/b1/tables/floor'))).toBe(
      'passthrough',
    );
    expect(worker.dispatch(get(`${ORIGIN}/api/branches/b1/tables/floor`))).toBe('passthrough');
    expect(worker.dispatch(get(`${ORIGIN}/api/tabs/t1/participants`))).toBe('passthrough');
    expect(worker.dispatch(get(`${ORIGIN}/api/auth/staff/device`))).toBe('passthrough');
  });

  it('never touches a mutation', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(worker.dispatch(get(`${ORIGIN}/api/tabs/t1/payments/cash`, { method }))).toBe(
        'passthrough',
      );
      // Not even a same-origin non-API POST.
      expect(worker.dispatch(get(`${ORIGIN}/anything`, { method }))).toBe('passthrough');
    }
  });

  it('serves the app shell, so an installed tablet opens in a basement', () => {
    // Navigations are network-first with the shell as the fallback, which is
    // what makes the icon on the home screen work with no signal.
    expect(worker.dispatch(get(`${ORIGIN}/staff`, { mode: 'navigate' }))).toBe('handled');
    expect(worker.dispatch(get(`${ORIGIN}/`, { mode: 'navigate' }))).toBe('handled');
  });

  it("falls back to the staff app's own shell, with the staff manifest in it", async () => {
    // The worker answers /staff only, and iOS installs the manifest the HTML
    // arrives with: index.html is the console's (src/manifestShell.ts).
    const offline = loadWorker(async () => {
      throw new TypeError('offline');
    });
    await offline.respond(get(`${ORIGIN}/staff/kitchen`, { mode: 'navigate' }));
    expect(offline.cacheMatches).toHaveBeenCalledWith('/staff.html');
    const precached = await offline.installed();
    expect(precached).toContain('/staff.html');
    expect(precached).not.toContain('/index.html');
    expect(precached).not.toContain('/');
  });

  it('serves hashed build assets from cache', () => {
    // Cache-first is safe only because the URL carries a content hash: a
    // changed file is a different URL, so a stale one cannot exist.
    expect(worker.dispatch(get(`${ORIGIN}/assets/bootstrap-DwE7FKEU.js`))).toBe('handled');
    expect(worker.dispatch(get(`${ORIGIN}/assets/index-I2M4spcQ.css`))).toBe('handled');
    expect(worker.dispatch(get(`${ORIGIN}/fonts/yalla-serif.woff2`))).toBe('handled');
    expect(worker.dispatch(get(`${ORIGIN}/manifest.webmanifest`))).toBe('passthrough');
    expect(worker.dispatch(get(`${ORIGIN}/favicon.svg`))).toBe('handled');
  });

  it('reads the manifest picker from the network first, the cache only offline', () => {
    // Not a hashed file: cache first would keep an old reserved-path list on
    // an installed tablet until the worker's version moved.
    expect(worker.dispatch(get(`${ORIGIN}/manifest-link.js`))).toBe('handled');
    expect(worker.cacheMatches).not.toHaveBeenCalled();
    expect(worker.dispatch(get(`${ORIGIN}/manifest-console.webmanifest`))).toBe('passthrough');
  });

  it('leaves anything it does not recognise to the network', () => {
    // The default is passthrough, not "cache it and hope". A payload this
    // worker has never heard of is data until proved otherwise.
    expect(worker.dispatch(get(`${ORIGIN}/some/unknown/path`))).toBe('passthrough');
    expect(worker.dispatch(get('https://cdn.example/analytics.js'))).toBe('passthrough');
  });
});
