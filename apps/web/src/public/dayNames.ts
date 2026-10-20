import type { TFunction } from 'i18next';
import { addDays } from './slots';

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
  /** What a chip is read as, holding every word it shows: "Today, Tue 20 October". */
  readonly full: string;
  /** What a sentence says: "Today", or the date. */
  readonly short: string;
}

export function dayWords(dateKey: string, today: string, t: TFunction): DayWords {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = t(`booking.weekday.${weekdayIndex}`, { ns: 'public' });
  const date = t('booking.date', {
    ns: 'public',
    weekday,
    day: String(day),
    month: t(`booking.month.${month}`, { ns: 'public' }),
  });
  const name =
    dateKey === today
      ? t('booking.today', { ns: 'public' })
      : dateKey === addDays(today, 1)
        ? t('booking.tomorrow', { ns: 'public' })
        : null;
  return {
    name,
    weekday,
    day: String(day),
    date,
    full: name ? t('booking.dayNamed', { ns: 'public', name, date }) : date,
    short: name ?? date,
  };
}
