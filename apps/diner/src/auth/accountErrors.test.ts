import {
  EmailTakenError,
  InvalidCredentialsError,
  PhoneInUseError,
  TooManyAttemptsError,
  UsernameTakenError,
  ValidationError,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { describeAccountFailure } from './accountErrors';

const url = '/api/auth/diner/register';

// The constructors' option shapes vary; the mapping only reads the class and `.field`.
function make<T>(Ctor: new (options: never) => T, options: object): T {
  return new Ctor(options as never);
}

describe('an account request that failed', () => {
  it('puts each taken value under its own field', () => {
    expect(describeAccountFailure(make(UsernameTakenError, { url }))).toEqual({
      field: 'username',
      key: 'auth.error.usernameTaken',
    });
    expect(describeAccountFailure(make(EmailTakenError, { url })).field).toBe('email');
    expect(describeAccountFailure(make(PhoneInUseError, { url })).field).toBe('phone');
  });

  it('puts wrong credentials and a lockout under the form', () => {
    expect(describeAccountFailure(make(InvalidCredentialsError, { url }))).toEqual({
      field: 'form',
      key: 'auth.error.invalidCredentials',
    });
    expect(describeAccountFailure(make(TooManyAttemptsError, { url })).key).toBe(
      'auth.error.tooManyAttempts',
    );
  });

  it('puts a validation failure under the field the server named', () => {
    const error = make(ValidationError, {
      url,
      status: 400,
      problem: { context: { field: 'phoneE164' } },
    });
    expect(describeAccountFailure(error)).toEqual({
      field: 'phone',
      key: 'auth.error.phoneInvalid',
    });
  });

  it('leaves anything else to the generic line', () => {
    expect(describeAccountFailure(new Error('boom'))).toEqual({ field: 'form', key: null });
  });
});
