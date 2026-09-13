/**
 * What the sign-up and log-in forms accept, as pure functions.
 *
 * The backend verifies a phone number and nothing else; the name and the
 * email never leave the phone. So these rules are the app's own, kept small
 * and permissive: a number is rejected only when no SMS could reach it, an
 * email only when no mail could.
 */

/** A country code: `+` and one to four digits, the first not zero — `+374`, `+1`, `+1876`. */
const PREFIX_RE = /^\+[1-9]\d{0,3}$/u;

/** A whole international number, as the phone's autofill or a paste supplies it. */
const E164_RE = /^\+[1-9]\d{7,14}$/u;

/** Separators people type into a number that are not part of it. */
const SEPARATORS_RE = /[\s().-]/gu;

const LOCAL_MIN_DIGITS = 6;
const LOCAL_MAX_DIGITS = 12;

/**
 * A simple, permissive check: something, an `@`, something, a dot, something.
 * Enough to catch a typo like `ani@gmail` without refusing a real address.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const EMAIL_MAX_LENGTH = 254;

const NAME_MAX_LENGTH = 60;

/**
 * The country code and the local number as one E.164 string, or `null` when
 * either half cannot be one.
 *
 * Spaces, dashes and brackets in the local number are dropped — `77 123 456`
 * is how people write it — and so is one national trunk zero, since `077`
 * with `+374` is the same number as `77`. Anything else that is not a digit
 * makes the number invalid rather than being silently discarded.
 *
 * A local field that itself starts with `+` or `00` is a complete
 * international number (Android's autofill puts the whole thing there) and
 * is taken as such; the country-code field is ignored for it.
 */
export function normalizePhone(prefix: string, local: string): string | null {
  const typed = local.replace(SEPARATORS_RE, '');

  if (typed.startsWith('+') || typed.startsWith('00')) {
    const whole = typed.startsWith('00') ? `+${typed.slice(2)}` : typed;
    return E164_RE.test(whole) ? whole : null;
  }

  const code = prefix.replace(/\s/gu, '');
  if (!PREFIX_RE.test(code)) return null;

  if (!/^\d+$/u.test(typed)) return null;
  const digits = typed.startsWith('0') ? typed.slice(1) : typed;
  if (digits.length < LOCAL_MIN_DIGITS || digits.length > LOCAL_MAX_DIGITS) return null;

  return `${code}${digits}`;
}

/** True for anything that could be an email address, after trimming. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(trimmed);
}

/**
 * The name the venue will use, tidied: composed to NFC (so a name typed with
 * combining marks compares equal to the same name typed precomposed),
 * invisible format characters dropped, trimmed, inner runs of whitespace
 * collapsed to one space, 1–60 characters. `null` when nothing is left.
 */
export function normalizeName(value: string): string | null {
  const tidy = value
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ');
  if (tidy.length === 0 || tidy.length > NAME_MAX_LENGTH) return null;
  return tidy;
}

/**
 * The server's username rule, repeated so the form can refuse before sending:
 * 3–30 of `a-z`, `0-9`, `.` and `_`, starting with a letter or digit. The
 * server stores it lowercased, so this lowercases first — `Ani` is `ani`.
 */
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,29}$/u;

export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/** The username as the server will store it, or `null` when it breaks the rule. */
export function normalizeUsername(value: string): string | null {
  const tidy = value.trim().toLowerCase();
  return USERNAME_RE.test(tidy) ? tidy : null;
}

/** The email as the server will store it: trimmed and lowercased. `null` when it is not one. */
export function normalizeEmail(value: string): string | null {
  const tidy = value.trim().toLowerCase();
  return isValidEmail(tidy) ? tidy : null;
}

/**
 * 8–128 characters. The server also refuses a password equal to the username
 * or the email; that arrives as a `ValidationError` on the password field and
 * is shown where it belongs, so it is not repeated here.
 */
export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}
