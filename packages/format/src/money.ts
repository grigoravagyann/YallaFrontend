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

function assertWholeDram(amount: number): void {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new FractionalDramError(amount);
  }
}

/**
 * Format a whole-integer dram amount, e.g. `5,610 ֏`.
 *
 * The digits, grouping separator and minus sign all come from `Intl.NumberFormat`
 * — never from string building. Only the position of the currency sign is ours:
 * `en` would otherwise render `֏5,610`, and dram is written after the amount in
 * Armenia regardless of the UI language.
 *
 * @throws {FractionalDramError} if `amount` is not a finite integer.
 */
export function formatDram(amount: number, locale: Locale): string {
  assertWholeDram(amount);

  const parts = dramFormatter(locale).formatToParts(amount);
  const digits = parts
    .filter((part) => part.type !== 'currency' && part.type !== 'literal')
    .map((part) => part.value)
    .join('');

  return `${digits}${NBSP}${DRAM_SIGN}`;
}

/**
 * Format an amount without its currency sign, for table cells and inputs that
 * carry the unit in a column header instead of on every row.
 */
export function formatDramAmount(amount: number, locale: Locale): string {
  assertWholeDram(amount);

  return dramFormatter(locale)
    .formatToParts(amount)
    .filter((part) => part.type !== 'currency' && part.type !== 'literal')
    .map((part) => part.value)
    .join('');
}

export { DRAM_SIGN };
