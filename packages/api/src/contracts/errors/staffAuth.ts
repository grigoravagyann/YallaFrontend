/**
 * Refusals of the counter screen's own sign-in: tablet enrolment, phone pairing, the PIN.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';

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
