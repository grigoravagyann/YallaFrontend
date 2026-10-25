/**
 * The typed errors a screen branches on, one per refusal it says something
 * specific about.
 *
 * The codes are not typed here. Every `…_CODE` constant is a generated
 * `ProblemCodes` member (`generated/problemCodes.ts`, from the backend's
 * `x-problem-codes`), so a slug is written once — on the backend's
 * `ErrorCodes.cs` — and a code the backend drops or renames fails to compile.
 * The mapping files read each refusal's context through `problemContext`, whose
 * member names come from the same catalogue. What stays hand-written is what
 * the frontend decides: which refusals get a class, what each carries in the
 * client's vocabulary, and its status where the client deliberately differs.
 * `check-problem-codes.mjs` lists the backend codes no class or branch handles.
 */
import type { FloorPlanData } from './tableFloor';
import type { TabAdmissionStatus } from './admission';
import { ApiError, TooManyRequestsError } from '../errors';
import type { ProblemDetails } from '../problem';
import type { TableAvailability, TableUnavailableReason } from './booking';
import type { ReservationStatusCode } from './push';
import type { TakeawayStatus } from './takeaway';
import { ProblemCodes } from '../generated/problemCodes';

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

/** The six digits did not match. Attempts remaining is shown to the user. */
export class WrongCodeError extends ApiError {
  /**
   * What the server said is left on this code. `0` means ask for a new one.
   * `null` means the server did not say — never defaulted to a number, because
   * "0 attempts left" after the first slip sends a diner to burn their hourly
   * code budget on a code that was still good.
   */
  readonly attemptsRemaining: number | null;

