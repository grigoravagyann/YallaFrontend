/**
 * Refusals of making, changing and keeping a booking: a taken table, a rule, a
 * busy table, the diner's own overlapping sitting, the hold extension.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import type { ProblemDetails } from '../../problem';
import type { TableAvailability, TableUnavailableReason } from '../booking';
import type { FloorPlanData } from '../tableFloor';
import type { BookingRefusal, RefusalOptions } from './shared';

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
  /**
   * Which of the two it was, because the next step differs.
   *
   * `occupied` — somebody sat down there, and the table may free up early.
   * `alreadyBooked` — the slot collides with somebody else's booking. The
   * server answers them with different codes (`table-currently-occupied`,
   * `table-already-booked`), so this is read, not guessed.
   */
  readonly reason: 'occupied' | 'alreadyBooked';
  /**
   * The room as the server saw it when it refused, from the 409's
   * `context.availability`. `null` when the refusal carried none — the caller
   * refetches instead of drawing a room it does not have.
   */
  readonly floor: FloorPlanData | null;

  constructor(options: {
    url: string;
    tableId: string;
    tableLabel: string;
    reason?: 'occupied' | 'alreadyBooked' | undefined;
    floor: FloorPlanData | null;
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
    this.reason = options.reason ?? 'alreadyBooked';
    this.floor = options.floor;
  }
}

/**
 * A reservation rule refused the booking: the branch is shut then, the party
 * is too big for the table, the slot is beyond the booking window.
 *
 * `reason` is the table sheet's own vocabulary, so the confirm screen says the
 * same sentence the sheet would have said about that table.
 */
export class BookingRejectedError extends ApiError {
  readonly reason: TableUnavailableReason;
  readonly partySize: number;

  constructor(options: {
    url: string;
    reason: TableUnavailableReason;
    partySize: number;
    requestId?: string | undefined;
  }) {
    super('That booking is not allowed.', {
      status: 422,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingRejectedError';
    this.reason = options.reason;
    this.partySize = options.partySize;
  }
}

/**
 * The table was locked by another booking in flight and the server gave up
 * waiting — `reservation-lock-timeout`, 503, retryable.
 *
 * Nothing was booked, and tapping again with the **same** command id is exactly
 * right: it is the one refusal a retry is meant for.
 */
export class BookingBusyError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That table is busy with another booking. Try again.', {
      status: 503,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingBusyError';
  }
}

/**
 * The idempotency key was already spent by somebody else —
 * `client-command-id-in-use`. Not a replay, so nothing about their booking
 * comes back; this attempt has to start again with a fresh id.
 */
export class BookingCommandInUseError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That booking attempt was already used.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingCommandInUseError';
  }
}

