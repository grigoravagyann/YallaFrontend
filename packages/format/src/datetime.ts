import { intlTag, type Locale, type TimeZone } from './locale';

/**
 * Anything accepted as an instant. ISO-8601 strings are what the backend sends;
 * `Date` and epoch millis are accepted so callers need not convert first.
 */
export type Instant = Date | string | number;

export class InvalidInstantError extends Error {
  constructor(value: Instant) {
    super(`Could not read ${JSON.stringify(value)} as a date/time.`);
    this.name = 'InvalidInstantError';
  }
}

function toDate(value: Instant): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidInstantError(value);
  return date;
}

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(locale: Locale, timeZone: TimeZone): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}`;
  const cached = timeFormatterCache.get(key);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat(intlTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });

  timeFormatterCache.set(key, created);
  return created;
}

/**
 * Format a single clock time in the branch's timezone, e.g. `19:00`.
 *
 * @param timeZone IANA zone of the branch. Never the device's — see the module note.
 */
export function formatTime(value: Instant, timeZone: TimeZone, locale: Locale): string {
  return timeFormatter(locale, timeZone).format(toDate(value));
}

/**
 * Format a booking window in the branch's timezone, e.g. `19:00 – 21:30`.
 *
 * Uses `formatRange`, so the separator and any locale-specific collapsing come
 * from ICU rather than a hardcoded dash.
 */
export function formatTimeRange(
  start: Instant,
  end: Instant,
  timeZone: TimeZone,
  locale: Locale,
): string {
  return timeFormatter(locale, timeZone).formatRange(toDate(start), toDate(end));
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** Format a calendar date in the branch's timezone, e.g. `4 Sept 2026`. */
export function formatDate(value: Instant, timeZone: TimeZone, locale: Locale): string {
  const key = `${locale}|${timeZone}`;
  let formatter = dateFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlTag(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone,
    });
    dateFormatterCache.set(key, formatter);
  }
  return formatter.format(toDate(value));
}

/**
 * The calendar day an instant falls on *in the branch's timezone*, as `YYYY-MM-DD`.
 *
 * Used for grouping bookings into service days. Doing this with `toISOString()`
 * would group by UTC day and split a Yerevan evening service in half.
 */
export function branchDayKey(value: Instant, timeZone: TimeZone): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(toDate(value));

  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}
