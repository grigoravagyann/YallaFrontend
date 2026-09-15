import type {
  DinerProfileView,
  LoginDinerCommand,
  RegisterDinerCommand,
  SetDinerPasswordCommand,
  UpdateDinerProfileCommand,
} from '../contracts/dinerAccount';
import {
  EmailTakenError,
  InvalidCredentialsError,
  PhoneInUseError,
  TooManyAttemptsError,
  UsernameTakenError,
} from '../contracts/errors';
import type { Photo } from '../contracts/menuAdmin';
import { ValidationError } from '../errors';
import { mockPhoto } from './menuDetail';

/**
 * Diner accounts, in memory, with the server's rules.
 *
 * The rules are repeated here so a form built against the mock meets the same
 * refusals it will meet in production — the same field named, the same 409 for
 * the same duplicate — rather than a mock that accepts anything and a first
 * real sign-up that fails on the username. Every rule is the brief's; none is
 * this file's own idea.
 */

/** The one account the mock starts with, so login has somebody to be. */
export const SEEDED_ACCOUNT = {
  id: 'diner-lurj',
  username: 'lurj',
  email: 'lurj@example.com',
  password: 'password123',
  phoneE164: '+37477123456',
  displayName: 'Lurj Albert',
  localeCode: 'en',
} as const;

interface Account {
  readonly id: string;
  username: string | null;
  email: string | null;
  password: string | null;
  readonly phoneE164: string;
  phoneVerifiedAt: number | null;
  displayName: string | null;
  localeCode: string;
  photo: Photo | null;
}

/** The server's login limiter: ten misses in fifteen minutes per identifier. */
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60_000;

/** 3–30 of `a-z`, `0-9`, `.` and `_`, starting with a letter or digit. */
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,29}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_MAX = 320;
/** E.164: a plus, then seven to fifteen digits not starting with zero. */
const PHONE_RE = /^\+[1-9]\d{6,14}$/u;

const URL_TAG = 'mock://yalla';

/** A `400` naming the field, shaped as `ApiExceptionMapper` writes one. */
function invalid(url: string, field: string, detail: string): ValidationError {
  return new ValidationError({
    status: 400,
    url,
    problem: {
      code: 'validation',
      status: 400,
      title: 'Validation failed',
      detail,
      type: 'https://yalla.am/problems/validation',
      traceId: 'mock',
      instance: url,
      context: { field },
      errors: null,
    },
  });
}

export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

function checkUsername(url: string, input: string): string {
  const username = normaliseUsername(input);
  if (!USERNAME_RE.test(username)) {
    throw invalid(
      url,
      'username',
      'A username is 3–30 characters: lowercase letters, digits, "." and "_", starting with a letter or digit.',
    );
  }
  return username;
}

function checkEmail(url: string, input: string): string {
  const email = normaliseEmail(input);
  if (!EMAIL_RE.test(email) || email.length > EMAIL_MAX) {
    throw invalid(url, 'email', 'That is not a valid email address.');
  }
  return email;
}

function checkPassword(
  url: string,
  field: string,
  password: string,
  against: { username: string | null; email: string | null },
): string {
  if (password.length < 8 || password.length > 128) {
    throw invalid(url, field, 'A password is 8–128 characters.');
  }
  const lower = password.toLowerCase();
  if (
    (against.username && lower === against.username) ||
    (against.email && lower === against.email)
  ) {
    throw invalid(url, field, 'A password cannot be the username or the email.');
  }
  return password;
}

function checkDisplayName(url: string, input: string): string {
  const name = input.trim();
  if (name.length < 1 || name.length > 100) {
    throw invalid(url, 'displayName', 'A name is 1–100 characters.');
  }
  return name;
}

function checkPhone(url: string, input: string): string {
  const phone = input.replace(/[\s\-()]/gu, '');
  if (!PHONE_RE.test(phone)) {
    throw invalid(url, 'phoneE164', 'A phone number is in E.164, like +37411223344.');
  }
  return phone;
}

