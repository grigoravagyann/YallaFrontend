/**
 * Pre-orders on a booking and "on my way" (2026-10-21).
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import type { ReservationStatusCode } from '../push';
import type { RefusalOptions } from './shared';

/** `pre-order-locked`: pre-orders close two hours before the booking. */
export const PRE_ORDER_LOCKED_CODE = ProblemCodes.PreOrderLocked;
/** `pre-order-already-sent`: a waiter sent it to the kitchen; it no longer changes. */
export const PRE_ORDER_ALREADY_SENT_CODE = ProblemCodes.PreOrderAlreadySent;
/** `pre-orders-not-accepted`: the branch does not take pre-orders (saving only). */
export const PRE_ORDERS_NOT_ACCEPTED_CODE = ProblemCodes.PreOrdersNotAccepted;
/** `pre-order-items-unavailable`: dishes that cannot be pre-ordered, every one named. */
export const PRE_ORDER_ITEMS_UNAVAILABLE_CODE = ProblemCodes.PreOrderItemsUnavailable;
/** `on-my-way-not-open`: the booking is not expecting anybody. */
export const ON_MY_WAY_NOT_OPEN_CODE = ProblemCodes.OnMyWayNotOpen;
/** `pre-order-not-sendable`: the waiter's Send or Not coming outside the booking's window. */
export const PRE_ORDER_NOT_SENDABLE_CODE = ProblemCodes.PreOrderNotSendable;
/** `table-lock-timeout`: the table was busy with another change; retryable (503). */
export const TABLE_LOCK_TIMEOUT_CODE = ProblemCodes.TableLockTimeout;

/**
 * Too late to change the pre-order — `pre-order-locked`, 409. Pre-orders close
 * two hours before the booking (`lockedAtUtc`): "Call the venue to change it."
 */
export class PreOrderLockedError extends ApiError {
  readonly reservationId: string | null;
  /** When it locked, ISO-8601 UTC: the start less two hours. Null when unsaid. */
  readonly lockedAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      lockedAtUtc?: string | null | undefined;
    },
  ) {
    super('Pre-orders close 2 hours before the booking.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PreOrderLockedError';
    this.reservationId = options.reservationId ?? null;
    this.lockedAtUtc = options.lockedAtUtc ?? null;
  }
}

export function isPreOrderLocked(error: unknown): error is PreOrderLockedError {
  return error instanceof PreOrderLockedError;
}

/**
 * A waiter already sent the pre-order to the kitchen — `pre-order-already-sent`,
 * 409: on a guest's save or clear, on a move of the booking (the kitchen has
 * it; cancelling is still possible), and on a waiter's "Not coming".
 */
export class PreOrderAlreadySentError extends ApiError {
  readonly reservationId: string | null;
  readonly sentAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      sentAtUtc?: string | null | undefined;
    },
  ) {
    super('The pre-order was already sent to the kitchen.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PreOrderAlreadySentError';
    this.reservationId = options.reservationId ?? null;
    this.sentAtUtc = options.sentAtUtc ?? null;
  }
}

export function isPreOrderAlreadySent(error: unknown): error is PreOrderAlreadySentError {
  return error instanceof PreOrderAlreadySentError;
}

/**
 * The branch does not take pre-orders (any more) — `pre-orders-not-accepted`,
 * 409, on a save only. Clearing one is always allowed.
 */
export class PreOrdersNotAcceptedError extends ApiError {
  readonly branchId: string | null;

