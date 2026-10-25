/**
 * Refusals of scanning in, "I'm at my table" and the shared tab.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import type { ReservationStatusCode } from '../push';
import type { BookingRefusal } from './shared';

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
