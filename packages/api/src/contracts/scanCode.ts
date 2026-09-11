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
 *
 * Deliberately the *only* client-side parsing of a code. The client never
 * validates a token's shape or decides that something is not a table before
 * asking. And it never changes a token's **case**: the sticker's token is
 * lower-case hex and invitation tokens are case-sensitive. Upper-casing typed
 * input only ever matched because a database column ignored case.
 */

/** Characters dropped from typed input. People add spaces, dashes and dots. */
const SEPARATORS = /[\s\-–—_.]+/g;

export type ScannedCode =
  | { readonly kind: 'table'; readonly code: string }
  | { readonly kind: 'invite'; readonly token: string }
  | { readonly kind: 'none' };

/**
 * What was scanned or typed, and which endpoint it is for.
 *
 * - `https://yalla.am/t/K7M2QP`           → table `K7M2QP`
 * - `yalla://t/K7M2QP`                    → table `K7M2QP`
 * - `a3f0 9c1e-5b7d` (typed)              → table `a3f09c1e5b7d`
 * - `https://yalla.am/join/Zx9_Ab-12`     → invite `Zx9_Ab-12`
 * - `http://host/join?token=Zx9_Ab-12`    → invite `Zx9_Ab-12`
 */
export function parseScannedCode(raw: string): ScannedCode {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'none' };

  const looksLikeUrl = trimmed.includes('://') || trimmed.includes('/');
  if (!looksLikeUrl) {
    // Typed by hand: the code printed under the QR. Separators go, case stays.
    const code = trimmed.replace(SEPARATORS, '');
    return code ? { kind: 'table', code } : { kind: 'none' };
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
  return parsed.kind === 'table' ? parsed.code : parsed.kind === 'invite' ? parsed.token : '';
}