  constructor(options: RefusalOptions & { branchId?: string | null | undefined }) {
    super('This venue does not take pre-orders.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PreOrdersNotAcceptedError';
    this.branchId = options.branchId ?? null;
  }
}

export function isPreOrdersNotAccepted(error: unknown): error is PreOrdersNotAcceptedError {
  return error instanceof PreOrdersNotAcceptedError;
}

/**
 * Why a dish cannot be pre-ordered: `PreOrderItemUnavailableReason`, 1
 * NotOnMenu, 2 SoldOut, 3 NotForPreOrder. `unknown` for a value a newer
 * server adds.
 */
export type PreOrderItemUnavailableReason = 'notOnMenu' | 'soldOut' | 'notForPreOrder' | 'unknown';

export interface UnavailablePreOrderItem {
  readonly menuItemId: string;
  readonly reason: PreOrderItemUnavailableReason;
}

/**
 * Dishes that cannot be pre-ordered — `pre-order-items-unavailable`, 422.
 * Every offender is named and nothing was saved: the editor marks each and
 * asks the guest to remove or swap it ("Khachapuri can't be pre-ordered any
 * more. Remove it to save your changes.").
 */
export class PreOrderItemsUnavailableError extends ApiError {
  readonly items: readonly UnavailablePreOrderItem[];

  constructor(options: RefusalOptions & { items: readonly UnavailablePreOrderItem[] }) {
    super('Some dishes can no longer be pre-ordered.', {
      status: 422,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PreOrderItemsUnavailableError';
    this.items = options.items;
  }
}

export function isPreOrderItemsUnavailable(error: unknown): error is PreOrderItemsUnavailableError {
  return error instanceof PreOrderItemsUnavailableError;
}

/**
 * "Yes, on my way" for a booking that is not expecting anybody — not
 * confirmed or seated, or over — `on-my-way-not-open`, 409.
 */
export class OnMyWayNotOpenError extends ApiError {
  readonly reservationId: string | null;
  /** The booking's status as the server named it; `unknown` when unsaid. */
  readonly bookingStatus: ReservationStatusCode;
  /**
   * When the answer opens: the booking's start − 2 h, ISO-8601 UTC. The wire
   * says it is always present; `null` only when an older server left it out,
   * and the app then waits for the question rather than guessing a time.
   */
  readonly opensAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      bookingStatus?: ReservationStatusCode | undefined;
      opensAtUtc?: string | null | undefined;
    },
  ) {
    super('This booking is not expecting anybody now.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'OnMyWayNotOpenError';
    this.reservationId = options.reservationId ?? null;
    this.bookingStatus = options.bookingStatus ?? 'unknown';
    this.opensAtUtc = options.opensAtUtc ?? null;
  }
}

export function isOnMyWayNotOpen(error: unknown): error is OnMyWayNotOpenError {
  return error instanceof OnMyWayNotOpenError;
}

/**
 * The waiter's Send (or Not coming) outside the booking's window —
 * `pre-order-not-sendable`, 409: the booking is not confirmed or seated, it
 * is earlier than `sendableFromUtc` (the start less two hours), or after
 * `endUtc` (a seated party with no open sitting).
 */
export class PreOrderNotSendableError extends ApiError {
  readonly reservationId: string | null;
  readonly bookingStatus: ReservationStatusCode;
  readonly sendableFromUtc: string | null;
  readonly endUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      bookingStatus?: ReservationStatusCode | undefined;
      sendableFromUtc?: string | null | undefined;
      endUtc?: string | null | undefined;
    },
  ) {
    super('This pre-order cannot be sent now.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PreOrderNotSendableError';
    this.reservationId = options.reservationId ?? null;
    this.bookingStatus = options.bookingStatus ?? 'unknown';
    this.sendableFromUtc = options.sendableFromUtc ?? null;
    this.endUtc = options.endUtc ?? null;
  }
}

export function isPreOrderNotSendable(error: unknown): error is PreOrderNotSendableError {
  return error instanceof PreOrderNotSendableError;
}

/**
 * The table was busy with another change — `table-lock-timeout`, 503. Not a
 * failure of the action: tap again (the same command id is safe).
 */
export class TableBusyError extends ApiError {
  constructor(options: RefusalOptions) {
    super('The table is busy with another change. Try again.', {
      status: 503,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TableBusyError';
  }
}

export function isTableBusy(error: unknown): error is TableBusyError {
  return error instanceof TableBusyError;
}
