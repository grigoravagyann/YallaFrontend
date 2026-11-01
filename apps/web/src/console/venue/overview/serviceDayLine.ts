import type { TFunction } from 'i18next';

/**
 * The Overview header's date — "Friday, 30 October", «Пятница, 30 октября»,
 * «30 հոկտեմբերի, ուրբաթ» — for a service day written as `YYYY-MM-DD`.
 *
 * From our own copy rather than `Intl.DateTimeFormat`, the way the public
 * page's day chips are (`public/dayNames.ts`). A browser without Armenian
 * locale data — Chromium on more than one platform — has no month names for
 * `hy-AM` and prints ICU's root fallback instead: the header read
 * "M10 30, Fri · Yerevan Centre · թարմացված 13:13" on the hy console. The
 * words live in `overview.weekday`, `overview.month` and `overview.date` in
 * the admin namespace, in the case and order each language writes a date.
 *
 * The service day is a calendar date with no zone to move it — still the
 * evening's after midnight at a branch open late — so the weekday is read
 * from it as a plain UTC date, never from `new Date()`.
 */
export function serviceDayLine(serviceDate: string, t: TFunction): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(serviceDate);
  if (!match) return serviceDate;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return t('overview.date', {
    weekday: t(`overview.weekday.${weekdayIndex}`),
    day: String(day),
    month: t(`overview.month.${month}`),
  });
}
