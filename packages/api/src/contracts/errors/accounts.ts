/**
 * Refusals of diner accounts: sign-up, sign-in, an unproved phone number.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import { PROBLEM_CODE_STATUS, ProblemCodes } from '../../generated/problemCodes';

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
      status: PROBLEM_CODE_STATUS[ProblemCodes.UsernameTaken],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.EmailTaken],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.PhoneInUse],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.InvalidCredentials],
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
      status: PROBLEM_CODE_STATUS[ProblemCodes.PhoneNotVerified],
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
