/**
 * Getting a usable code out of whatever the camera decoded.
 *
 * A QR sticker on a table encodes a full https URL, so that a phone without the
 * app — or a phone whose camera app grabs it before we do — still lands
 * somewhere useful. What the backend wants is the last segment of that URL, and
 * the app has to reduce one to the other.
 *
 * Deliberately the *only* client-side parsing of a code. Everything past this
 * point is the backend's format to change: the client never validates a code's
 * shape, never checks a checksum, and never decides that something is not a
 * table before asking.
 */

/** Characters dropped from typed input. People add spaces, dashes and dots. */
const SEPARATORS = /[\s\-–—_.]+/g;

/**
 * Reduce a scanned or typed string to the code to send.
 *
 * - `https://yalla.am/t/K7M2QP` → `K7M2QP`
 * - `yalla://t/K7M2QP`          → `K7M2QP`
 * - `https://yalla.am/join/inv_9?x=1#y` → `inv_9`
 * - `k7m 2-qp` (typed)          → `K7M2QP`
 *
 * Returns an empty string for input with nothing usable in it, which callers
 * treat as "not a code" without a round trip.
 */
export function extractScannedCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const looksLikeUrl = trimmed.includes('://') || trimmed.includes('/');
  if (!looksLikeUrl) {
    // Typed by hand. Strip the separators people naturally add, and upper-case:
    // table codes are printed in caps and nobody types them that way.
    return trimmed.replace(SEPARATORS, '').toUpperCase();
  }

  const withoutQuery = trimmed.split('?')[0]?.split('#')[0] ?? '';
  const segments = withoutQuery.split('/').filter((segment) => segment && !segment.includes(':'));
  const last = segments[segments.length - 1] ?? '';
  // A code lifted from a URL is left exactly as it was published. Invite tokens
  // are case-sensitive and upper-casing one would break it.
  return last;
}
