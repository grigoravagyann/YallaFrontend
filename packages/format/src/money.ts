import { FractionalDramError } from './errors';
import { intlTag, type Locale } from './locale';

/** U+058F ARMENIAN DRAM SIGN. */
const DRAM_SIGN = '֏';
/** U+00A0 NO-BREAK SPACE — the amount and its sign must never wrap apart. */
const NBSP = ' ';

/**
 * `Intl.NumberFormat` construction is not free and these formatters are hit once
 * per line item per render, so they are memoised per locale.
 */
const formatterCache = new Map<Locale, Intl.NumberFormat>();

function dramFormatter(locale: Locale): Intl.NumberFormat {
  const cached = formatterCache.get(locale);
  if (cached) return cached;

  const created = new Intl.NumberFormat(intlTag(locale), {
    style: 'currency',
    currency: 'AMD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    // Armenian's CLDR data sets minimumGroupingDigits=2, so `hy` would render a
    // four-digit bill as "5610". Forcing grouping keeps a total legible at a
    // glance and identical in shape across all three languages.
    useGrouping: 'always',
  });

  formatterCache.set(locale, created);
  return created;
}

/**
 * The thousands separator where it is ours rather than the runtime's: a
 * no-break space in Armenian and Russian, "1 400 ֏" (public-page HANDOFF §3).
 *
 * Not left to `Intl`, because what `Intl` says depends on the locale data the
 * runtime ships rather than on the locale asked for. Headless Chromium carries
 * no Armenian data and falls back to the root locale's comma ("1,200 ֏"), and an
 * engine that predates `useGrouping: 'always'` drops the group from a
 * four-digit Armenian amount altogether ("5610"). English keeps its own comma
 * from `Intl` ("5,610 ֏"), deliberately: it is the convention an English
 * reader expects, and every runtime has English data.
 */
const GROUP_SEPARATOR: Readonly<Record<Locale, string | null>> = {
  hy: NBSP,
  ru: NBSP,
  en: null,
};

function assertWholeDram(amount: number): void {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new FractionalDramError(amount);
  }
}

/** "1234567" → "1 234 567", in threes from the right. */
function groupThousands(digits: string, separator: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return groups.join(separator);
}

/** The amount without its sign: the digits and minus sign from `Intl`, the grouping as above. */
function amountText(amount: number, locale: Locale): string {
  // -0 (a rounded refund of nothing) is zero, never "-0".
  const parts = dramFormatter(locale).formatToParts(amount === 0 ? 0 : amount);
  const separator = GROUP_SEPARATOR[locale];

  if (separator === null) {
    return parts
      .filter((part) => part.type !== 'currency' && part.type !== 'literal')
      .map((part) => part.value)
      .join('');
  }

  const sign = parts
    .filter((part) => part.type === 'minusSign')
    .map((part) => part.value)
    .join('');
  const digits = parts
    .filter((part) => part.type === 'integer')
    .map((part) => part.value)
    .join('');
  return `${sign}${groupThousands(digits, separator)}`;
}

/**
 * Format a whole-integer dram amount: `1 400 ֏` in hy and ru, `1,400 ֏` in en.
 *
 * The digits and the minus sign come from `Intl.NumberFormat`; the grouping in
 * hy and ru and the position of the currency sign are ours. `en` would
 * otherwise render `֏5,610`, and dram is written after the amount in Armenia
 * regardless of the UI language.
 *
 * @throws {FractionalDramError} if `amount` is not a finite integer.
 */
export function formatDram(amount: number, locale: Locale): string {
  assertWholeDram(amount);
  return `${amountText(amount, locale)}${NBSP}${DRAM_SIGN}`;
}

/**
 * Format an amount without its currency sign, for table cells and inputs that
 * carry the unit in a column header instead of on every row.
 */
export function formatDramAmount(amount: number, locale: Locale): string {
  assertWholeDram(amount);
  return amountText(amount, locale);
}

export { DRAM_SIGN };
