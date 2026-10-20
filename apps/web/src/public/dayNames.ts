import { branchDayKey, formatTime, type Locale, type TimeZone } from '@yalla/format';
import type { TFunction } from 'i18next';
import { addDays, branchToday } from './slots';

/**
 * A branch day (`YYYY-MM-DD`) in words: "Today", "Tomorrow", "Wed 21 October".
 *
 * From our own copy rather than `Intl.DateTimeFormat`: a browser without
 * Armenian locale data (headless Chromium is one) prints `hy` weekdays and
 * months in English, the way the special days still do (public-page phase 2
 * report). The day chips are the first thing on the booking card, so they
 * carry their own words — in the genitive the Armenian and Russian dates need.
 */
export interface DayWords {
  /** "Today" or "Tomorrow" for those two days; `null` for any other. */
  readonly name: string | null;
  /** The weekday, short: "Wed". */
  readonly weekday: string;
  /** The day of the month: "21". */
  readonly day: string;
  /** "Wed 21 October" ("Չրք, 21 հոկտեմբերի"). */
  readonly date: string;
  /**
   * The date inside a sentence: the weekday in lower case where the language
   * writes it so — «…մինչև ուրբ, 23 հոկտեմբերի», «…до 15:00, пт, 23 октября»
   * (review N10); English keeps "Fri".
   */
  readonly inSentence: string;
  /** What a chip is read as, holding every word it shows: "Today, Tue 20 October". */
  readonly full: string;
  /** What a sentence says: "Today", or the date. */
  readonly short: string;
}

/**
 * `tonight`: the branch's service day while last night is still open past
 * midnight (`branchServiceToday`) — at 00:30 a bar open to 02:00 is still in
 * yesterday's night, which is "Tonight", not "Today" (that is the calendar's).
 */
export function dayWords(dateKey: string, today: string, t: TFunction, tonight?: string): DayWords {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = t(`booking.weekday.${weekdayIndex}`, { ns: 'public' });
  const monthName = t(`booking.month.${month}`, { ns: 'public' });
  const date = t('booking.date', { ns: 'public', weekday, day: String(day), month: monthName });
  const inSentence = t('booking.date', {
    ns: 'public',
    weekday: t(`booking.weekdayInSentence.${weekdayIndex}`, { ns: 'public' }),
    day: String(day),
    month: monthName,
  });
  const name =
    tonight !== undefined && tonight < today && dateKey === tonight
      ? t('booking.tonight', { ns: 'public' })
      : dateKey === today
        ? t('booking.today', { ns: 'public' })
        : dateKey === addDays(today, 1)
          ? t('booking.tomorrow', { ns: 'public' })
          : null;
  return {
    name,
    weekday,
    day: String(day),
    date,
    inSentence,
    full: name ? t('booking.dayNamed', { ns: 'public', name, date }) : date,
    short: name ?? date,
  };
}

/** The branch day an instant falls on, in words, against the branch's today. */
export function instantDayWords(
  instant: string | Date,
  timeZoneId: TimeZone,
  t: TFunction,
  now: Date = new Date(),
): DayWords {
  return dayWords(branchDayKey(instant, timeZoneId), branchToday(timeZoneId, now), t);
}

/** "Tomorrow, Wed 21 October · 19:30": when a booking is, in the branch's zone. */
export function whenWords(
  instant: string | Date,
  timeZoneId: TimeZone,
  locale: Locale,
  t: TFunction,
  now: Date = new Date(),
): string {
  const day = instantDayWords(instant, timeZoneId, t, now);
  return `${day.full} · ${formatTime(instant, timeZoneId, locale)}`;
}

/**
 * The free-cancellation line, the date in our words (public-page phase 4).
 *
 * The rule is `freeCancellationCopy`'s — the time alone today, the date
 * otherwise, and once it has passed only that it has — with "tomorrow" said
 * as a word and any later day as the booking card writes it. `Intl` printed
 * «…մինչև Oct 21, 2026, 15:00» on the hy page.
 */
export function freeCancellationWords(
  untilUtc: string,
  timeZoneId: TimeZone,
  locale: Locale,
  t: TFunction,
  now: Date = new Date(),
): string {
  const deadline = new Date(untilUtc);
  if (deadline.getTime() <= now.getTime()) {
    return t('table.freeCancellationPassed', { ns: 'diner' });
  }
  const time = formatTime(deadline, timeZoneId, locale);
  const today = branchToday(timeZoneId, now);
  const day = branchDayKey(deadline, timeZoneId);
  if (day === today) return t('table.freeCancellation', { ns: 'diner', time });
  if (day === addDays(today, 1)) {
    return t('sheet.freeCancellationTomorrow', { ns: 'public', time });
  }
  const date = dayWords(day, today, t).inSentence;
  return t('sheet.freeCancellationOn', { ns: 'public', time, date });
}

/**
 * The free-cancellation line with its date always named — for the calendar
 * file, which is read on other days than the one it was saved on: "tomorrow"
 * there goes stale overnight, and "until 15:00" alone names no day at all
 * (review S1). Never "has passed" either: the file outlives that too.
 */
export function freeCancellationDated(
  untilUtc: string,
  timeZoneId: TimeZone,
  locale: Locale,
  t: TFunction,
): string {
  const deadline = new Date(untilUtc);
  const day = branchDayKey(deadline, timeZoneId);
  const date = dayWords(day, day, t).inSentence;
  return t('sheet.freeCancellationOn', {
    ns: 'public',
    time: formatTime(deadline, timeZoneId, locale),
    date,
  });
}
