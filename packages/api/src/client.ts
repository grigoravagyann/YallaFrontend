import type { AuthSession } from './auth/session';
import {
  ApiError,
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
} from './errors';
import { parseProblem } from './problem';

/** Returns the current bearer token, or null when signed out. May be async. */
export type TokenGetter = () => string | null | Promise<string | null>;

export interface ApiClientConfig {
  /** Backend origin, e.g. `https://api.yalla.am` or `http://192.168.1.42:5086`. */
  readonly baseUrl: string;
  /**
   * The session that supplies bearer tokens and refreshes them. When set, a
   * 401 triggers one single-flight refresh and one retry; when the refresh
   * fails the session signs out and the error reaches the caller as
   * {@link UnauthorizedError}.
   */
  readonly auth?: AuthSession | undefined;
  /** A plain token supplier, for tests and for callers with no refresh flow. */
  readonly getToken?: TokenGetter | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  /** Swappable for tests. Defaults to the platform `fetch`. */
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** Extra headers applied to every request, e.g. an app version. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly query?:
    Readonly<Record<string, string | number | boolean | undefined | null>> | undefined;
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /**
   * Row version the caller believes it is updating, sent as `If-Match`.
   * Supplying it is what turns a lost update into a 409 the user can be told
   * about, rather than a silent overwrite of someone else's change.
   */
  readonly ifMatch?: string | undefined;
  /**
   * Send no bearer token and never refresh on 401. For the auth endpoints
   * themselves: a refresh call that refreshed on its own 401 would loop.
   */
  readonly skipAuth?: boolean | undefined;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(baseUrl: string, path: string, query: RequestOptions['query']): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\/+/u, ''), base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  if (contentType.includes('json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function stringField(body: unknown, field: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Turn a non-2xx response into the right typed error — once, here, for every
 * screen.
 *
 * The 409 branch is the reason this lives in one function: it must be
 * impossible for a call site to surface a conflict as a generic failure. The
 * problem document's `context` travels with it as the server's current state.
 */
function toError(response: Response, url: string, body: unknown): ApiError {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const problem = parseProblem(body);
  const base = { url, requestId, body, problem };

  switch (response.status) {
    case 401:
      return new UnauthorizedError(base);
    case 403:
      return new ForbiddenError(base);
    case 404:
      return new NotFoundError(base);
    case 409:
      return new ConcurrencyConflictError({
        ...base,
        expectedVersion: stringField(body, 'expectedVersion'),
        actualVersion:
          stringField(body, 'actualVersion') ?? response.headers.get('etag') ?? undefined,
      });
    /*
     * 422 is two different answers on this API and the code is what separates
     * them. `validation-failed` is "these fields are wrong", collected — since
     * Backend Prompt 13 that is what a create with missing fields returns, and
     * reading it as a state-transition refusal loses every field name it names.
     * Everything else at 422 really is a transition the current state forbids.
     */
    case 422:
      return base.problem?.code === 'validation-failed'
        ? new ValidationError({ ...base, status: 422 })
        : new InvalidTransitionError(base);
    case 400:
      return new ValidationError({ ...base, status: 400 });
    case 429:
      return new TooManyRequestsError(base);
    default:
      if (response.status >= 500) return new ServerError({ ...base, status: response.status });
      return new ApiError(`Request failed with status ${response.status}.`, {
        ...base,
        status: response.status,
      });
  }
}

export interface ApiResponse<T> {
  readonly data: T;
  /** `ETag`, when present — feed it back as `ifMatch` on the next write. */
  readonly version: string | undefined;
  readonly status: number;
  /**
   * The response headers, for the few callers that need one this shape does not
   * already name.
   *
   * The report CSV export is the reason: the filename an owner's browser saves
   * lives in `Content-Disposition`, and deriving it client-side instead would
   * mean writing the server's naming convention down a second time, in another
   * language, where it could quietly drift.
   */
  readonly headers: Headers;
}

export class ApiClient {
  readonly #config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.#config = config;
  }

  get baseUrl(): string {
    return this.#config.baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.#send<T>(path, options, false);
  }

  async #token(options: RequestOptions): Promise<string | null> {
    if (options.skipAuth) return null;
    if (this.#config.auth) return this.#config.auth.getAccessToken();
    return (await this.#config.getToken?.()) ?? null;
  }

  async #send<T>(path: string, options: RequestOptions, isRetry: boolean): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      query,
      body,
      signal,
      timeoutMs = this.#config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: perRequestHeaders,
      ifMatch,
    } = options;

    const url = buildUrl(this.#config.baseUrl, path, query);
    const doFetch = this.#config.fetch ?? globalThis.fetch;

    const headers = new Headers({ accept: 'application/json' });
    for (const [key, value] of Object.entries(this.#config.headers ?? {})) {
      headers.set(key, value);
    }
    for (const [key, value] of Object.entries(perRequestHeaders ?? {})) {
      headers.set(key, value);
    }

    const token = await this.#token(options);
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (ifMatch) headers.set('if-match', ifMatch);
    if (body !== undefined) headers.set('content-type', 'application/json');

    // Compose the caller's signal with our timeout so either can abort.
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const composed = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers,
        signal: composed,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      if (timeoutSignal.aborted) throw new TimeoutError({ url, timeoutMs });
      // A caller-initiated abort is not a failure; let it propagate untouched.
      if (signal?.aborted) throw cause;
      throw new NetworkError({ url, cause });
    }

    // One refresh, one retry. Several requests failing at once all await the
    // same refresh inside the session, so the rotating token is spent exactly
    // once — spending it twice is what gets a user signed out.
    if (response.status === 401 && this.#config.auth && !options.skipAuth && !isRetry) {
      const current = this.#config.auth.peekAccessToken();
      const fresh = current && current !== token ? current : await this.#config.auth.refresh();
      if (fresh) return this.#send<T>(path, options, true);
    }

    const payload = await readBody(response);

    if (!response.ok) throw toError(response, url, payload);

    return {
      data: payload as T,
      version: response.headers.get('etag') ?? undefined,
      status: response.status,
      headers: response.headers,
    };
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
