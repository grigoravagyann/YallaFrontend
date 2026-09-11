/**
 * Getting a usable code out of whatever the camera decoded, or somebody typed.
 *
 * Two different things arrive through the same camera and must not be
 * confused, because they go to two different endpoints:
 *
 * - **A table's QR sticker** — the console prints the table's raw token, and a
 *   `https://yalla.am/t/<token>` link resolves to the same thing. That goes to
 *   `POST /api/tabs/open`.
 * - **A host's invitation** — the QR on the host's screen and the link in a
 *   group chat, `https://yalla.am/join/<token>` (older builds of the server
 *   sent `…/join?token=<token>`). That goes to `POST /api/tabs/join`. Feeding
 *   one of these to the table scan, which is what used to happen, can only ever
 *   answer "no table has that code".
 * - **The diner's own booking code** — the six characters on their booking,
 *   "DFJFQY", which they read off their own screen and typed here because it is
 *   the only code they were given. That goes to `POST /api/tabs/open-by-booking`
 *   and opens the tab on the table they booked. Sent to the table scan, which
 *   is what used to happen, it could only ever answer "no table has that code".
 *
 * Deliberately the *only* client-side parsing of a code. The client never
 * validates a token's shape or decides that something is not a table before
 * asking. And it never changes a token's **case**: the sticker's token is
 * lower-case hex and invitation tokens are case-sensitive. Upper-casing typed
 * input only ever matched because a database column ignored case. The booking
 * code is the one exception, and it is not an exception to the rule so much as
 * the rule applied: the server stores and compares it upper-cased, so that is
 * its case, not a guess about one.
 */

/** Characters dropped from typed input. People add spaces, dashes and dots. */
const SEPARATORS = /[\s\-–—_.]+/g;

/**
 * The shape a booking code is generated in — six characters of
 * `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, the server's `ReservationCode.Alphabet`.
 *
 * `0`, `1`, `I`, `L` and `O` are absent from it on purpose, because the code is
 * read aloud at a door, and their absence is what makes this test safe: a
 * string containing one of them is not a code the server can ever have issued.
 *
 * This is the only shape the client decides anything from, and it can afford to
 * because a table's printed token is 32 hex characters — the two cannot be
 * mistaken for each other. Everything that is neither is still handed to the
 * table route unexamined, so the server keeps owning the token format.
 */
const BOOKING_CODE = /^[2-9A-HJKMNP-Z]{6}$/iu;

export type ScannedCode =
  | { readonly kind: 'table'; readonly code: string }
  /** The diner's own booking, upper-cased as the server stores it. */
  | { readonly kind: 'booking'; readonly code: string }
  | { readonly kind: 'invite'; readonly token: string }
  | { readonly kind: 'none' };

/**
 * What was scanned or typed, and which endpoint it is for.
 *
 * - `https://yalla.am/t/K7M2QP`           → table `K7M2QP`
 * - `yalla://t/K7M2QP`                    → table `K7M2QP`
 * - `a3f0 9c1e-5b7d` (typed)              → table `a3f09c1e5b7d`
 * - `dfj-fqy` (typed)                     → booking `DFJFQY`
 * - `https://yalla.am/join/Zx9_Ab-12`     → invite `Zx9_Ab-12`
 * - `http://host/join?token=Zx9_Ab-12`    → invite `Zx9_Ab-12`
 *
 * A link is never a booking code: the two links in the world are a table's and
 * an invitation's, and nothing sends a booking as a URL.
 */
export function parseScannedCode(raw: string): ScannedCode {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'none' };

  const looksLikeUrl = trimmed.includes('://') || trimmed.includes('/');
  if (!looksLikeUrl) {
    // Typed by hand: the token under the QR, or the code on their booking.
    // Separators go either way; case stays except where the server owns it.
    const code = trimmed.replace(SEPARATORS, '');
    if (!code) return { kind: 'none' };
    if (BOOKING_CODE.test(code)) return { kind: 'booking', code: code.toUpperCase() };
    return { kind: 'table', code };
  }

  const [beforeFragment = ''] = trimmed.split('#');
  const [path = '', query = ''] = beforeFragment.split('?');
  const segments = path.split('/').filter((segment) => segment && !segment.includes(':'));

  const tokenParam = new URLSearchParams(query).get('token');
  if (tokenParam) return { kind: 'invite', token: tokenParam };

  const joinAt = segments.lastIndexOf('join');
  const invite = joinAt !== -1 ? segments[joinAt + 1] : undefined;
  if (invite) return { kind: 'invite', token: invite };

  const tableAt = segments.lastIndexOf('t');
  const table = tableAt !== -1 ? segments[tableAt + 1] : segments[segments.length - 1];
  return table ? { kind: 'table', code: table } : { kind: 'none' };
}

/**
 * The code or token alone, for callers that only need the string.
 *
 * Returns an empty string for input with nothing usable in it, which callers
 * treat as "not a code" without a round trip.
 */
export function extractScannedCode(raw: string): string {
  const parsed = parseScannedCode(raw);
  if (parsed.kind === 'table' || parsed.kind === 'booking') return parsed.code;
  return parsed.kind === 'invite' ? parsed.token : '';
}