export interface AccountStore {
  /** The whole account behind an id, as `GET /api/diner/me` would answer it. */
  profile(accountId: string): DinerProfileView | null;
  /** `POST /api/auth/diner/register`. Returns the new account's id. */
  register(command: RegisterDinerCommand): string;
  /** `POST /api/auth/diner/login`. Returns the account's id. */
  login(command: LoginDinerCommand): string;
  update(accountId: string, command: UpdateDinerProfileCommand): DinerProfileView;
  setPassword(accountId: string, command: SetDinerPasswordCommand): void;
  setPhoto(accountId: string, seed: string): Photo;
  removePhoto(accountId: string): void;
  /**
   * Account deletion (K2): the row goes, so its phone, username and email can
   * be registered again. What else is erased is the gateway's business.
   */
  remove(accountId: string): void;
  /** Whether a password matches, without the login limiter — for confirming a deletion. */
  passwordMatches(accountId: string, password: string): boolean;
  /**
   * What verify-code does to accounts: a number that already has one is marked
   * verified and that account is signed in; a number with none gets an account
   * made for it, as the server has always done. Returns the id and which.
   */
  verifyPhone(
    phoneE164: string,
    localeCode?: string | undefined,
    /** The account signed in when the code was passed, if any. */
    callerAccountId?: string | null,
  ): { readonly accountId: string; readonly isNewAccount: boolean };
}

