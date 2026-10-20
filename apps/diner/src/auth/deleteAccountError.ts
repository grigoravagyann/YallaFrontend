import {
  InvalidCredentialsError,
  RateLimitedError,
  TooManyAttemptsError,
  TooManyRequestsError,
  ValidationError,
} from '@yalla/api';

export type DeleteAccountErrorKey =
  | 'profile.deleteAccount.wrongPassword'
  | 'profile.deleteAccount.wrongCode'
  | 'profile.deleteAccount.tooManyAttempts'
  | 'profile.deleteAccount.proofExpired'
  | 'profile.deleteAccount.error';

/**
 * The sentence a failed account deletion shows.
 *
 * Three failures a diner answers differently. A wrong password or code
 * (`invalid-credentials`) means retyping it, and nothing was deleted. Too many
 * tries — the 429 on the deletion, or on asking for the code — means waiting.
 * Anything else is a plain "not deleted, try again".
 *
 * `byTelegram`: the deletion went with nothing in its body, on the strength
 * of a Telegram sign-in's phone proof. The server's 422 on `code` then means
 * that proof is more than ten minutes old (or was never on this token), and
 * the answer is to confirm with Telegram again.
 */
export function deleteAccountErrorKey(
  error: unknown,
  withPassword: boolean,
  byTelegram = false,
): DeleteAccountErrorKey {
  if (byTelegram && error instanceof ValidationError && error.field === 'code') {
    return 'profile.deleteAccount.proofExpired';
  }
  if (error instanceof InvalidCredentialsError) {
    return withPassword ? 'profile.deleteAccount.wrongPassword' : 'profile.deleteAccount.wrongCode';
  }
  if (
    error instanceof TooManyAttemptsError ||
    error instanceof RateLimitedError ||
    error instanceof TooManyRequestsError
  ) {
    return 'profile.deleteAccount.tooManyAttempts';
  }
  return 'profile.deleteAccount.error';
}
