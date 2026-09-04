import { intlTag, type Locale } from './locale';

const relativeCache = new Map<Locale, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: Locale): Intl.RelativeTimeFormat {
  const cached = relativeCache.get(locale);
  if (cached) return cached;

  const created = new Intl.RelativeTimeFormat(intlTag(locale), {
    numeric: 'always',
    style: 'short',
  });

  relativeCache.set(locale, created);
  return created;
}

/**
 * Format an offset in minutes relative to now, e.g. `6 min. ago` / `in 6 min.`.
 *
 * Negative is the past, positive the future — the sign convention of
 * `Intl.RelativeTimeFormat`, which does the pluralisation. Armenian and Russian
 * both have plural rules English does not, so this must never be assembled by
 * hand.
 *
 * Note that a full sentence like "late by 6 min" is *not* built here: the
 * wording is translated copy and lives in `@yalla/i18n`, which interpolates
 * {@link formatDuration} for the quantity.
 */
export function formatRelativeMinutes(minutes: number, locale: Locale): string {
  if (!Number.isFinite(minutes)) {
    throw new RangeError(`formatRelativeMinutes received a non-finite value: ${minutes}`);
  }

  const whole = Math.trunc(minutes);

  // Past an hour, minutes stop being readable ("in 214 min.").
  if (Math.abs(whole) >= 60) {
    return relativeFormatter(locale).format(Math.trunc(whole / 60), 'hour');
  }

  return relativeFormatter(locale).format(whole, 'minute');
}

const unitCache = new Map<string, Intl.NumberFormat>();

function unitFormatter(locale: Locale, unit: 'hour' | 'minute'): Intl.NumberFormat {
  const key = `${locale}|${unit}`;
  const cached = unitCache.get(key);
  if (cached) return cached;

  const created = new Intl.NumberFormat(intlTag(locale), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  });

  unitCache.set(key, created);
  return created;
}

const listCache = new Map<Locale, Intl.ListFormat>();

function listFormatter(locale: Locale): Intl.ListFormat {
  const cached = listCache.get(locale);
  if (cached) return cached;

  const created = new Intl.ListFormat(intlTag(locale), { style: 'narrow', type: 'unit' });
  listCache.set(locale, created);
  return created;
}

/**
 * Format a positive span of minutes, e.g. `35 min`, `1 hr, 35 min`, `2 hr`.
 *
 * Built from `Intl.NumberFormat` unit styles joined by `Intl.ListFormat` rather
 * than `Intl.DurationFormat`, which is not in the TypeScript ES2023 lib and
 * would force the whole workspace onto `lib: ESNext` for one function.
 *
 * @param minutes Whole minutes. Negative input is treated as zero — callers
 * wanting a signed value want {@link formatRelativeMinutes}.
 */
export function formatDuration(minutes: number, locale: Locale): string {
  if (!Number.isFinite(minutes)) {
    throw new RangeError(`formatDuration received a non-finite value: ${minutes}`);
  }

  const total = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) return unitFormatter(locale, 'minute').format(mins);
  if (mins === 0) return unitFormatter(locale, 'hour').format(hours);

  return listFormatter(locale).format([
    unitFormatter(locale, 'hour').format(hours),
    unitFormatter(locale, 'minute').format(mins),
  ]);
}

/**
 * Whole minutes between two instants, rounded toward zero.
 *
 * Positive means `later` is after `earlier`. Feed the result to
 * {@link formatDuration} or {@link formatRelativeMinutes} — this returns a number
 * so that the "how late is this booking" threshold logic stays testable and out
 * of the formatting layer.
 */
export function minutesBetween(
  earlier: Date | string | number,
  later: Date | string | number,
): number {
  const from = earlier instanceof Date ? earlier : new Date(earlier);
  const to = later instanceof Date ? later : new Date(later);
  return Math.trunc((to.getTime() - from.getTime()) / 60_000);
}
