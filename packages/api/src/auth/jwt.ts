/**
 * Read the claims out of a JWT without verifying it.
 *
 * The client never *trusts* these — the server checks the signature on every
 * request — but it does *use* them: the expiry decides when to refresh before a
 * request rather than after a 401, and the venue-user claims are how the
 * console knows who is signed in, since the backend has no `/me` endpoint.
 *
 * Hand-rolled base64url rather than `atob`: Hermes only grew `atob` recently
 * and the decoder is eleven lines.
 */
export type JwtPayload = Readonly<Record<string, unknown>>;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlDecode(input: string): string {
  const clean = input.replace(/=+$/u, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char === '+' ? '-' : char === '/' ? '_' : char);
    if (value === -1) throw new RangeError('Not base64url.');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // UTF-8 decode. TextDecoder exists on every runtime this ships to.
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(parts[1]));
    return typeof parsed === 'object' && parsed !== null ? (parsed as JwtPayload) : null;
  } catch {
    return null;
  }
}

/** The `exp` claim in epoch milliseconds, or null when absent. */
export function jwtExpiresAtMs(token: string): number | null {
  const exp = decodeJwtPayload(token)?.['exp'];
  return typeof exp === 'number' ? exp * 1000 : null;
}

export function claimString(payload: JwtPayload | null, name: string): string | null {
  const value = payload?.[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
