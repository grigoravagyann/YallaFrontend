import type { Locale } from './locale';

/**
 * The decimal separator, ours rather than the runtime's for the reason
 * `money.ts` gives: what `Intl` prints depends on the locale data the runtime
 * ships, and a headless browser without Armenian data writes "4.7" on an
 * Armenian page.
 */
const DECIMAL: Readonly<Record<Locale, string>> = { hy: ',', ru: ',', en: '.' };

/**
 * A review average to one decimal: "4,7" in hy and ru, "4.7" in en. Always one
 * decimal, so a 4 reads as the average it is ("4,0") rather than as a count.
 */
export function formatRating(rating: number, locale: Locale): string {
  return (Math.round(rating * 10) / 10).toFixed(1).replace('.', DECIMAL[locale]);
}