export function createAccountStore(options: { readonly now: () => Date }): AccountStore {
  const { now } = options;
  const accounts = new Map<string, Account>();
  /** lowercased identifier → the instants of its recent misses. */
  const misses = new Map<string, number[]>();
  let sequence = 1;

  accounts.set(SEEDED_ACCOUNT.id, {
    id: SEEDED_ACCOUNT.id,
    username: SEEDED_ACCOUNT.username,
    email: SEEDED_ACCOUNT.email,
    password: SEEDED_ACCOUNT.password,
    phoneE164: SEEDED_ACCOUNT.phoneE164,
    // Registered, never verified: the profile screen's "Verify" link has
    // somewhere to go, and passing the code is walkable from the seed.
    phoneVerifiedAt: null,
    displayName: SEEDED_ACCOUNT.displayName,
    localeCode: SEEDED_ACCOUNT.localeCode,
    photo: mockPhoto('avatar-lurj'),
  });

  function view(account: Account): DinerProfileView {
    return {
      dinerUserId: account.id,
      username: account.username,
      email: account.email,
      phoneE164: account.phoneE164,
      phoneVerified: account.phoneVerifiedAt !== null,
      displayName: account.displayName,
      localeCode: account.localeCode,
      hasPassword: account.password !== null,
      photo: account.photo,
    };
  }

  function byId(accountId: string): Account {
    const account = accounts.get(accountId);
    if (!account) throw new InvalidCredentialsError({ url: `${URL_TAG}/api/diner/me` });
    return account;
  }

  function usernameTaken(username: string, except?: string): boolean {
    return [...accounts.values()].some((a) => a.id !== except && a.username === username);
  }

  function emailTaken(email: string, except?: string): boolean {
    return [...accounts.values()].some((a) => a.id !== except && a.email === email);
  }

  return {
    profile(accountId) {
      const account = accounts.get(accountId);
      return account ? view(account) : null;
    },

    register(command) {
      const url = `${URL_TAG}/api/auth/diner/register`;
      // Validation first, then uniqueness, in the field order of the form —
      // the same order a server that validates the body before touching the
      // table would report them in.
      const username = checkUsername(url, command.username);
      const email = checkEmail(url, command.email);
      const password = checkPassword(url, 'password', command.password, { username, email });
      const phoneE164 = checkPhone(url, command.phoneE164);
      const displayName = checkDisplayName(url, command.displayName);

      if (usernameTaken(username)) throw new UsernameTakenError({ url });
      if (emailTaken(email)) throw new EmailTakenError({ url });
      if ([...accounts.values()].some((a) => a.phoneE164 === phoneE164)) {
        throw new PhoneInUseError({ url });
      }

      const id = `diner-${sequence++}`;
      accounts.set(id, {
        id,
        username,
        email,
        password,
        phoneE164,
        // Not verified by registering. Only the code does that.
        phoneVerifiedAt: null,
        displayName,
        localeCode: command.localeCode ?? 'en',
        photo: null,
      });
      return id;
    },

    login(command) {
      const url = `${URL_TAG}/api/auth/diner/login`;
      const identifier = command.identifier.trim().toLowerCase();
      const t = now().getTime();

      const recent = (misses.get(identifier) ?? []).filter((at) => t - at < LOGIN_WINDOW_MS);
      if (recent.length >= LOGIN_MAX_ATTEMPTS) throw new TooManyAttemptsError({ url });

      const account = [...accounts.values()].find(
        (a) => a.username === identifier || a.email === identifier,
      );
      // One answer for an unknown identifier, a wrong password and an account
      // with no password yet — so the form cannot be used to ask who exists.
      if (!account || account.password === null || account.password !== command.password) {
        recent.push(t);
        misses.set(identifier, recent);
        throw new InvalidCredentialsError({ url });
      }

      misses.delete(identifier);
      if (command.localeCode) account.localeCode = command.localeCode;
      return account.id;
    },

    update(accountId, command) {
      const url = `${URL_TAG}/api/diner/me`;
      const account = byId(accountId);

      // Everything checked before anything changes, so a refused email does
      // not leave a changed name behind it.
      const next: Partial<Pick<Account, 'username' | 'email' | 'displayName'>> = {};
      if (command.username !== undefined) {
        const username = checkUsername(url, command.username);
        if (usernameTaken(username, account.id)) throw new UsernameTakenError({ url });
        next.username = username;
      }
      if (command.email !== undefined) {
        const email = checkEmail(url, command.email);
        if (emailTaken(email, account.id)) throw new EmailTakenError({ url });
        next.email = email;
      }
      if (command.displayName !== undefined) {
        next.displayName = checkDisplayName(url, command.displayName);
      }

      Object.assign(account, next);
      return view(account);
    },

    setPassword(accountId, command) {
      const url = `${URL_TAG}/api/diner/me/password`;
      const account = byId(accountId);
      if (account.password !== null && command.currentPassword !== account.password) {
        throw new InvalidCredentialsError({ url });
      }
      account.password = checkPassword(url, 'newPassword', command.newPassword, account);
    },

    setPhoto(accountId, seed) {
      const account = byId(accountId);
      account.photo = mockPhoto(`avatar-${account.id}-${seed}`);
      return account.photo;
    },

    removePhoto(accountId) {
      byId(accountId).photo = null;
    },

    remove(accountId) {
      accounts.delete(accountId);
    },

    passwordMatches(accountId, password) {
      const account = accounts.get(accountId);
      return account !== undefined && account.password !== null && account.password === password;
    },

    verifyPhone(phoneE164, localeCode, callerAccountId) {
      const existing = [...accounts.values()].find((a) => a.phoneE164 === phoneE164);
      const t = now().getTime();
      if (existing) {
        // As the server: proving the number anonymously on an account that
        // never verified it evicts a squatter's password; its own session keeps it.
        if (existing.phoneVerifiedAt === null && callerAccountId !== existing.id) {
          existing.password = null;
        }
        existing.phoneVerifiedAt ??= t;
        if (localeCode) existing.localeCode = localeCode;
        return { accountId: existing.id, isNewAccount: false };
      }
      const id = `diner-${sequence++}`;
      accounts.set(id, {
        id,
        username: null,
        email: null,
        password: null,
        phoneE164,
        phoneVerifiedAt: t,
        displayName: null,
        localeCode: localeCode ?? 'en',
        photo: null,
      });
      return { accountId: id, isNewAccount: true };
    },
  };
}
