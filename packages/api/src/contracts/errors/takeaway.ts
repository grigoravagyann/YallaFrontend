/**
 * Takeaway (2026-10-22).
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import type { TakeawayStatus } from '../takeaway';
import type { RefusalOptions } from './shared';

/** `takeaway-not-accepted`: the branch does not take takeaway. */
export const TAKEAWAY_NOT_ACCEPTED_CODE = ProblemCodes.TakeawayNotAccepted;
/** `takeaway-closed`: shut now, or past the last order. */
export const TAKEAWAY_CLOSED_CODE = ProblemCodes.TakeawayClosed;
/** `takeaway-busy`: ASAP while the kitchen has as many orders as the venue allows. */
export const TAKEAWAY_BUSY_CODE = ProblemCodes.TakeawayBusy;
/** `takeaway-slot-unavailable`: the pickup time asked for is not on offer. */
export const TAKEAWAY_SLOT_UNAVAILABLE_CODE = ProblemCodes.TakeawaySlotUnavailable;
/** `takeaway-items-unavailable`: dishes that cannot be ordered to take away, every one named. */
export const TAKEAWAY_ITEMS_UNAVAILABLE_CODE = ProblemCodes.TakeawayItemsUnavailable;
/** `takeaway-status-conflict`: a move the order is not in the state for. */
export const TAKEAWAY_STATUS_CONFLICT_CODE = ProblemCodes.TakeawayStatusConflict;
/** `takeaway-no-show-too-early`: "no-show" less than thirty minutes after ready. */
export const TAKEAWAY_NO_SHOW_TOO_EARLY_CODE = ProblemCodes.TakeawayNoShowTooEarly;

/** The branch does not take takeaway (any more) — `takeaway-not-accepted`, 409. */
export class TakeawayNotAcceptedError extends ApiError {
  readonly branchId: string | null;

  constructor(options: RefusalOptions & { branchId?: string | null | undefined }) {
    super('This venue does not take takeaway orders.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawayNotAcceptedError';
    this.branchId = options.branchId ?? null;
  }
}

export function isTakeawayNotAccepted(error: unknown): error is TakeawayNotAcceptedError {
  return error instanceof TakeawayNotAcceptedError;
}

/**
 * Shut now, or past the last order — `takeaway-closed`, 409: "Takeaway from
 * opening, 10:00" when it opens again within a week.
 */
export class TakeawayClosedError extends ApiError {
  readonly branchId: string | null;
  readonly opensAtUtc: string | null;
  /** "10:00" on its day, on the branch's clock. */
  readonly opensAt: string | null;

  constructor(
    options: RefusalOptions & {
      branchId?: string | null | undefined;
      opensAtUtc?: string | null | undefined;
      opensAt?: string | null | undefined;
    },
  ) {
    super('Takeaway orders are closed now.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawayClosedError';
    this.branchId = options.branchId ?? null;
    this.opensAtUtc = options.opensAtUtc ?? null;
    this.opensAt = options.opensAt ?? null;
  }
}

export function isTakeawayClosed(error: unknown): error is TakeawayClosedError {
  return error instanceof TakeawayClosedError;
}

/**
 * "As soon as possible" while the kitchen is full — `takeaway-busy`, 409. A
 * slot may still be offered: read the availability again.
 */
export class TakeawayBusyError extends ApiError {
  readonly branchId: string | null;
  readonly maxInProgress: number | null;

  constructor(
    options: RefusalOptions & {
      branchId?: string | null | undefined;
      maxInProgress?: number | null | undefined;
    },
  ) {
    super('The kitchen is busy. Choose a later time.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawayBusyError';
    this.branchId = options.branchId ?? null;
    this.maxInProgress = options.maxInProgress ?? null;
  }
}

export function isTakeawayBusy(error: unknown): error is TakeawayBusyError {
  return error instanceof TakeawayBusyError;
}

/**
 * The pickup time asked for is not on offer (any more) —
 * `takeaway-slot-unavailable`, 409, with the slots on offer now.
 */
export class TakeawaySlotUnavailableError extends ApiError {
  readonly branchId: string | null;
  /** The "HH:mm" asked for. */
  readonly at: string | null;
  /** The "HH:mm" slots on offer now. */
  readonly slots: readonly string[];

  constructor(
    options: RefusalOptions & {
      branchId?: string | null | undefined;
      at?: string | null | undefined;
      slots?: readonly string[] | undefined;
    },
  ) {
    super('That pickup time is no longer available.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawaySlotUnavailableError';
    this.branchId = options.branchId ?? null;
    this.at = options.at ?? null;
    this.slots = options.slots ?? [];
  }
}

export function isTakeawaySlotUnavailable(error: unknown): error is TakeawaySlotUnavailableError {
  return error instanceof TakeawaySlotUnavailableError;
}

/**
 * Why a dish cannot be ordered to take away: 1 NotOnMenu, 2 SoldOut,
 * 3 NotForTakeaway ("only in the hall"). `unknown` for a value a newer server adds.
 */
export type TakeawayItemUnavailableReason = 'notOnMenu' | 'soldOut' | 'notForTakeaway' | 'unknown';

export interface UnavailableTakeawayItem {
  readonly menuItemId: string;
  readonly reason: TakeawayItemUnavailableReason;
}

/**
 * Dishes that cannot be ordered to take away — `takeaway-items-unavailable`,
 * 422. Every offender is named and nothing was saved: mark each in the cart.
 */
export class TakeawayItemsUnavailableError extends ApiError {
  readonly items: readonly UnavailableTakeawayItem[];

  constructor(options: RefusalOptions & { items: readonly UnavailableTakeawayItem[] }) {
    super('Some dishes cannot be ordered to take away.', {
      status: 422,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawayItemsUnavailableError';
    this.items = options.items;
  }
}

export function isTakeawayItemsUnavailable(error: unknown): error is TakeawayItemsUnavailableError {
  return error instanceof TakeawayItemsUnavailableError;
}

/**
 * A move the order is not in the state for — cancel after the venue answered,
 * accept a cancelled order — `takeaway-status-conflict`, 409. `orderStatus`
 * is where the order is now: redraw it.
 */
export class TakeawayStatusConflictError extends ApiError {
  readonly orderId: string | null;
  readonly orderStatus: TakeawayStatus;

  constructor(
    options: RefusalOptions & {
      orderId?: string | null | undefined;
      orderStatus?: TakeawayStatus | undefined;
    },
  ) {
    super('The order has moved on.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawayStatusConflictError';
    this.orderId = options.orderId ?? null;
    this.orderStatus = options.orderStatus ?? 'unknown';
  }
}

export function isTakeawayStatusConflict(error: unknown): error is TakeawayStatusConflictError {
  return error instanceof TakeawayStatusConflictError;
}

/**
 * "No-show" less than thirty minutes after ready —
 * `takeaway-no-show-too-early`, 409. `noShowFromUtc` is when it may.
 */
export class TakeawayNoShowTooEarlyError extends ApiError {
  readonly orderId: string | null;
  readonly noShowFromUtc: string | null;

  constructor(
    options: RefusalOptions & {
      orderId?: string | null | undefined;
      noShowFromUtc?: string | null | undefined;
    },
  ) {
    super('It is too early to mark this order not collected.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TakeawayNoShowTooEarlyError';
    this.orderId = options.orderId ?? null;
    this.noShowFromUtc = options.noShowFromUtc ?? null;
  }
}

export function isTakeawayNoShowTooEarly(error: unknown): error is TakeawayNoShowTooEarlyError {
  return error instanceof TakeawayNoShowTooEarlyError;
}