  constructor(options: { url: string; attemptsRemaining: number | null }) {
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

/**
 * The backend has Telegram verification switched off: its routes do not exist.
 * The screen hides the Telegram button after the first refusal and the SMS
 * code remains.
 */
export class TelegramUnavailableError extends ApiError {
  constructor(options: { url: string }) {
    super('Telegram verification is not available.', { status: 404, url: options.url });
    this.name = 'TelegramUnavailableError';
  }
}

/**
 * The backend has no SMS provider to send a code with: `request-code` answered
 * 503 `sms-unavailable`. It used to answer 200 and send nothing, which left the
 * diner waiting on a code that would never come. Telegram is the way to prove
 * the number then; `getPhoneProofChannels` says so before anything is pressed,
 * and this is the same answer for a screen that asked anyway.
 */
export class SmsUnavailableError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('Codes by SMS are not available.', {
      status: 503,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'SmsUnavailableError';
  }
}

/** Too many codes requested for one number. Distinct from too many attempts. */
export class RateLimitedError extends ApiError {
  /**
   * When another request will be accepted, ISO-8601 UTC — from the server's
   * `Retry-After`. `null` when it did not say, which the copy renders without a
   * time rather than naming one it made up.
   */
  readonly retryAtUtc: string | null;

  constructor(options: { url: string; retryAtUtc: string | null }) {
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

/**
 * The four refusals of "I'm at my table" — `POST /api/tabs/open-by-booking`.
 *
 * Each is its own class because each has its own next step, and the one thing
 * the screens must never do with a booking code is what they used to do: answer
 * it with "that code does not match a table". It did not, and never could.
 */

/** Facts the server sends with a refused booking, for the copy to use. */
interface BookingRefusal {
  readonly url: string;
  readonly reservationId?: string | undefined;
  readonly startUtc?: string | undefined;
  readonly endUtc?: string | undefined;
  readonly requestId?: string | undefined;
}

/**
 * No booking of this diner's has that code.
 *
 * A stranger's code answers with this too, word for word. That is deliberate on
 * the server and must stay deliberate here: a booking code is six characters
 * read out at a door, so an "exists, but not yours" would tell anybody with an
 * account which codes are live tonight.
 */
export class BookingNotFoundError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('We could not find that booking.', {
      status: 404,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingNotFoundError';
  }
}

/**
 * The booking is real and theirs, but the table is not being held for it yet.
 *
 * `earliestUtc` is the instant it starts being held — the branch's own walk-in
 * holdback, which the client has no way to compute and must not guess. Render
 * it in the **branch's** zone: a diner who landed this morning is not on it.
 */
export class BookingTooEarlyError extends ApiError {
  readonly reservationId: string | null;
  readonly startUtc: string | null;
  readonly endUtc: string | null;
  readonly earliestUtc: string | null;

  constructor(options: BookingRefusal & { earliestUtc?: string | undefined }) {
    super('That table is not being held for your booking yet.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingTooEarlyError';
    this.reservationId = options.reservationId ?? null;
    this.startUtc = options.startUtc ?? null;
    this.endUtc = options.endUtc ?? null;
    this.earliestUtc = options.earliestUtc ?? null;
  }
}

/**
 * The sitting is over, or the booking is already completed.
 *
 * Being *late* is not this: until a waiter releases the table it is still the
 * party's, and the server says so by letting them in.
 */
export class BookingEndedError extends ApiError {
  readonly reservationId: string | null;
  readonly startUtc: string | null;
  readonly endUtc: string | null;

  constructor(options: BookingRefusal) {
    super('That booking is over.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingEndedError';
    this.reservationId = options.reservationId ?? null;
    this.startUtc = options.startUtc ?? null;
    this.endUtc = options.endUtc ?? null;
  }
}

/**
 * The booking is not one a party is expected on: still awaiting the venue,
 * cancelled by either side, or marked a no-show.
 *
 * The state arrives as `bookingStatus` rather than `status`, which on every
 * `ApiError` is the HTTP status. Which of the states it is decides the
 * sentence — "the venue has not confirmed yet" and "you cancelled this" are not
 * the same news.
 */
export class BookingNotActiveError extends ApiError {
  readonly reservationId: string | null;
  readonly startUtc: string | null;
  readonly endUtc: string | null;
  readonly bookingStatus: ReservationStatusCode | null;

  constructor(options: BookingRefusal & { status?: ReservationStatusCode | undefined }) {
    super('That booking is not open for a tab.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingNotActiveError';
    this.reservationId = options.reservationId ?? null;
    this.startUtc = options.startUtc ?? null;
    this.endUtc = options.endUtc ?? null;
    this.bookingStatus = options.status ?? null;
  }
}

/**
 * The booked table still has another party seated — a sitting that is not this
 * booking's, often a walk-in nobody cleared.
 *
 * The server never puts the booker on a stranger's tab; a member of staff has
 * to free the table. `tableLabel` is the booked table, for "Table 1 still has
 * another party seated".
 */
export class BookingTableOccupiedError extends ApiError {
  readonly reservationId: string | null;
  readonly startUtc: string | null;
  readonly endUtc: string | null;
  readonly tableLabel: string | null;

  constructor(options: BookingRefusal & { tableLabel?: string | undefined }) {
    super('Another party is still seated at the booked table.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BookingTableOccupiedError';
    this.reservationId = options.reservationId ?? null;
    this.startUtc = options.startUtc ?? null;
    this.endUtc = options.endUtc ?? null;
    this.tableLabel = options.tableLabel ?? null;
  }
}

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

/** The action needs the host, and the caller is not it. */
export class NotTabHostError extends ApiError {
  constructor(options: { url: string }) {
    super('Only the host can do that.', { status: 403, url: options.url });
    this.name = 'NotTabHostError';
  }
}

/**
 * The branch has not paid for tabs and ordering — `feature-not-enabled`.
 *
 * Not the diner's problem and not a broken sticker: the next step is to order
 * from a waiter, and the copy says so.
 */
export class TabsNotEnabledError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('Ordering from the table is not switched on here.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TabsNotEnabledError';
  }
}

/**
 * The invitation is unknown, revoked or older than its thirty minutes.
 *
 * The host can make a new one in a tap, which is the only useful next step.
 */
export class InviteExpiredError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That invitation no longer works.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'InviteExpiredError';
  }
}

/**
 * The host tried to leave with nobody approved to hand the tab to.
 *
 * The server refuses rather than stranding the tab. A waiter can take it over
 * or close it, and the copy says exactly that.
 */
export class HostCannotLeaveError extends ApiError {
  readonly tabId: string;

  constructor(options: { url: string; tabId: string; requestId?: string | undefined }) {
    super('The host cannot leave with nobody to hand the tab to.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'HostCannotLeaveError';
    this.tabId = options.tabId;
  }
}

/**
 * This phone's hold on the tab is over: the tab closed, or the participant was
 * taken off it, or left.
 *
 * The server answers a participant token in those states with a bare 401 or
 * 403 and no body to tell them apart, so this does not pretend to. It is its
 * own type so a screen says "this tab is over for you" instead of "sign in
 * again" — and so the diner's own session is never asked to refresh for it.
 */
export class TabAccessEndedError extends ApiError {
  readonly tabId: string;
  /**
   * True when this device never held a participant token for the tab — a link
   * to somebody else's tab, or one opened before the token was kept between
   * launches. Nothing the server said: the screen asks for a scan of the table
   * rather than claiming the tab closed.
   */
  readonly notOnDevice: boolean;

  constructor(options: {
    url: string;
    tabId: string;
    status?: number | undefined;
    notOnDevice?: boolean | undefined;
  }) {
    super('This tab is closed, or you are no longer on it.', {
      status: options.status ?? 401,
      url: options.url,
    });
    this.name = 'TabAccessEndedError';
    this.tabId = options.tabId;
    this.notOnDevice = options.notOnDevice ?? false;
  }
}

export function isTabAccessEnded(error: unknown): error is TabAccessEndedError {
  return error instanceof TabAccessEndedError;
}

/**
 * The table has asked for staff too many times in a short window —
 * `service-request-rate-limited`.
 *
 * Not a failure to report: a waiter already knows. The copy says the table has
 * asked several times and somebody is on the way.
 */
export class ServiceRequestRateLimitedError extends ApiError {
  readonly windowMinutes: number | null;

  constructor(options: {
    url: string;
    windowMinutes: number | null;
    requestId?: string | undefined;
  }) {
    super('This table has asked several times already.', {
      status: 429,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ServiceRequestRateLimitedError';
    this.windowMinutes = options.windowMinutes;
  }
}

// ---------------------------------------------------------------------------
// The counter screen
// ---------------------------------------------------------------------------

/**
 * The tablet is not enrolled, or its enrolment has been revoked.
 *
 * Its own type because the way out is different from every other 401: not "sign
 * in again" but "ask a manager for a new enrolment code". A revoked tablet that
 * bounced to the PIN screen would loop forever, showing a keypad that can never
 * work.
 */
export class DeviceRevokedError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('This tablet is no longer enrolled.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'DeviceRevokedError';
  }
}

export function isDeviceRevoked(error: unknown): error is DeviceRevokedError {
  return error instanceof DeviceRevokedError;
}

/**
 * The enrolment code has already been used, or this browser is already enrolled
 * at that branch.
 *
 * The server does not distinguish the two, and neither does the copy: both mean
 * "do not type it again", and one of them means a manager should look at the
 * branch's device list for a tablet they did not enrol.
 */
export class EnrolmentCodeSpentError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That enrolment code has already been used.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'EnrolmentCodeSpentError';
  }
}

/**
 * The enrolment code was real but its 24 hours are up.
 *
 * Told apart from a mistyped code because the fix differs: retyping an expired
 * code never works, so the screen sends the staff to a manager for a new one
 * instead of having them check each character again.
 */
export class EnrolmentCodeExpiredError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That enrolment code has expired.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'EnrolmentCodeExpiredError';
  }
}

/**
 * A phone's pairing code is not one: unknown, mistyped, or a tablet's
 * enrolment code (`401 pairing-code-invalid`). Retyping it may help.
 */
export class PairingCodeInvalidError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That pairing code is not valid.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PairingCodeInvalidError';
  }
}

/**
 * Past its ten minutes, or a newer code for the same person replaced it
 * (`401 pairing-code-expired`): only a new code from a manager helps.
 */
export class PairingCodeExpiredError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That pairing code has expired.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PairingCodeExpiredError';
  }
}

