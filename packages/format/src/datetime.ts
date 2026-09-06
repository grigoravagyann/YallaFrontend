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

/** A wall-clock reading, with no zone attached until one is supplied. */
export interface ZonedClock {
  readonly year: number;
  /** 1-12, as a person writes it — not `Date`'s 0-11. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const utcOffsetCache = new Map<string, Intl.DateTimeFormat>();

/** Minutes east of UTC for `timeZone` at `instant`. */
function offsetMinutesAt(instant: Date, timeZone: TimeZone): number {
  let formatter = utcOffsetCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' });
    utcOffsetCache.set(timeZone, formatter);
  }
  const name =
    formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(name);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * The instant at which a branch's clock reads a given wall-clock time.
 *
 * The inverse of every other function here, and the one the opening-hours
 * arithmetic needs: "this branch shuts at 23:00 local" has to become an instant
 * before it can be compared with now or handed to `formatTime`.
 *
 * Two passes, not one. The offset depends on the instant, and the instant is
 * what is being solved for — so the first pass guesses with the offset at the
 * naive UTC reading and the second corrects it with the offset that actually
 * applies there. That converges for every real zone, including the hour after a
 * clock change, where the naive guess can land on the wrong side of it.
 *
 * A wall-clock time that does not exist (the skipped hour in spring) resolves
 * to the instant the clock jumps to, and one that happens twice (the repeated
 * hour in autumn) resolves to the first. Both are the conventional readings and
 * both are what a venue means when it writes an opening time down.
 */
export function instantFromZonedClock(clock: ZonedClock, timeZone: TimeZone): Date {
  const naive = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, 0, 0);
  const firstGuess = new Date(naive - offsetMinutesAt(new Date(naive), timeZone) * 60_000);
  return new Date(naive - offsetMinutesAt(firstGuess, timeZone) * 60_000);
}
