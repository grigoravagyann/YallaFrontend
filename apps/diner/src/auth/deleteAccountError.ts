import {
  InvalidCredentialsError,
  RateLimitedError,
  TooManyAttemptsError,
  TooManyRequestsError,
} from '@yalla/api';

export type DeleteAccountErrorKey =
  | 'profile.deleteAccount.wrongPassword'
  | 'profile.deleteAccount.wrongCode'
  | 'profile.deleteAccount.tooManyAttempts'
  | 'profile.deleteAccount.error';

/**
 * The sentence a failed account deletion shows.
 *
 * Three failures a diner answers differently. A wrong password or code
 * (`invalid-credentials`) means retyping it, and nothing was deleted. Too many
 * tries — the 429 on the deletion, or on asking for the code — means waiting.
 * Anything else is a plain "not deleted, try again".
 */
export function deleteAccountErrorKey(
  error: unknown,
  withPassword: boolean,
): DeleteAccountErrorKey {
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