/**
 * The code cannot pair this phone (`409 conflicting-state`): it was used
 * already, its person can no longer sign in at that branch, or this browser is
 * one of the branch's floor tablets. The server tells them apart only in prose,
 * and the fix is the same for all three — a manager.
 */
export class PairingCodeUnusableError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That pairing code cannot pair this phone.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PairingCodeUnusableError';
  }
}

/** Kitchen staff have no phone: the kitchen stays on its tablet (`409 kitchen-phone-not-allowed`). */
export class KitchenPhoneNotAllowedError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('Kitchen staff cannot have a phone paired.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'KitchenPhoneNotAllowedError';
  }
}

/**
 * Those four digits were not recognised.
 *
 * Deliberately says nothing more. Wrong PIN, unknown staff member and somebody
 * from another branch are one answer on the server, so that a tablet cannot be
 * used to enumerate who works where — and repeating that distinction here would
 * put it back.
 *
 * `attemptsRemaining` is **this device's own count**, not the server's. The
 * server never reports one; see {@link PIN_MAX_ATTEMPTS}.
 */
export class PinRejectedError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That PIN was not recognised.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PinRejectedError';
  }
}

/**
 * Too many wrong PINs. A manager clears it.
 *
 * Distinct from a wrong PIN on purpose, and the distinction is the point: the
 * fix is somebody else's action, not trying harder. A waiter locked out
 * mid-rush with no explanation goes back to paper that evening.
 */
export class PinLockedError extends ApiError {
  /** When the lockout lapses on its own. Null when only a manager can clear it. */
  readonly lockedUntilUtc: string | null;

