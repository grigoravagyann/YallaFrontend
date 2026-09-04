import {
  ApiError,
  AuthError,
  ConcurrencyConflictError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  ValidationError,
} from './errors';

/** Returns the current bearer token, or null when signed out. May be async. */
export type TokenGetter = () => string | null | Promise<string | null>;

export interface ApiClientConfig {
  /** Backend origin, e.g. `https://api.yalla.am` or `http://localhost:5188`. */
  readonly baseUrl: string;
  /**
   * Injected rather than imported so this package never depends on an auth
   * store, and so tests can supply a fixed token.
   */
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

function problemErrors(body: unknown): Record<string, readonly string[]> | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors !== 'object' || errors === null) return undefined;
  return errors as Record<string, readonly string[]>;
}

function stringField(body: unknown, field: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Turn a non-2xx response into the right typed error.
 *
 * The 409 branch is the reason this lives in one function: it must be impossible
 * for a call site to surface a concurrency conflict as a generic failure.
 */
function toError(response: Response, url: string, body: unknown): ApiError {
  const requestId = response.headers.get('x-request-id') ?? undefined;

  switch (response.status) {
    case 401:
    case 403:
      return new AuthError({ status: response.status, url, requestId, body });
    case 404:
      return new NotFoundError({ url, requestId, body });
    case 409:
      return new ConcurrencyConflictError({
        url,
        requestId,
        body,
        expectedVersion: stringField(body, 'expectedVersion'),
        actualVersion:
          stringField(body, 'actualVersion') ?? response.headers.get('etag') ?? undefined,
      });
    case 400:
    case 422:
      return new ValidationError({
        url,
        status: response.status,
        requestId,
        body,
        errors: problemErrors(body),
      });
    default:
      if (response.status >= 500) {
        return new ServerError({ status: response.status, url, requestId, body });
      }
      return new ApiError(`Request failed with status ${response.status}.`, {
        status: response.status,
        url,
        requestId,
        body,
      });
  }
}

export interface ApiResponse<T> {
  readonly data: T;
  /** `ETag`, when present — feed it back as `ifMatch` on the next write. */
  readonly version: string | undefined;
  readonly status: number;
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

    const token = await this.#config.getToken?.();
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

    const payload = await readBody(response);

    if (!response.ok) throw toError(response, url, payload);

    return {
      data: payload as T,
      version: response.headers.get('etag') ?? undefined,
      status: response.status,
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
