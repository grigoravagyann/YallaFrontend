/**
 * The short code printed under the QR on each table.
 *
 * Derived from the table id so the mock needs no extra fixture file and so the
 * same table always has the same code across reloads. A real deployment mints
 * these server-side when a venue is onboarded; the shape is what matters here.
 *
 * The alphabet omits `0`, `O`, `1` and `I`. Someone typing the fallback code is
 * reading it off a sticker at a bad angle in a dim room, and those four are
 * where that goes wrong.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/** FNV-1a, 32-bit. Not a hash for security — just a stable spread. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function mockTableCode(tableId: string): string {
  let h = hash(tableId);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += ALPHABET[h % ALPHABET.length] ?? ALPHABET[0];
    h = Math.imul(h ^ (h >>> 7), 0x01000193) >>> 0;
  }
  return out;
}

/** How the code is printed on the table: grouped, because it gets read aloud. */
export function formatTableCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** Undo any grouping or lower-casing a human introduced. */
export function normalizeTableCode(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}