  constructor(options: {
    url: string;
    lockedUntilUtc: string | null;
    requestId?: string | undefined;
  }) {
    super('Too many wrong PINs. A manager has to unlock this PIN.', {
      status: 403,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PinLockedError';
    this.lockedUntilUtc = options.lockedUntilUtc;
  }
}

export function isPinLocked(error: unknown): error is PinLockedError {
  return error instanceof PinLockedError;
}

/**
 * More cash was offered than the tab still owes.
 *
 * The payload is the whole reason this is its own type: the waiter is standing
 * at the table holding notes, and `remainingDram` is the number they need. The
 * screen refreshes and shows it. It never retries — a payment retried against a
 * balance this device could not verify is how a table pays twice.
 */
export class PaymentExceedsRemainingError extends ApiError {
  readonly tabId: string;
  readonly remainingDram: number;
  readonly requestedDram: number;

  constructor(options: {
    url: string;
    tabId: string;
    remainingDram: number;
    requestedDram: number;
    requestId?: string | undefined;
  }) {
    super('That is more than this tab still owes.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PaymentExceedsRemainingError';
    this.tabId = options.tabId;
    this.remainingDram = options.remainingDram;
    this.requestedDram = options.requestedDram;
  }
}

export function isPaymentExceedsRemaining(error: unknown): error is PaymentExceedsRemainingError {
  return error instanceof PaymentExceedsRemainingError;
}

/** A dish sold out between the waiter opening the menu and sending the order. */
export class MenuItemUnavailableError extends ApiError {
  readonly itemName: string;

  constructor(options: { url: string; itemName: string; requestId?: string | undefined }) {
    super(`${options.itemName} has sold out.`, {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'MenuItemUnavailableError';
    this.itemName = options.itemName;
  }
}

/** Why a tab takes no more orders, from `context.status`. Null from a server that does not say. */
export type TabNotAcceptingStatus = 'closing' | 'closed' | 'abandoned';

/** Staff asked to open a tab on a table nobody is sitting at. Seat them first. */
export class TableNotSeatedError extends ApiError {
  readonly tableId: string;

  constructor(options: { url: string; tableId: string; requestId?: string | undefined }) {
    super('Nobody is seated at this table. Seat the party first, then open the tab.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TableNotSeatedError';
    this.tableId = options.tableId;
  }
}

/** The bill has been asked for, so the tab takes no more items. Show the bill. */
export class TabNotAcceptingOrdersError extends ApiError {
  readonly tabId: string;
  /**
   * `closing` — the bill has been asked for; `closed` — paid and settled (an
   * order queued offline that lands after the table paid); `abandoned` —
   * written off. Null when the server did not say.
   */
  readonly tabStatus: TabNotAcceptingStatus | null;

  constructor(options: {
    url: string;
    tabId: string;
    tabStatus?: TabNotAcceptingStatus | null | undefined;
    requestId?: string | undefined;
  }) {
    super('This tab takes no more orders.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TabNotAcceptingOrdersError';
    this.tabId = options.tabId;
    this.tabStatus = options.tabStatus ?? null;
  }
}

/** Voiding a line the tab has already been paid against. That is a refund. */
export class LineAlreadyPaidError extends ApiError {
  readonly lineId: string;

  constructor(options: { url: string; lineId: string; requestId?: string | undefined }) {
    super('This tab has been paid against, so removing a line would be a refund.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'LineAlreadyPaidError';
    this.lineId = options.lineId;
  }
}

/** Why a named guest could not have an order put in their name. */
export type OrderGuestState = 'notOnTab' | 'pending' | 'removed';

/**
 * A waiter's order named a guest who cannot have it put in their name: not on
 * this tab (404), not let on by the host yet, or taken off it (409
 * `conflicting-state`, `context.participantStatus` 1 or 3). The whole send was
 * refused; nothing reached the kitchen.
 *
 * Told apart from everything else with the same status and code by
 * `context.participantId`, which only a guest refusal carries (FT3 wire, S7):
 * a 404 without it is a dish or the tab, a 409 without it a dish on another
 * branch's menu. Its own type because the 409 is otherwise a
 * `ConcurrencyConflictError`, which the tablet's queue would read as a table
 * race.
 */
export class OrderGuestUnavailableError extends ApiError {
  readonly participantId: string;
  /** Null when a 409 named the guest but not their state. */
  readonly guestState: OrderGuestState | null;
  /** Which field named them: `onBehalfOfParticipantId` or `items[i].participantId`. */
  readonly field: string | null;

  constructor(options: {
    url: string;
    status: 404 | 409;
    participantId: string;
    guestState: OrderGuestState | null;
    field?: string | null | undefined;
    requestId?: string | undefined;
  }) {
    super('A guest named on this order cannot have it put in their name.', {
      status: options.status,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'OrderGuestUnavailableError';
    this.participantId = options.participantId;
    this.guestState = options.guestState;
    this.field = options.field ?? null;
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

// ---------------------------------------------------------------------------
// The web console
// ---------------------------------------------------------------------------

/**
 * A venue cannot be deleted while people are still eating there or still
 * booked to.
 *
 * `venue-deletion-blocked`, 409 (`PlatformService.DeleteVenueAsync`). The
 * point of the type is the payload: "cannot delete" is useless to whoever
 * pressed the button, "table 4 still has an open tab, and bookings K7Q2LM and
 * R9XP3D are coming" is something they can act on. The server lists table
 * labels and booking codes, nothing more, so that is what this carries.
 */
export class VenueDeletionBlockedError extends ApiError {
  readonly venueId: string;
  /** Labels of tables with an open or closing tab. */
  readonly openTables: readonly string[];
  /** Codes of confirmed or pending bookings that have not started yet. */
  readonly futureBookings: readonly string[];

  constructor(options: {
    url: string;
    venueId: string;
    openTables: readonly string[];
    futureBookings: readonly string[];
    message?: string;
    requestId?: string | undefined;
  }) {
    super(options.message ?? 'That venue is still in use, so it cannot be deleted.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'VenueDeletionBlockedError';
    this.venueId = options.venueId;
    this.openTables = options.openTables;
    this.futureBookings = options.futureBookings;
  }
}

/**
 * A branch cannot be moved to Paid while its menu has unfinished dishes.
 *
 * `branch-not-ready`, 409. The count is the point: "cannot upgrade" sends the
 * admin nowhere, "eleven dishes still need a photo" sends them to the menu.
 * The readiness endpoint lists which ones.
 */
export class BranchNotReadyError extends ApiError {
  readonly branchId: string;
  readonly incompleteMenuItemCount: number;

  constructor(options: {
    url: string;
    branchId: string;
    incompleteMenuItemCount: number;
    requestId?: string | undefined;
  }) {
    super('That branch has unfinished dishes on its menu.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'BranchNotReadyError';
    this.branchId = options.branchId;
    this.incompleteMenuItemCount = options.incompleteMenuItemCount;
  }
}

/**
 * The plan the editor sent cannot be stored — `floor-plan-invalid`, 422 — and
 * the server named the offenders.
 *
 * The payload is the point. "Invalid plan" is useless to somebody standing in
 * a cafe with the owner watching; "labels must be unique, repeated: 7" is
 * something they fix in ten seconds, and the editor can highlight the table.
 *
 * Photo and pin rules are not here: they are `validation-failed`, naming the
 * field (`areas[i].photoIds[j]`, `tables[i].photoId`) and its bound.
 */
export class FloorPlanInvalidError extends ApiError {
  /** Whole-plan complaints, already phrased for a person. */
  readonly errors: readonly string[];
  /** Labels used more than once in the plan. */
  readonly duplicateLabels: readonly string[];

  constructor(options: {
    url: string;
    errors: readonly string[];
    duplicateLabels: readonly string[];
    requestId?: string | undefined;
  }) {
    super(options.errors[0] ?? 'That floor plan cannot be saved.', {
      status: 422,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'FloorPlanInvalidError';
    this.errors = options.errors;
    this.duplicateLabels = options.duplicateLabels;
  }
}

export function isFloorPlanInvalid(error: unknown): error is FloorPlanInvalidError {
  return error instanceof FloorPlanInvalidError;
}

/** The slug is already taken. Its own type because the fix is a specific field. */
export class SlugTakenError extends ApiError {
  readonly slug: string;

  constructor(options: { url: string; slug: string }) {
    super('That web address is already in use.', { status: 409, url: options.url });
    this.name = 'SlugTakenError';
    this.slug = options.slug;
  }
}

/**
 * The signed-in person's scope does not cover what they asked for.
 *
 * The server is the authority here and always will be. The client's role-built
 * navigation exists so this is never reached by accident — not as the check.
 */
export class OutOfScopeError extends ApiError {
  constructor(options: { url: string }) {
    super('You do not have access to that.', { status: 403, url: options.url });
    this.name = 'OutOfScopeError';
  }
}

// ---------------------------------------------------------------------------
// The menu editor, opening hours and the reservation policy
// ---------------------------------------------------------------------------

/**
 * A category cannot be deleted because one of its items is on an order.
 *
 * Its own type because the way through is specific and not obvious: mark those
 * items unavailable, which keeps them off every menu without breaking the order
 * lines that point at them. "Cannot delete" alone sends somebody looking for a
 * force button that does not exist and should not.
 */
export class CategoryInUseError extends ApiError {
  readonly categoryId: string;

  constructor(options: {
    url: string;
    categoryId: string;
    /** The server's `detail`, when the caller has it; the generic sentence otherwise. */
    detail?: string | undefined;
    requestId?: string | undefined;
  }) {
    super(options.detail ?? 'Items in this category appear on orders.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'CategoryInUseError';
    this.categoryId = options.categoryId;
  }
}

/** Why an upload was refused. The three cases have three different fixes. */
export type UnsupportedImageReason =
  /** Not a JPEG, PNG or WebP — whatever the extension claimed. */
  | 'format'
  /** Over the upload cap. */
  | 'tooLarge'
  /** Too few pixels to be useful at card size, or a decompression bomb. */
  | 'dimensions';

/**
 * The bytes are not an image this system will store.
 *
 * The reason matters because the fixes differ, and one of them is genuinely
 * confusing: **the server sniffs the bytes and ignores both the file name and
 * the declared content type**, so a photo an iPhone saved as `IMG_0421.jpg`
 * that is really a HEIC is refused as the wrong format while every label on it
 * says JPEG. Telling somebody "that .jpg is actually a HEIC — export it as JPEG
 * first" is the difference between a fixed photo and a support conversation.
 */
export class UnsupportedImageError extends ApiError {
  readonly reason: UnsupportedImageReason;
  /** What the bytes turned out to be, when the server could tell. */
  readonly detectedFormat: string | null;
  /** The server's own sentence, which is more specific than the reason. */
  readonly detail: string;

  constructor(options: {
    url: string;
    reason: UnsupportedImageReason;
    detectedFormat?: string | null | undefined;
    detail: string;
    requestId?: string | undefined;
  }) {
    super(options.detail, { status: 409, url: options.url, requestId: options.requestId });
    this.name = 'UnsupportedImageError';
    this.reason = options.reason;
    this.detectedFormat = options.detectedFormat ?? null;
    this.detail = options.detail;
  }
}

export function isUnsupportedImage(error: unknown): error is UnsupportedImageError {
  return error instanceof UnsupportedImageError;
}

/**
 * Two spans on one day overlap.
 *
 * Validated client-side before the request as well, so the rows can be marked
 * rather than a form-level message shown — but the server is the authority and
 * this is what it says when the client's check missed something.
 */
export class OverlappingHoursError extends ApiError {
  /** `System.DayOfWeek` indices, 0 Sunday. Empty when the server did not say. */
  readonly days: readonly number[];

  constructor(options: {
    url: string;
    days: readonly number[];
    detail: string;
    requestId?: string | undefined;
  }) {
    super(options.detail, { status: 400, url: options.url, requestId: options.requestId });
    this.name = 'OverlappingHoursError';
    this.days = options.days;
  }
}

/**
 * One policy field is outside its bounds.
 *
 * The server refuses rather than clamping — a value silently corrected to
 * something the owner did not choose is worse than a refusal — and names the
 * field in prose: *"Turn time must be between 15 and 360 minutes; 5 minutes was
 * given."* `field` is that prose mapped back to the form's own field, so the
 * message lands against the input rather than at the top of the page.
 */
export class PolicyBoundsError extends ApiError {
  /** The client's field name, or `null` when the message named nothing known. */
  readonly field: string | null;
  /** Every field the refusal named — a 422 names all of them — `field` first. */
  readonly fields: readonly string[];
  readonly detail: string;

  constructor(options: {
    url: string;
    field: string | null;
    fields?: readonly string[] | undefined;
    detail: string;
    requestId?: string | undefined;
  }) {
    super(options.detail, { status: 400, url: options.url, requestId: options.requestId });
    this.name = 'PolicyBoundsError';
    this.field = options.field;
    this.fields = options.fields ?? (options.field ? [options.field] : []);
    this.detail = options.detail;
  }
}

export function isPolicyBounds(error: unknown): error is PolicyBoundsError {
  return error instanceof PolicyBoundsError;
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
 * The range asked for is longer than a report will run.
 *
 * Not a failure of the request so much as of the question: everything in the
 * report section is queried live against the operational tables, and a range
 * nobody meant to ask for is a table scan nobody meant to run. The server
 * refuses and names its own limit, which is more use than a request that spins
 * for ninety seconds and times out — so the limit travels on the error and the
 * screen says what it is rather than inventing a number of its own.
 */
export class ReportRangeTooLongError extends ApiError {
  readonly requestedDays: number;
  readonly maxDays: number;

  constructor(options: {
    url: string;
    requestedDays: number;
    maxDays: number;
    requestId?: string | undefined;
  }) {
    super(`A report may cover at most ${options.maxDays} days.`, {
      status: 400,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ReportRangeTooLongError';
    this.requestedDays = options.requestedDays;
    this.maxDays = options.maxDays;
  }
}

/**
 * The server refused a staff change on the role rules.
 *
 * Its own error because the UI is meant to make this unreachable: pickers are
 * built from `assignableRoles`, so a refusal here means either a stale screen —
 * somebody's own role changed under them in another tab — or a client bug. It
 * carries the field so the message lands against the control that caused it
 * rather than as a form-level banner nobody can act on.
 */
export class StaffPermissionError extends ApiError {
  /** `role`, `branchId` or `isActive`, from the problem's `context.field`. */
  readonly field: string | null;

  constructor(options: {
    url: string;
    detail: string;
    field?: string | null | undefined;
    requestId?: string | undefined;
  }) {
    super(options.detail, {
      status: 403,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'StaffPermissionError';
    this.field = options.field ?? null;
  }
}

/**
 * The PIN is already used by somebody who signs in on the same tablet —
 * 409 `pin-taken`, `context.field = "pin"`.
 *
 * PINs are unique per tablet roster: a branch's people plus the venue-wide
 * owners and general managers who appear on every branch's tablet. Two people
 * on one keypad with one PIN would each be signed in as whichever the tablet
 * matched first, so the server refuses the second one when a PIN is set — on
 * create and on a new PIN. A move to another branch does not re-check it, and
 * deactivated people do not count.
 *
 * Its own type, with the same `field` the role refusal has, so a staff form
 * puts the server's sentence under the PIN field and keeps everything else
 * that was typed.
 */
export class StaffPinTakenError extends ApiError {
  readonly field: string;

  constructor(options: {
    url: string;
    detail: string;
    requestId?: string | undefined;
    /** The problem document, so `code` reads `pin-taken` as the server sent it. */
    problem?: ProblemDetails | undefined;
  }) {
    super(options.detail, {
      status: 409,
      url: options.url,
      requestId: options.requestId,
      problem: options.problem,
    });
    this.name = 'StaffPinTakenError';
    this.field = 'pin';
  }
}

/**
 * `409 sign-in-unknown` from "sign out everywhere else": the token names no
 * sign-in to keep (it was issued before tokens carried their refresh chain),
 * so the server cannot tell this browser from the others and changed
 * nothing. Not a conflict a refresh gets past: signing in again issues a
 * token that names its sign-in, and then it works.
 */
export class SignInUnknownError extends ApiError {
  constructor(options: {
    url: string;
    requestId?: string | undefined;
    problem?: ProblemDetails | undefined;
  }) {
    super(options.problem?.detail || 'This sign-in cannot be told apart from the others.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
      problem: options.problem,
    });
    this.name = 'SignInUnknownError';
  }
}

// ---------------------------------------------------------------------------
// Diner accounts
// ---------------------------------------------------------------------------

/**
 * Somebody already has that username — `username-taken`, 409.
 *
 * Its own type, like {@link SlugTakenError}, because the fix is one specific
 * field: the message lands against the username input, not at the top of the
 * form, and the rest of what was typed stays.
 */
export class UsernameTakenError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That username is already taken.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'UsernameTakenError';
  }
}

/** Somebody already signed up with that email — `email-taken`, 409. */
export class EmailTakenError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That email already has an account.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'EmailTakenError';
  }
}

/**
 * The phone number already has an account — `phone-in-use`, 409.
 *
 * Distinct from the other two on purpose: the next step is not another field
 * but another door. Whoever holds that phone can sign in with a code, so the
 * form offers "Log in with your phone number instead" rather than "pick another number".
 */
export class PhoneInUseError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That phone number already has an account.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PhoneInUseError';
  }
}

/**
 * The username-or-email and password did not match — `invalid-credentials`, 401.
 *
 * Deliberately says nothing more. An unknown identifier, a wrong password, an
 * account that never set a password and an inactive account are one answer on
 * the server, so a login form cannot be used to ask who has an account — and
 * repeating the distinction here would put it back. The same code answers a
 * wrong `currentPassword` when changing the password.
 *
 * Not an {@link UnauthorizedError}: nobody's session ended, and a screen must
 * not route to sign-in over it.
 */
export class InvalidCredentialsError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('That username or email and password do not match.', {
      status: 401,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * The account's phone number has not been confirmed by code — `phone-not-verified`, 403.
 *
 * A password account can be registered with any number, so booking a table (or
 * opening a tab from a booking) waits until the number is proved: reminders and
 * no-shows land on that number, and it must be the diner's own. The next step
 * is the SMS code, not another attempt — a retry answers the same until then.
 *
 * Not a {@link ForbiddenError} in the sense of "not allowed": nothing about the
 * session is wrong, and a screen must offer verification rather than sign-in.
 */
export class PhoneNotVerifiedError extends ApiError {
  constructor(options: { url: string; requestId?: string | undefined }) {
    super('Confirm your phone number before booking.', {
      status: 403,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'PhoneNotVerifiedError';
  }
}

export function isPhoneNotVerified(error: unknown): error is PhoneNotVerifiedError {
  return error instanceof PhoneNotVerifiedError;
}

export function isInvalidCredentials(error: unknown): error is InvalidCredentialsError {
  return error instanceof InvalidCredentialsError;
}

/** Any of the three 409s a sign-up form has a field for. */
// ---------------------------------------------------------------------------
// Hardening contract K0 and the 2026-09-14 addendum
// ---------------------------------------------------------------------------

interface RefusalOptions {
  readonly url: string;
  readonly requestId?: string | undefined;
}

/**
 * Moving a branch — its pin or its street address — is for an owner or a
 * platform admin — `relocation-not-allowed`, 403 (K5).
 *
 * Nothing was written, the other fields on the same save included: the save is
 * atomic. A manager's form shows the pin and address read-only, so reaching this
 * means a stale screen or a role changed under the person.
 */
export class RelocationNotAllowedError extends ApiError {
  constructor(options: RefusalOptions) {
    super('Only an owner can move a branch.', { status: 403, ...options });
    this.name = 'RelocationNotAllowedError';
  }
}

/**
 * Somebody else saved the floor plan since this editor loaded it —
 * `floor-plan-changed`, 409 (K6).
 *
 * Nothing was written. The editor offers to reload rather than overwrite a room
 * somebody else just drew.
 */
export class FloorPlanChangedError extends ApiError {
  /** The version the server holds now, from `context.currentVersion`. */
  readonly currentVersion: string | null;

  constructor(options: RefusalOptions & { currentVersion: string | null }) {
    super('The floor plan was changed by somebody else.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'FloorPlanChangedError';
    this.currentVersion = options.currentVersion;
  }
}

/**
 * A first review needs a visit — `review-needs-visit`, 403 (K8).
 *
 * A seated or completed booking at the branch, or a place on one of its tabs,
 * within the last 180 days. Revising a review the diner already wrote is never
 * refused this way.
 */
export class ReviewNeedsVisitError extends ApiError {
  constructor(options: RefusalOptions) {
    super('Reviews are for places you have visited.', { status: 403, ...options });
    this.name = 'ReviewNeedsVisitError';
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

/** A diner reporting their own review — `conflicting-state`, 409 (addendum, K8 extension). */
export class CannotReportOwnReviewError extends ApiError {
  constructor(options: RefusalOptions) {
    super('You cannot report your own review.', { status: 409, ...options });
    this.name = 'CannotReportOwnReviewError';
  }
}

/** The account already has the most favourites it may keep — `conflicting-state`, 409 (K11). */
export class TooManyFavoritesError extends ApiError {
  readonly max: number;

  constructor(options: RefusalOptions & { max: number }) {
    super(`At most ${options.max} places can be saved.`, {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TooManyFavoritesError';
    this.max = options.max;
  }
}

/**
 * A venue unhiding a review the platform hid — `forbidden`, 403 (addendum).
 *
 * Read from the venue visibility route when the request was an unhide. The
 * platform's takedown outranks the venue's; only the platform can reverse it.
 */
export class ReviewHiddenByPlatformError extends ApiError {
  readonly reviewId: string;

  constructor(options: RefusalOptions & { reviewId: string }) {
    super('This review was hidden by Yalla and can only be restored by Yalla.', {
      status: 403,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ReviewHiddenByPlatformError';
    this.reviewId = options.reviewId;
  }
}

/**
 * A hidden review takes no reply — `conflicting-state`, 409 (VC4 wire §1).
 * One the venue hid can be shown again first; one Yalla hid never can.
 */
export class ReviewHiddenNoReplyError extends ApiError {
  readonly reviewId: string;

  constructor(options: RefusalOptions & { reviewId: string }) {
    super('A hidden review cannot be replied to.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ReviewHiddenNoReplyError';
    this.reviewId = options.reviewId;
  }
}

export function isAccountTaken(
  error: unknown,
): error is UsernameTakenError | EmailTakenError | PhoneInUseError {
  return (
    error instanceof UsernameTakenError ||
    error instanceof EmailTakenError ||
    error instanceof PhoneInUseError
  );
}
// ---------------------------------------------------------------------------
// Number rules and tab admission (2026-10-20; guest record, the same day)
// ---------------------------------------------------------------------------

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
      status: 409,
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
      status: 403,
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
      status: 409,
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
      status: 409,
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
      status: 409,
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
      status: 409,
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
      status: 409,
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

// ---------------------------------------------------------------------------
// Pre-orders on a booking (2026-10-21)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// "Ask: are you coming?" (2026-10-22)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Takeaway (2026-10-22)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Guest messages (2026-10-23)
// ---------------------------------------------------------------------------

/** `conversation-closed`: the thread closed (two hours after the booking or order finished). */
export const CONVERSATION_CLOSED_CODE = ProblemCodes.ConversationClosed;
/** `guests-cannot-write`: the venue switched guest messages off; the answer buttons still work. */
export const GUESTS_CANNOT_WRITE_CODE = ProblemCodes.GuestsCannotWrite;
/** `waiters-cannot-write`: the venue lets only managers write from the tablet. */
export const WAITERS_CANNOT_WRITE_CODE = ProblemCodes.WaitersCannotWrite;
/** `messages-too-fast`: more than five guest messages a minute, or sixty in one thread. */
export const MESSAGES_TOO_FAST_CODE = ProblemCodes.MessagesTooFast;

/**
 * Writing to a closed thread — `conversation-closed`, 409 (`context`:
 * `subjectKind`, `subjectId`, `closedAtUtc`). Hide the composer and show the
 * closed note; the thread can still be read. Read it again.
 */
export class ConversationClosedError extends ApiError {
  /** `reservation` or `takeaway`, when the server says. */
  readonly subjectKind: 'reservation' | 'takeaway' | null;
  readonly subjectId: string | null;
  /** When it closed, when the server says. */
  readonly closedAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      subjectKind?: 'reservation' | 'takeaway' | null | undefined;
      subjectId?: string | null | undefined;
      closedAtUtc?: string | null | undefined;
    },
  ) {
    super('This conversation is closed.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ConversationClosedError';
    this.subjectKind = options.subjectKind ?? null;
    this.subjectId = options.subjectId ?? null;
    this.closedAtUtc = options.closedAtUtc ?? null;
  }
}

export function isConversationClosed(error: unknown): error is ConversationClosedError {
  return error instanceof ConversationClosedError;
}

/**
 * A guest's text while the venue has guest messages off —
 * `guests-cannot-write`, 403. The answer buttons still work: "reply with the
 * buttons or call".
 */
export class GuestsCannotWriteError extends ApiError {
  constructor(options: RefusalOptions) {
    super('This venue does not take messages from guests.', {
      status: 403,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'GuestsCannotWriteError';
  }
}

export function isGuestsCannotWrite(error: unknown): error is GuestsCannotWriteError {
  return error instanceof GuestsCannotWriteError;
}

/**
 * A waiter writing while the venue lets only managers write —
 * `waiters-cannot-write`, 403. Hide the composer.
 */
export class WaitersCannotWriteError extends ApiError {
  constructor(options: RefusalOptions) {
    super('Only managers can write to guests here.', {
      status: 403,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'WaitersCannotWriteError';
  }
}

export function isWaitersCannotWrite(error: unknown): error is WaitersCannotWriteError {
  return error instanceof WaitersCannotWriteError;
}

/**
 * Too many guest messages — `messages-too-fast`, 429 (`context`:
 * `conversationId`, `perMinute`, `perConversation`, and `retryAfterUtc` while
 * waiting helps): more than five a minute, or sixty in one thread. A
 * `TooManyRequestsError`, so the generic "wait a moment" handling still
 * applies; `retryAfterSeconds` from `Retry-After` when the server sent it.
 */
export class MessagesTooFastError extends TooManyRequestsError {
  readonly conversationId: string | null;
  /** When the next one will be taken; `null` once the thread's sixty are spent. */
  readonly retryAfterUtc: string | null;
  /** The thread's sixty are used up: waiting will not help — call instead. */
  readonly perConversation: boolean;

  constructor(
    options: RefusalOptions & {
      conversationId?: string | null | undefined;
      retryAfterSeconds?: number | null | undefined;
      retryAfterUtc?: string | null | undefined;
      perConversation?: boolean | undefined;
    },
  ) {
    super({
      url: options.url,
      requestId: options.requestId,
      retryAfterSeconds: options.retryAfterSeconds ?? null,
    });
    this.name = 'MessagesTooFastError';
    this.conversationId = options.conversationId ?? null;
    this.retryAfterUtc = options.retryAfterUtc ?? null;
    this.perConversation = options.perConversation ?? false;
  }
}

export function isMessagesTooFast(error: unknown): error is MessagesTooFastError {
  return error instanceof MessagesTooFastError;
}
