import {
  InvalidCredentialsError,
  ServerError,
  TooManyAttemptsError,
  TooManyRequestsError,
  ValidationError,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { deleteAccountErrorKey } from './deleteAccountError';

const url = 'https://api.example.test/api/diner/me';

describe('a failed account deletion', () => {
  it('names the wrong password when the account confirms with one', () => {
    expect(deleteAccountErrorKey(new InvalidCredentialsError({ url }), true)).toBe(
      'profile.deleteAccount.wrongPassword',
    );
  });

  it('names the wrong code when the account confirms by SMS', () => {
    expect(deleteAccountErrorKey(new InvalidCredentialsError({ url }), false)).toBe(
      'profile.deleteAccount.wrongCode',
    );
  });

  it('asks for Telegram again when the server no longer takes the phone proof', () => {
    const noProof = new ValidationError({
      url,
      status: 422,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail: 'Enter the code, or prove the number with Telegram again.',
        code: 'validation-failed',
        traceId: 'test',
        context: { field: 'code' },
      },
    });
    expect(deleteAccountErrorKey(noProof, false, true)).toBe('profile.deleteAccount.proofExpired');
    // By code the field is never left empty: that refusal is no proof gone stale.
    expect(deleteAccountErrorKey(noProof, false)).toBe('profile.deleteAccount.error');
  });

  it('says too many tries for a 429, whichever way it arrived', () => {
    for (const error of [
      new TooManyAttemptsError({ url }),
      new TooManyRequestsError({ url, retryAfterSeconds: null }),
    ]) {
      expect(deleteAccountErrorKey(error, true)).toBe('profile.deleteAccount.tooManyAttempts');
      expect(deleteAccountErrorKey(error, false)).toBe('profile.deleteAccount.tooManyAttempts');
    }
  });

  it('falls back to the generic sentence for anything else', () => {
    expect(deleteAccountErrorKey(new ServerError({ url, status: 503 }), true)).toBe(
      'profile.deleteAccount.error',
    );
    expect(deleteAccountErrorKey(new Error('offline'), false)).toBe('profile.deleteAccount.error');
  });
});
