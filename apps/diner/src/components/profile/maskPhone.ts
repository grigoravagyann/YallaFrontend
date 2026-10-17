/** Calling codes the app's diners have, longest first where one prefixes another. */
const KNOWN_CODES = ['374', '7'] as const;

/**
 * A phone number with its middle hidden — `+374 •• ••• •23` — for the
 * Profile card, which is read over a shoulder at the table as often as alone.
 *
 * The calling code and the last two digits stay, enough for the diner to know
 * which of their numbers this is. Anything too short to be a number comes back
 * as it was.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/gu, '');
  if (digits.length < 7) return e164;
  const code =
    KNOWN_CODES.find((known) => digits.startsWith(known)) ??
    digits.slice(0, Math.min(3, Math.max(1, digits.length - 8)));
  const national = digits.slice(code.length);
  const hidden = '•'.repeat(national.length - 2) + national.slice(-2);
  const groups = [hidden.slice(0, 2), hidden.slice(2, 5), hidden.slice(5)].filter(Boolean);
  return `+${code} ${groups.join(' ')}`;
}
