/**
 * "Ask: are you coming?" (2026-10-22).
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import type { ReservationStatusCode } from '../push';
import type { RefusalOptions } from './shared';

/** `ask-on-my-way-too-early`: more than two hours before the start. */
export const ASK_ON_MY_WAY_TOO_EARLY_CODE = ProblemCodes.AskOnMyWayTooEarly;
/** `ask-on-my-way-not-open`: the booking is not confirmed, or it started. */
export const ASK_ON_MY_WAY_NOT_OPEN_CODE = ProblemCodes.AskOnMyWayNotOpen;
/** `guest-already-answered`: the guest said on my way or running late. */
export const GUEST_ALREADY_ANSWERED_CODE = ProblemCodes.GuestAlreadyAnswered;
/** `ask-on-my-way-asked-recently`: asked within the last fifteen minutes. */
export const ASK_ON_MY_WAY_ASKED_RECENTLY_CODE = ProblemCodes.AskOnMyWayAskedRecently;

/**
 * The venue's "Ask: are you coming?" more than two hours before the start —
 * `ask-on-my-way-too-early`, 409. `opensAtUtc` is when it may.
 */
export class AskOnMyWayTooEarlyError extends ApiError {
  readonly reservationId: string | null;
  readonly opensAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      opensAtUtc?: string | null | undefined;
    },
  ) {
    super('It is too early to ask whether the guest is coming.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'AskOnMyWayTooEarlyError';
    this.reservationId = options.reservationId ?? null;
    this.opensAtUtc = options.opensAtUtc ?? null;
  }
}

export function isAskOnMyWayTooEarly(error: unknown): error is AskOnMyWayTooEarlyError {
  return error instanceof AskOnMyWayTooEarlyError;
}

/**
 * The ask for a booking that is not confirmed, or has started —
 * `ask-on-my-way-not-open`, 409. Read the booking again.
 */
export class AskOnMyWayNotOpenError extends ApiError {
  readonly reservationId: string | null;
  readonly bookingStatus: ReservationStatusCode;
  readonly startUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      bookingStatus?: ReservationStatusCode | undefined;
      startUtc?: string | null | undefined;
    },
  ) {
    super('This booking cannot be asked now.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'AskOnMyWayNotOpenError';
    this.reservationId = options.reservationId ?? null;
    this.bookingStatus = options.bookingStatus ?? 'unknown';
    this.startUtc = options.startUtc ?? null;
  }
}

export function isAskOnMyWayNotOpen(error: unknown): error is AskOnMyWayNotOpenError {
  return error instanceof AskOnMyWayNotOpenError;
}

/**
 * The guest has answered already — on my way, or running late
 * (`runningLateMinutes` then) — `guest-already-answered`, 409. No call needed.
 */
export class GuestAlreadyAnsweredError extends ApiError {
  readonly reservationId: string | null;
  readonly answeredAtUtc: string | null;
  /** 10, 15 or 30 when the answer was "running late"; `null` for on my way. */
  readonly runningLateMinutes: number | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      answeredAtUtc?: string | null | undefined;
      runningLateMinutes?: number | null | undefined;
    },
  ) {
    super('The guest has already answered.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'GuestAlreadyAnsweredError';
    this.reservationId = options.reservationId ?? null;
    this.answeredAtUtc = options.answeredAtUtc ?? null;
    this.runningLateMinutes = options.runningLateMinutes ?? null;
  }
}

export function isGuestAlreadyAnswered(error: unknown): error is GuestAlreadyAnsweredError {
  return error instanceof GuestAlreadyAnsweredError;
}

/**
 * Asked within the last fifteen minutes — `ask-on-my-way-asked-recently`, 409.
 * `nextAllowedAtUtc` is when the button comes back.
 */
export class AskOnMyWayAskedRecentlyError extends ApiError {
  readonly reservationId: string | null;
  readonly askedAtUtc: string | null;
  readonly nextAllowedAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      askedAtUtc?: string | null | undefined;
      nextAllowedAtUtc?: string | null | undefined;
    },
  ) {
    super('The guest was asked a moment ago.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'AskOnMyWayAskedRecentlyError';
    this.reservationId = options.reservationId ?? null;
    this.askedAtUtc = options.askedAtUtc ?? null;
    this.nextAllowedAtUtc = options.nextAllowedAtUtc ?? null;
  }
}

export function isAskOnMyWayAskedRecently(error: unknown): error is AskOnMyWayAskedRecentlyError {
  return error instanceof AskOnMyWayAskedRecentlyError;
}
