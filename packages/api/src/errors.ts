/** Base for everything this client throws, so callers can catch one type. */
export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(
    message: string,
    options: { status: number; url: string; requestId?: string | undefined; body?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.url = options.url;
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

/**
 * A 409 from the backend's row-version check.
 *
 * This is the single most important error in the product and the reason it has
 * its own class. The backend guards table state with row versions, so "someone
 * just took that table" is a normal Friday-night outcome, not a crash: two
 * diners tap the same free two-top a second apart and exactly one wins.
 *
 * Every mutation that touches table or booking state can raise this, and the UI
 * is expected to handle it by refetching and telling the user what happened —
 * never by showing a generic error.
 */
export class ConcurrencyConflictError extends ApiError {
  /** Row version the client held, when the backend reports it. */
  readonly expectedVersion: string | undefined;
  /** Row version the backend actually has. */
  readonly actualVersion: string | undefined;

  constructor(options: {
    url: string;
    requestId?: string | undefined;
    body?: unknown;
    expectedVersion?: string | undefined;
    actualVersion?: string | undefined;
  }) {
    super('The record changed before this request was applied.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
      body: options.body,
    });
    this.name = 'ConcurrencyConflictError';
    this.expectedVersion = options.expectedVersion;
    this.actualVersion = options.actualVersion;
  }
}

/** 401/403. The app should send the user back to sign-in or show a permission notice. */
export class AuthError extends ApiError {
  constructor(options: {
    status: number;
    url: string;
    requestId?: string | undefined;
    body?: unknown;
  }) {
    super(options.status === 401 ? 'Not signed in.' : 'Not allowed.', options);
    this.name = 'AuthError';
  }
}

/** 400/422 with a problem-details payload. */
export class ValidationError extends ApiError {
  /** Field name to messages, as ASP.NET Core's ProblemDetails reports them. */
  readonly errors: Readonly<Record<string, readonly string[]>>;

  constructor(options: {
    url: string;
    status: number;
    requestId?: string | undefined;
    body?: unknown;
    errors?: Readonly<Record<string, readonly string[]>> | undefined;
  }) {
    super('The request was rejected as invalid.', options);
    this.name = 'ValidationError';
    this.errors = options.errors ?? {};
  }
}

export class NotFoundError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined; body?: unknown }) {
    super('Not found.', { ...options, status: 404 });
    this.name = 'NotFoundError';
  }
}

/** 5xx. Safe to retry. */
export class ServerError extends ApiError {
  constructor(options: {
    status: number;
    url: string;
    requestId?: string | undefined;
    body?: unknown;
  }) {
    super('The server failed to handle the request.', options);
    this.name = 'ServerError';
  }
}

/**
 * The request never reached the server: no signal in a basement, DNS failure,
 * TLS error. Distinct from a 5xx because the mutation definitely did not apply,
 * which is what the staff app's offline queue needs to know.
 */
export class NetworkError extends ApiError {
  constructor(options: { url: string; cause?: unknown }) {
    super('Could not reach the server.', { status: 0, url: options.url });
    this.name = 'NetworkError';
    this.cause = options.cause;
  }
}

export class TimeoutError extends ApiError {
  constructor(options: { url: string; timeoutMs: number }) {
    super(`The request timed out after ${options.timeoutMs}ms.`, { status: 0, url: options.url });
    this.name = 'TimeoutError';
  }
}

/** True for errors where retrying the same request could plausibly succeed. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError || error instanceof TimeoutError) return true;
  if (error instanceof ServerError) return true;
  // A conflict will not resolve by retrying the same stale version.
  return false;
}

export function isConcurrencyConflict(error: unknown): error is ConcurrencyConflictError {
  return error instanceof ConcurrencyConflictError;
}
