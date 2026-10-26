/**
 * Number rules and tab admission (2026-10-20; the guest record, the same day).
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { PROBLEM_CODE_STATUS, ProblemCodes } from '../../generated/problemCodes';
import type { TabAdmissionStatus } from '../admission';
import type { RefusalOptions } from './shared';

/** `phone-has-active-booking`: a proved number holds at most three active bookings. */
export const PHONE_HAS_ACTIVE_BOOKING_CODE = ProblemCodes.PhoneHasActiveBooking;
/** `booking-blocked-no-shows`: three no-shows in three days block booking for a week. */
export const BOOKING_BLOCKED_NO_SHOWS_CODE = ProblemCodes.BookingBlockedNoShows;
/** `reservation-cancelled-by-block`: the booking was cancelled by its guest's no-show block. */
export const RESERVATION_CANCELLED_BY_BLOCK_CODE = ProblemCodes.ReservationCancelledByBlock;
/** `no-show-undo-window-closed`: a no-show may be undone until 05:00 the next morning. */
export const NO_SHOW_UNDO_WINDOW_CLOSED_CODE = ProblemCodes.NoShowUndoWindowClosed;
/** `tab-awaiting-admission`: nothing is ordered on a tab a waiter has not let in. */
export const TAB_AWAITING_ADMISSION_CODE = ProblemCodes.TabAwaitingAdmission;
/** `tab-admission-decided`: admitting a rejected tab, or rejecting an admitted one. */
export const TAB_ADMISSION_DECIDED_CODE = ProblemCodes.TabAdmissionDecided;

/**
 * One of the caller's own bookings, named by a refusal — only ever to the
 * account that holds it. "The next is Café Aram on 22 October at 19:30."
 *
 * Stricter than the catalogue on purpose: in `PhoneHasActiveBookingProblemContext`
 * every member but `maxActiveBookings` is optional, because the server names no
 * booking when the ones in the way are another account's. `heldBookingFrom`
 * builds one only when the id, code, start, day and time all came (`null`
 * otherwise), cuts `localStartTime` to minutes and reads a missing venue or
 * branch name as `''`.
 */
export interface HeldBooking {
  readonly reservationId: string;
  readonly code: string;
  readonly startUtc: string;
  /** The branch's own day, `YYYY-MM-DD`. */
  readonly localDate: string;
  /** "19:30" on the branch's clock (the server's `HH:mm:ss` cut to minutes). */
  readonly localStartTime: string;
  readonly venueName: string;
  readonly branchName: string;
}

/**
 * This proved number already holds as many active bookings — pending or
 * confirmed and not over, at any venue — as one number may
 * (`maxActiveBookings`, 3) — `phone-has-active-booking`, 409. Moving a
 * booking is never refused this way: it adds none.
 *
 * `held` names the caller's **earliest** active booking, so the screen can say
 * which one comes next ("cancel one — the next is …"). Null when the server
 * named none: the rare case where the bookings in the way belong to another
 * account holding the same number, which is never named.
 */
export class PhoneHasActiveBookingError extends ApiError {
  /** How many active bookings one number may hold. */
  readonly maxActiveBookings: number;
  readonly held: HeldBooking | null;