/** The venue is not taking bookings or tabs right now — `branch-unavailable`. */
export class BranchUnavailableError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('This venue is not taking bookings right now.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BranchUnavailableError';
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

/**
 * A booking follows on that table, and the diner did not (or no longer
 * correctly) say they would free it in time — a 422
 * `reservation-free-by-required` naming `acceptsFreeByUtc`, with the instant
 * the server needs in `context.requiredFreeByUtc` and the next booking's start
 * in `context.nextBookingStartUtc`.
 *
 * Not a failure of anything typed: another booking landed after the room was
 * read, or the time it needs moved. The screen asks again — "Will you free the
 * table by 21:25?" — with the server's time, and a yes sends the same command
 * id with it.
 */
export class FreeByRequiredError extends ApiError {
  /** What to agree to, from the server. `null` when the refusal did not say. */
  readonly requiredFreeByUtc: string | null;
  /** The booking that follows on the table, which makes the time make sense. */
  readonly nextBookingStartUtc: string | null;

  constructor(options: {
    url: string;
    requiredFreeByUtc: string | null;
    nextBookingStartUtc?: string | null | undefined;
    requestId?: string | undefined;
  }) {
    super('A booking follows on that table: the time to free it by has to be agreed.', {
      status: 422,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'FreeByRequiredError';
    this.requiredFreeByUtc = options.requiredFreeByUtc;
    this.nextBookingStartUtc = options.nextBookingStartUtc ?? null;
  }
}

export function isFreeByRequired(error: unknown): error is FreeByRequiredError {
  return error instanceof FreeByRequiredError;
}

/**
 * A table request that can no longer be answered — it lapsed, the later guest
 * gave up, or it was already answered on another device. 409 or 404 from the
 * answer route. The booking is read again and says where it stands.
 */
export class TableRequestClosedError extends ApiError {
  readonly tableRequestId: string;

  constructor(options: { url: string; requestId: string; status?: number | undefined }) {
    super('That request can no longer be answered.', {
      status: options.status ?? 409,
      url: options.url,
    });
    this.name = 'TableRequestClosedError';
    this.tableRequestId = options.requestId;
  }
}

/** The server's code for a sitting that overlaps one of the diner's own. */
export const BOOKING_OVERLAPS_OWN_CODE = ProblemCodes.ReservationOverlapsOwn;

/**
 * The diner already has a booking whose sitting overlaps the one asked for —
 * 409 `reservation-overlaps-own`, on a new booking or a change by a signed-in
 * diner. At the same branch sittings that only touch are fine; at another
 * venue or branch the two need half an hour between them (2026-10-20), so the
 * refusal names the venue too. Not a taken table and not a rule: the answer is "you
 * already have one at 19:30 (table 2)", so the booking already held is carried.
 * The one being changed is never counted against itself, and staff-made
 * bookings are never refused this way.
 */
export class BookingOverlapsOwnError extends ApiError {
  /** The booking already held. `null` when the refusal did not say. */
  readonly existingReservationId: string | null;
  /** Its short code, as quoted at the door. */
  readonly existingCode: string | null;
  /**
   * Its day on the branch's calendar, `YYYY-MM-DD`, or `null`. A sitting can
   * overlap one from the evening before (23:30 and 00:15), so a screen says the
   * day when it is not the one being booked.
   */
  readonly localDate: string | null;
  /** "19:30" on the branch's clock, or `null`. */
  readonly localStartTime: string | null;
  readonly tableLabel: string | null;
  /** The venue and branch of the booking already held; `null` from an older server. */
  readonly venueName: string | null;
  readonly branchName: string | null;

  constructor(options: {
    url: string;
    existingReservationId: string | null;
    existingCode?: string | null | undefined;
    localDate?: string | null | undefined;
    localStartTime: string | null;
    tableLabel: string | null;
    venueName?: string | null | undefined;
    branchName?: string | null | undefined;
    requestId?: string | undefined;
    problem?: ProblemDetails | undefined;
  }) {
    super('You already have a booking at this place at that time.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
      problem: options.problem,
    });
    this.name = 'BookingOverlapsOwnError';
    this.existingReservationId = options.existingReservationId;
    this.existingCode = options.existingCode ?? null;
    this.localDate = options.localDate ?? null;
    this.localStartTime = options.localStartTime;
    this.tableLabel = options.tableLabel;
    this.venueName = options.venueName ?? null;
    this.branchName = options.branchName ?? null;
  }
}

export function isBookingOverlapsOwn(error: unknown): error is BookingOverlapsOwnError {
  return error instanceof BookingOverlapsOwnError;
}

export function isTableTaken(error: unknown): error is TableTakenError {
  return error instanceof TableTakenError;
}

/** Availability for one table after a conflict, for re-rendering the sheet. */
export type RefreshedAvailability = readonly TableAvailability[];

/**
 * The booking can no longer be changed — `reservation-not-changeable`, 409.
 *
 * Only a booking still waiting for the venue, or confirmed and not yet started,
 * can move. Cancelled, seated, finished or missed ones cannot, and neither can
 * one whose start has passed. The screen goes back to the booking, which will
 * say which of those it is.
 */
export class BookingNotChangeableError extends ApiError {
  readonly reservationId: string | null;

  constructor(options: BookingRefusal) {
    super('That booking can no longer be changed.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingNotChangeableError';
    this.reservationId = options.reservationId ?? null;
  }
}

/**
 * A no-show before the booking's start — `reservation-not-started`, 409.
 *
 * Nobody can have failed to come to a booking that has not begun. The server
 * accepts a no-show from `startUtc` on, with no grace on top; before that the
 * booking and the table's hold are left as they were. Releasing it as "they
 * let us know" (outcome 2) and releasing the table's hold are still allowed.
 */
export class ReservationNotStartedError extends ApiError {
  readonly reservationId: string | null;
  /** From this instant on a no-show is accepted. Null when the server did not say. */
  readonly startUtc: string | null;

  constructor(options: BookingRefusal) {
    super('That booking has not started yet.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ReservationNotStartedError';
    this.reservationId = options.reservationId ?? null;
    this.startUtc = options.startUtc ?? null;
  }
}

/** The 409 for a no-show before the start, as its own error; anything else unchanged. */
export function asNotStarted(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.code !== ProblemCodes.ReservationNotStarted)
    return error;
  const context = error.problem?.context as
    { reservationId?: unknown; startUtc?: unknown } | undefined;
  return new ReservationNotStartedError({
    url: error.url,
    requestId: error.requestId,
    reservationId: typeof context?.reservationId === 'string' ? context.reservationId : undefined,
    startUtc: typeof context?.startUtc === 'string' ? context.startUtc : undefined,
  });
}

/**
 * The one hold extension is already spent — `hold-already-extended`.
 *
 * Read from the server's code. It used to be inferred from any 409 on the
 * endpoint, which told a diner at a branch that offers no extensions at all
 * that they had "already let them know".
 */
export class HoldAlreadyExtendedError extends ApiError {
  readonly reservationId: string;
  /** What the server actually said, kept for logs rather than for the screen. */
  readonly serverDetail: string | null;

  constructor(options: {
    url: string;
    reservationId: string;
    serverDetail?: string | null | undefined;
    requestId?: string | undefined;
  }) {
    super('This booking has already had its one extension.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'HoldAlreadyExtendedError';
    this.reservationId = options.reservationId;
    this.serverDetail = options.serverDetail ?? null;
  }
}

export function isHoldAlreadyExtended(error: unknown): error is HoldAlreadyExtendedError {
  return error instanceof HoldAlreadyExtendedError;
}

/**
 * "Keep my table" before there is a held table to keep — `hold-not-active`.
 *
 * The booking has not started, or is not a confirmed one. Nothing was spent.
 */
export class HoldNotActiveError extends ApiError {
  readonly reservationId: string;

  constructor(options: { url: string; reservationId: string; requestId?: string | undefined }) {
    super('There is no held table to keep yet.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'HoldNotActiveError';
    this.reservationId = options.reservationId;
  }
}

/** The branch does not hold tables past the start at all — `extensions-not-offered`. */
export class ExtensionsNotOfferedError extends ApiError {
  readonly reservationId: string;

  constructor(options: { url: string; reservationId: string; requestId?: string | undefined }) {
    super('This venue does not hold tables for late arrivals.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ExtensionsNotOfferedError';
    this.reservationId = options.reservationId;
  }
}

/**
 * The branch is not taking bookings from the app — `bookings-not-accepted`,
 * 409 (K9).
 *
 * Its online-bookings switch is off, or nobody has reviewed its reservation
 * policy yet. Not the diner's doing, and not worth a retry.
 */
export class BookingsNotAcceptedError extends ApiError {
  readonly branchId: string | null;

  constructor(options: RefusalOptions & { branchId?: string | null | undefined }) {
    super('This venue is not taking bookings in the app.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingsNotAcceptedError';
    this.branchId = options.branchId ?? null;
  }
}

/**
 * A change from the manage link that the booking's own account cannot take —
 * `phone-not-verified`, 403, on `POST /api/public/bookings/{token}/reschedule`
 * (public page phase 5).
 *
 * The account the booking belongs to was deactivated or deleted, or never
 * proved its number. The visitor holding the link cannot fix that — there is
 * no session to verify — so this is not {@link PhoneNotVerifiedError}, which
 * sends a screen to the code flow. The way on is to call the venue, or to
 * cancel (which still works) and book again.
 */
export class BookingLinkAccountUnavailableError extends ApiError {
  constructor(options: RefusalOptions) {
    super('This booking can no longer be changed online.', { status: 403, ...options });
    this.name = 'BookingLinkAccountUnavailableError';
  }
}
