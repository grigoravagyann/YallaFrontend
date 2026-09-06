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

/** The bill has been asked for, so the tab takes no more items. Show the bill. */
export class TabNotAcceptingOrdersError extends ApiError {
  readonly tabId: string;

  constructor(options: { url: string; tabId: string; requestId?: string | undefined }) {
    super('The bill has been asked for on this tab.', {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TabNotAcceptingOrdersError';
    this.tabId = options.tabId;
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
 * A venue cannot be deleted while a table is still mid-service.
 *
 * The point of the type is the payload. "Cannot delete" is useless to whoever
 * pressed the button; "table 7 at Northern Avenue still has an open tab" is
 * something they can act on in the next thirty seconds, so the blocking tabs
 * travel with the error rather than being fetched afterwards.
 */
export interface BlockingTab {
  readonly tabId: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly tableLabel: string;
}

export class VenueHasOpenTabsError extends ApiError {
  readonly venueId: string;
  readonly openTabs: readonly BlockingTab[];

  constructor(options: { url: string; venueId: string; openTabs: readonly BlockingTab[] }) {
    super('That venue still has open tabs.', { status: 409, url: options.url });
    this.name = 'VenueHasOpenTabsError';
    this.venueId = options.venueId;
    this.openTabs = options.openTabs;
  }
}

/**
 * The floor plan the editor sent cannot be stored, and the server named the
 * offenders.
 *
 * The payload is the point. "Invalid plan" is useless to somebody standing in
 * a cafe with the owner watching; "tables 7 and 12 are outside the canvas" is
 * something they fix in ten seconds, and the editor can highlight both and
 * scroll to the first.
 *
 * Note what is *not* here: overlapping tables. The server treats those as a
 * warning and saves anyway, because real rooms have stools tucked under bars.
 * The client must not be stricter than the server about it.
 */
export class FloorPlanInvalidError extends ApiError {
  /** Whole-plan complaints, already phrased for a person. */
  readonly errors: readonly string[];
  /** Labels of tables that do not fit inside the canvas. */
  readonly tablesOutsideCanvas: readonly string[];
  /** Labels used more than once in the branch. */
  readonly duplicateLabels: readonly string[];

  constructor(options: {
    url: string;
    errors: readonly string[];
    tablesOutsideCanvas: readonly string[];
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
    this.tablesOutsideCanvas = options.tablesOutsideCanvas;
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

  constructor(options: { url: string; categoryId: string; requestId?: string | undefined }) {
    super('Items in this category appear on orders.', {
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
  readonly detail: string;

  constructor(options: {
    url: string;
    field: string | null;
    detail: string;
    requestId?: string | undefined;
  }) {
    super(options.detail, { status: 400, url: options.url, requestId: options.requestId });
    this.name = 'PolicyBoundsError';
    this.field = options.field;
    this.detail = options.detail;
  }
}

export function isPolicyBounds(error: unknown): error is PolicyBoundsError {
  return error instanceof PolicyBoundsError;
}

/**
 * The one hold extension is already spent.
 *
 * **Inferred from the endpoint, not from a code**, and that is worth stating.
 * `Reservation.ExtendHold` throws `DomainStateException`, which the API maps to
 * a 409 with the generic `conflicting-state` code and prose only — no field
 * name, no `graceExtensionsUsed` in the context. Three domain rules produce it:
 * the booking is not confirmed, the branch offers no extensions, or the one
 * extension is used.
 *
 * The late nudge is only sent for a confirmed booking at a branch whose policy
 * has a non-zero `GraceExtensionMinutes` — the notification payload carries the
 * number — so on that path the third is the only one left. The gateway raises
 * this instead of a generic conflict so the screen can say "you have already
 * let them know" rather than "something went wrong".
 *
 * A dedicated `hold-already-extended` code, or `graceExtensionsUsed` on
 * `ReservationView`, would remove the inference. Both are worth asking for.
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
