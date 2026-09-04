import type { FloorPlanData } from '@yalla/floorplan/types';
import { ApiError } from '../errors';
import type { TableAvailability } from './booking';

/**
 * Someone else took the table in the seconds you were confirming.
 *
 * This is a normal Friday-night outcome, not a crash. Two diners tap the same
 * free two-top a second apart and exactly one wins; the other must be told
 * plainly and handed a refreshed floor to pick from. The refreshed plan travels
 * *with the error* so the UI never has to guess or refetch blind.
 */
export class TableTakenError extends ApiError {
  readonly tableId: string;
  readonly tableLabel: string;
  /** Current floor state, straight from the 409 payload. */
  readonly floor: FloorPlanData;

  constructor(options: {
    url: string;
    tableId: string;
    tableLabel: string;
    floor: FloorPlanData;
    requestId?: string | undefined;
  }) {
    super('That table was taken while you were confirming.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TableTakenError';
    this.tableId = options.tableId;
    this.tableLabel = options.tableLabel;
    this.floor = options.floor;
  }
}

/**
 * The slot became too soon while the diner was deciding.
 *
 * Distinct from a validation error because nothing they typed is wrong — time
 * simply passed. The UI offers a later slot rather than an error.
 */
export class LeadTimeExceededError extends ApiError {
  readonly leadTimeMinutes: number;
  /** Earliest slot still bookable, ISO-8601 UTC. */
  readonly earliestSlotUtc: string;

  constructor(options: {
    url: string;
    leadTimeMinutes: number;
    earliestSlotUtc: string;
    requestId?: string | undefined;
  }) {
    super('That time is now too soon to book.', {
      status: 422,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'LeadTimeExceededError';
    this.leadTimeMinutes = options.leadTimeMinutes;
    this.earliestSlotUtc = options.earliestSlotUtc;
  }
}

/** The six digits did not match. Attempts remaining is shown to the user. */
export class WrongCodeError extends ApiError {
  readonly attemptsRemaining: number;

  constructor(options: { url: string; attemptsRemaining: number }) {
    super('That code is not right.', { status: 400, url: options.url });
    this.name = 'WrongCodeError';
    this.attemptsRemaining = options.attemptsRemaining;
  }
}

/** The challenge aged out. The user needs a fresh code, not another attempt. */
export class ExpiredCodeError extends ApiError {
  constructor(options: { url: string }) {
    super('That code has expired.', { status: 410, url: options.url });
    this.name = 'ExpiredCodeError';
  }
}

/** Too many wrong guesses on one challenge. The challenge is burned. */
export class TooManyAttemptsError extends ApiError {
  constructor(options: { url: string }) {
    super('Too many attempts on this code.', { status: 429, url: options.url });
    this.name = 'TooManyAttemptsError';
  }
}

/** Too many codes requested for one number. Distinct from too many attempts. */
export class RateLimitedError extends ApiError {
  /** When another request will be accepted, ISO-8601 UTC. */
  readonly retryAtUtc: string;

  constructor(options: { url: string; retryAtUtc: string }) {
    super('Too many code requests.', { status: 429, url: options.url });
    this.name = 'RateLimitedError';
    this.retryAtUtc = options.retryAtUtc;
  }
}

export function isTableTaken(error: unknown): error is TableTakenError {
  return error instanceof TableTakenError;
}

/** Availability for one table after a conflict, for re-rendering the sheet. */
export type RefreshedAvailability = readonly TableAvailability[];

// ---------------------------------------------------------------------------
// Scanning in and the shared tab
// ---------------------------------------------------------------------------

/**
 * The code scanned fine but names a table the venue has taken out of service.
 *
 * Distinct from an unrecognised code because the diner did nothing wrong and
 * the fix is different: move to another table, not try scanning again.
 */
export class TableOutOfServiceError extends ApiError {
  readonly tableLabel: string;

  constructor(options: { url: string; tableLabel: string }) {
    super('That table is out of service.', { status: 409, url: options.url });
    this.name = 'TableOutOfServiceError';
    this.tableLabel = options.tableLabel;
  }
}

/**
 * Nothing on the backend matches what was scanned or typed.
 *
 * Usually a sticker from another product, a code from a venue that has left, or
 * a typo in the manual fallback. Never phrased as "invalid" to the diner: the
 * code on their table is not their responsibility.
 */
export class UnknownTableCodeError extends ApiError {
  constructor(options: { url: string }) {
    super('That code does not match a table.', { status: 404, url: options.url });
    this.name = 'UnknownTableCodeError';
  }
}

/**
 * The tab on that table has already been closed and paid.
 *
 * Its own outcome rather than a generic conflict, because the next step is
 * concrete: ask a waiter to open a new one, or scan again once they have.
 */
export class TabClosedError extends ApiError {
  readonly tabId: string;

  constructor(options: { url: string; tabId: string }) {
    super('That tab has been closed.', { status: 409, url: options.url });
    this.name = 'TabClosedError';
    this.tabId = options.tabId;
  }
}

/** The action needs the host, and the caller is not it. */
export class NotTabHostError extends ApiError {
  constructor(options: { url: string }) {
    super('Only the host can do that.', { status: 403, url: options.url });
    this.name = 'NotTabHostError';
  }
}

/**
 * The endpoint for this action does not exist on the backend yet.
 *
 * A real, thrown, typed error rather than a silent no-op or a fake success.
 * Screens catch it and say plainly that the feature is not live — the one thing
 * they must never do is show a confirmation for something that never happened.
 *
 * Every use of this is a TODO with an owner. Grep for the class name to find
 * what is still unwired.
 */
export class EndpointNotWiredError extends ApiError {
  readonly endpoint: string;

  constructor(options: { url: string; endpoint: string }) {
    super(`No backend endpoint yet for ${options.endpoint}.`, {
      status: 501,
      url: options.url,
    });
    this.name = 'EndpointNotWiredError';
    this.endpoint = options.endpoint;
  }
}

export function isEndpointNotWired(error: unknown): error is EndpointNotWiredError {
  return error instanceof EndpointNotWiredError;
}
