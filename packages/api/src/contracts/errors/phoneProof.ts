/**
 * Refusals of proving a phone number, by SMS code or by Telegram.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';

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