  constructor(
    options: RefusalOptions & {
      maxActiveBookings: number;
      held?: HeldBooking | null | undefined;
    },
  ) {
    super(`This phone number already holds ${options.maxActiveBookings} active bookings.`, {
      status: PROBLEM_CODE_STATUS[ProblemCodes.PhoneHasActiveBooking],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PhoneHasActiveBookingError';
    this.maxActiveBookings = options.maxActiveBookings;
    this.held = options.held ?? null;
  }
}

export function isPhoneHasActiveBooking(error: unknown): error is PhoneHasActiveBookingError {
  return error instanceof PhoneHasActiveBookingError;
}

/**
 * The guest is blocked from booking for missed bookings — three no-shows on
 * bookings that started within three days — `booking-blocked-no-shows`, 403,
 * on a new booking and on every change (the app's and the manage link's), and
 * on a takeaway order (2026-10-23; an order not collected counts as a
 * no-show). Nothing to retry: the screen says until when.
 */
export class BookingBlockedNoShowsError extends ApiError {
  /** When booking opens again, ISO-8601 UTC; null when the server did not say. */
  readonly blockedUntilUtc: string | null;

  constructor(options: RefusalOptions & { blockedUntilUtc?: string | null | undefined }) {
    super('Booking is blocked for a while because of three missed bookings in three days.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.BookingBlockedNoShows],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingBlockedNoShowsError';
    this.blockedUntilUtc = options.blockedUntilUtc ?? null;
  }
}

export function isBookingBlockedNoShows(error: unknown): error is BookingBlockedNoShowsError {
  return error instanceof BookingBlockedNoShowsError;
}

/**
 * Approving or rejecting a booking its guest's no-show block already cancelled
 * — `reservation-cancelled-by-block`, 409. Not "somebody else answered": the
 * platform cancelled it, and the request card goes.
 */
export class ReservationCancelledByBlockError extends ApiError {
  readonly reservationId: string | null;
  readonly cancelledAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      reservationId?: string | null | undefined;
      cancelledAtUtc?: string | null | undefined;
    },
  ) {
    super('This booking was cancelled automatically: its guest is blocked for no-shows.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.ReservationCancelledByBlock],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ReservationCancelledByBlockError';
    this.reservationId = options.reservationId ?? null;
    this.cancelledAtUtc = options.cancelledAtUtc ?? null;
  }
}

export function isReservationCancelledByBlock(
  error: unknown,
): error is ReservationCancelledByBlockError {
  return error instanceof ReservationCancelledByBlockError;
}

/**
 * Too late to undo this no-show — `no-show-undo-window-closed`, 409. The
 * window closed at `undoableUntilUtc` (05:00 the morning after, branch time).
 */
export class NoShowUndoWindowClosedError extends ApiError {
  readonly undoableUntilUtc: string | null;

  constructor(options: RefusalOptions & { undoableUntilUtc?: string | null | undefined }) {
    super('This no-show can no longer be undone.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.NoShowUndoWindowClosed],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'NoShowUndoWindowClosedError';
    this.undoableUntilUtc = options.undoableUntilUtc ?? null;
  }
}

export function isNoShowUndoWindowClosed(error: unknown): error is NoShowUndoWindowClosedError {
  return error instanceof NoShowUndoWindowClosedError;
}

/**
 * The tab is waiting for a waiter to let the table order —
 * `tab-awaiting-admission`, 409, on a phone's order or a bill request. Not a
 * failure to retry: the screen says a waiter will be over, and the tab's own
 * stream (`tabAdmitted`) says when ordering opens.
 */
export class TabAwaitingAdmissionError extends ApiError {
  readonly tabId: string;

  constructor(options: RefusalOptions & { tabId: string }) {
    super('A waiter has not let this table order yet.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.TabAwaitingAdmission],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TabAwaitingAdmissionError';
    this.tabId = options.tabId;
  }
}

export function isTabAwaitingAdmission(error: unknown): error is TabAwaitingAdmissionError {
  return error instanceof TabAwaitingAdmissionError;
}

/**
 * The tab's admission was already decided the other way —
 * `tab-admission-decided`, 409: another waiter rejected it before this Admit
 * landed, or admitted it before this Reject. The card goes with the next read.
 */
export class TabAdmissionDecidedError extends ApiError {
  readonly tabId: string;
  /** What it was decided as. */
  readonly admission: TabAdmissionStatus;

  constructor(options: RefusalOptions & { tabId: string; admission: TabAdmissionStatus }) {
    super('Somebody already decided about this table.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.TabAdmissionDecided],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TabAdmissionDecidedError';
    this.tabId = options.tabId;
    this.admission = options.admission;
  }
}

export function isTabAdmissionDecided(error: unknown): error is TabAdmissionDecidedError {
  return error instanceof TabAdmissionDecidedError;
}

/** `scan-turned-away`: a scan right after a waiter turned this phone or table away. */
export const SCAN_TURNED_AWAY_CODE = ProblemCodes.ScanTurnedAway;

/**
 * A waiter has just turned a scan from this phone (for 30 minutes) or at this
 * table (for 2) away — `scan-turned-away`, 409, on `POST /api/tabs/open`.
 * `retryAfterUtc` says when a scan is taken again; somebody really at the
 * table asks a waiter.
 */
export class ScanTurnedAwayError extends ApiError {
  /** When a scan is taken again, ISO-8601 UTC; null when the server did not say. */
  readonly retryAfterUtc: string | null;

  constructor(options: RefusalOptions & { retryAfterUtc?: string | null | undefined }) {
    super('A waiter turned this table away a moment ago. Ask a waiter.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.ScanTurnedAway],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ScanTurnedAwayError';
    this.retryAfterUtc = options.retryAfterUtc ?? null;
  }
}

export function isScanTurnedAway(error: unknown): error is ScanTurnedAwayError {
  return error instanceof ScanTurnedAwayError;
}
