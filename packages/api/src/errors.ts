import type { ProblemDetails } from './problem';

interface ErrorOptions {
  readonly status: number;
  readonly url: string;
  readonly requestId?: string | undefined;
  readonly body?: unknown;
  readonly problem?: ProblemDetails | undefined;
}

/**
 * Base for everything this client throws, so callers can catch one type.
 *
 * `problem` is the backend's RFC 7807 document when it sent one, and `code` is
 * its stable slug — the thing to branch on, never the message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly requestId: string | undefined;
  readonly body: unknown;
  readonly problem: ProblemDetails | undefined;

  constructor(message: string, options: ErrorOptions) {
    super(options.problem?.detail || message);
    this.name = 'ApiError';
    this.status = options.status;
    this.url = options.url;
    this.requestId = options.requestId ?? options.problem?.traceId;
    this.body = options.body;
    this.problem = options.problem;
  }

  /** The backend's kebab-case code, e.g. `table-state-conflict`. */
  get code(): string | undefined {
    return this.problem?.code;
  }
}

/**
 * A 409: the thing you were changing changed under you.
 *
 * This is the single most important error in the product and the reason it has
 * its own class. Someone took the table while you were confirming, or a table's
 * state moved before your action landed — a normal Friday-night outcome, not a
 * crash. The server's view of the current state travels in `currentState`
 * (the problem document's `context`) so the UI can refresh and show what
 * changed. Never a crash screen, never a silent retry.
 */
export class ConcurrencyConflictError extends ApiError {
  /** The backend's account of the current state, straight from the 409 payload. */
  readonly currentState: Readonly<Record<string, unknown>> | null;
  /** Row version the client held, when the backend reports it. */
  readonly expectedVersion: string | undefined;
  /** Row version the backend actually has. */
  readonly actualVersion: string | undefined;

  constructor(options: {
    url: string;
    requestId?: string | undefined;
    body?: unknown;
    problem?: ProblemDetails | undefined;
    expectedVersion?: string | undefined;
    actualVersion?: string | undefined;
  }) {
    super('The record changed before this request was applied.', { ...options, status: 409 });
    this.name = 'ConcurrencyConflictError';
    this.currentState = options.problem?.context ?? null;
    this.expectedVersion = options.expectedVersion;
    this.actualVersion = options.actualVersion;
  }
}

/** 401 or 403. Prefer the two subclasses; this stays for `catch (e instanceof AuthError)`. */
export class AuthError extends ApiError {
  constructor(options: ErrorOptions) {
    super(options.status === 401 ? 'Not signed in.' : 'Not allowed.', options);
    this.name = 'AuthError';
  }
}

/**
 * 401. The client has already tried to refresh by the time a screen sees this,
 * so it means "signed out": route to sign-in, preserving where the user was.
 */
export class UnauthorizedError extends AuthError {
  constructor(options: Omit<ErrorOptions, 'status'>) {
    super({ ...options, status: 401 });
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403. A real permission failure. Do not retry, do not refresh — the token is
 * fine, it just does not cover this. Show the access-denied state.
 */
export class ForbiddenError extends AuthError {
  constructor(options: Omit<ErrorOptions, 'status'>) {
    super({ ...options, status: 403 });
    this.name = 'ForbiddenError';
  }
}

/**
 * 422: the request was well-formed but the transition is not allowed from the
 * current state — freeing a table that is not occupied, seating a party on a
 * held table. `reason` is the backend's specific explanation and is what the
 * UI shows; the code is what it branches on.
 */
export class InvalidTransitionError extends ApiError {
  readonly reason: string;

  constructor(options: Omit<ErrorOptions, 'status'>) {
    super('That change is not allowed from the current state.', { ...options, status: 422 });
    this.name = 'InvalidTransitionError';
    this.reason = options.problem?.detail ?? this.message;
  }
}

/** 400 with a problem-details payload. */
export class ValidationError extends ApiError {
  /** Field name to messages, as the backend reports them. */
  readonly errors: Readonly<Record<string, readonly string[]>>;

  constructor(options: ErrorOptions) {
    super('The request was rejected as invalid.', options);
    this.name = 'ValidationError';
    this.errors = options.problem?.errors ?? {};
  }
}

export class NotFoundError extends ApiError {
  constructor(options: Omit<ErrorOptions, 'status'>) {
    super('Not found.', { ...options, status: 404 });
    this.name = 'NotFoundError';
  }
}

/** 429. The backend's fixed-window limiter said wait. */
export class TooManyRequestsError extends ApiError {
  constructor(options: Omit<ErrorOptions, 'status'>) {
    super('Too many requests. Wait a moment.', { ...options, status: 429 });
    this.name = 'TooManyRequestsError';
  }
}

/** 5xx. Safe to retry a read; never a write. */
export class ServerError extends ApiError {
  constructor(options: ErrorOptions) {
    super('The server failed to handle the request.', options);
    this.name = 'ServerError';
  }
}

/**
 * The request never reached the server: no signal in a basement, DNS failure,
 * TLS error, the laptop's wifi switched off. Distinct from a 5xx because the
 * mutation definitely did not apply, which is what the staff app's offline
 * queue needs to know — and because the screen must say "offline", not "bug".
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

/** The request never reached the server. The screen shows an offline state. */
export function isOffline(error: unknown): boolean {
  return error instanceof NetworkError || error instanceof TimeoutError;
}

/**
 * The four-plus-one states every screen renders explicitly.
 *
 * `unavailable` is the honest fifth: the backend does not have this endpoint
 * yet. It is kept apart from `error` because the fix is on a different team.
 */
export type FailureKind =
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'invalid'
  | 'unavailable'
  | 'error';

export function describeFailure(error: unknown): FailureKind {
  if (isOffline(error)) return 'offline';
  if (error instanceof UnauthorizedError) return 'unauthorized';
  if (error instanceof ForbiddenError) return 'forbidden';
  if (error instanceof ConcurrencyConflictError) return 'conflict';
  if (error instanceof InvalidTransitionError || error instanceof ValidationError) return 'invalid';
  if (error instanceof NotFoundError) return 'notFound';
  if (error instanceof ApiError && error.status === 501) return 'unavailable';
  return 'error';
}
