/**
 * A phone number as people read it: "+374 11 22 33 44".
 *
 * Only an Armenian number is grouped — the country code, then the two-digit
 * area or operator code, then pairs, the way the artboards and the venues'
 * own cards write it. Anything else is left exactly as stored: a guessed
 * grouping for a foreign number is worse than none. A `tel:` link always
 * takes the stored E.164 value, never this.
 *
 * The public page's and the floor tablet's (live QA 2026-10-21: the rail's
 * pre-order cards wrote the number ungrouped where the page grouped it).
 */
export function formatPhone(e164: string): string {
  const match = /^\+374(\d{2})(\d{2})(\d{2})(\d{2})$/u.exec(e164);
  return match ? `+374 ${match.slice(1).join(' ')}` : e164;
}
