/**
 * Refusals in the web console: venues and branches, the floor plan, the menu
 * editor, opening hours and the reservation policy, reports, staff, reviews.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { PROBLEM_CODE_STATUS, ProblemCodes } from '../../generated/problemCodes';
import type { ProblemDetails } from '../../problem';
import type { RefusalOptions } from './shared';

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
      status: PROBLEM_CODE_STATUS[ProblemCodes.VenueDeletionBlocked],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.BranchNotReady],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.FloorPlanInvalid],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.PinTaken],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.SignInUnknown],
      url: options.url,
      requestId: options.requestId,
      problem: options.problem,
    });
    this.name = 'SignInUnknownError';
  }
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
    super('Only an owner can move a branch.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.RelocationNotAllowed],
      ...options,
    });
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.FloorPlanChanged],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'FloorPlanChangedError';
    this.currentVersion = options.currentVersion;
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
