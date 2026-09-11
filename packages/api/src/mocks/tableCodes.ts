/**
 * The token printed under the QR on each table.
 *
 * Thirty-two lower-case hex characters, which is what a real table carries:
 * `DiningTables.QrToken`, matched by the server after a trim and a lower-case
 * and nothing else. Derived from the table id so the mock needs no extra
 * fixture file and so the same table always has the same token across reloads.
 *
 * It used to be six characters of a readable alphabet — a shape no deployed
 * table has ever had. That is not a harmless simplification: six characters is
 * also the shape of a *booking* code, so the mock was the one place in the
 * world where those two things were indistinguishable, and any rule written to
 * tell them apart would have looked broken here and nowhere else.
 */

/** FNV-1a, 32-bit. Not a hash for security — just a stable spread. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Four 32-bit words, eight hex characters each. */
const WORDS = 4;

export function mockTableCode(tableId: string): string {
  let h = hash(tableId);
  let out = '';
  for (let i = 0; i < WORDS; i += 1) {
    out += h.toString(16).padStart(8, '0');
    h = Math.imul(h ^ (h >>> 7), 0x01000193) >>> 0;
  }
  return out;
}

/**
 * Grouped for checking against the sticker without losing your place.
 *
 * Nobody reads a token of this length aloud — it is typed, or scanned — so the
 * grouping is for the eye, and every separator it adds is dropped again on the
 * way back in.
 */
export function formatTableCode(code: string): string {
  return code.match(/.{1,8}/gu)?.join(' ') ?? code;
}

/** Undo any grouping or capitals a human introduced, as the server does. */
export function normalizeTableCode(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toLowerCase();
}
