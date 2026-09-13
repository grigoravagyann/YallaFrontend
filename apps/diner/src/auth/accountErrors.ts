import {
  EmailTakenError,
  PhoneInUseError,
  TooManyAttemptsError,
  UnsupportedImageError,
  UsernameTakenError,
  ValidationError,
  isInvalidCredentials,
} from '@yalla/api';

/** The inputs an account form has; `form` is the line under the whole form. */
export type AccountField =
  'name' | 'username' | 'email' | 'phone' | 'password' | 'currentPassword' | 'form';

export interface AccountFailure {
  readonly field: AccountField;
  /** A `diner` namespace key; `null` means "use the generic failure copy". */
  readonly key: string | null;
}

/** The server's field names, as the forms name them. */
const SERVER_FIELDS: Record<string, AccountField> = {
  displayname: 'name',
  username: 'username',
  email: 'email',
  phonee164: 'phone',
  phone: 'phone',
  password: 'password',
  newpassword: 'password',
  currentpassword: 'currentPassword',
};

const INVALID_KEY: Record<AccountField, string | null> = {
  name: 'auth.error.nameRequired',
  username: 'auth.error.usernameInvalid',
  email: 'auth.error.emailInvalid',
  phone: 'auth.error.phoneInvalid',
  password: 'auth.error.passwordInvalid',
  currentPassword: 'editProfile.password.wrongCurrent',
  form: null,
};

/**
 * Which input a failed account request belongs under, and what it says.
 *
 * Pure, so each mapping is tested without a screen: the three 409s go to their
 * own field, a 400 to the field the server named, wrong credentials and a
 * lockout to the form. Anything else is `form` with no key — the caller shows
 * its generic line (network, server error).
 */
export function describeAccountFailure(error: unknown): AccountFailure {
  if (error instanceof UsernameTakenError) {
    return { field: 'username', key: 'auth.error.usernameTaken' };
  }
  if (error instanceof EmailTakenError) return { field: 'email', key: 'auth.error.emailTaken' };
  if (error instanceof PhoneInUseError) return { field: 'phone', key: 'auth.error.phoneInUse' };
  if (isInvalidCredentials(error)) return { field: 'form', key: 'auth.error.invalidCredentials' };
  if (error instanceof TooManyAttemptsError) {
    return { field: 'form', key: 'auth.error.tooManyAttempts' };
  }
  if (error instanceof ValidationError) {
    const field = error.field ? SERVER_FIELDS[error.field.toLowerCase()] : undefined;
    return field ? { field, key: INVALID_KEY[field] } : { field: 'form', key: null };
  }
  return { field: 'form', key: null };
}

/** The line for a refused photo, by the server's reason; `null` for anything else. */
export function photoFailureKey(error: unknown): string | null {
  if (!(error instanceof UnsupportedImageError)) return null;
  return `editProfile.photoError.${error.reason}`;
}
