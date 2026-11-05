import { intlTag, type Locale } from './locale';

/**
 * Calendar days by name — "Fri, 4 Nov", «Пт, 4 нояб.», «Ուրբ, 4 նոյ» — for a
 * `YYYY-MM-DD` with no zone to move it: a service day, a shift's date, a
 * report's range, a special opening day.
 *
 * Armenian is written from our own words. A Chromium that ships no Armenian
 * locale data answers `hy-AM` with ICU's root pattern, and the console read
 * "M11 1–4" over a report and "M10 30, Fri" over the evening. Node's full ICU
 * hides it from tests, so the Armenian branch never touches `Intl` at all.
 * The other two languages are left to `Intl`, which every browser carries for
 * them.
 */

/** Which words to print. `day` is on unless switched off. */
export interface CalendarDayStyle {
  readonly weekday?: 'short' | 'long';
  readonly month?: 'short' | 'long';
  readonly day?: boolean;
  readonly year?: boolean;
}

/** In the genitive, the case a date is written in: «4 նոյեմբերի». */
const HY_MONTHS_LONG = [
  'հունվարի',
  'փետրվարի',
  'մարտի',
  'ապրիլի',
  'մայիսի',
  'հունիսի',
  'հուլիսի',
  'օգոստոսի',
  'սեպտեմբերի',
  'հոկտեմբերի',
  'նոյեմբերի',
  'դեկտեմբերի',
] as const;

/** Standing alone, as a chart's axis names a month: «Նոյեմբեր». */
const HY_MONTHS_STANDALONE = [
  'Հունվար',
  'Փետրվար',
  'Մարտ',
  'Ապրիլ',
  'Մայիս',
  'Հունիս',
  'Հուլիս',
  'Օգոստոս',
  'Սեպտեմբեր',
  'Հոկտեմբեր',
  'Նոյեմբեր',
  'Դեկտեմբեր',
] as const;

const HY_MONTHS_SHORT = [
  'հնվ',
  'փտվ',
  'մրտ',
  'ապր',
  'մյս',
  'հնս',
  'հլս',
  'օգս',
  'սեպ',
  'հոկ',
  'նոյ',
  'դեկ',
] as const;

const HY_WEEKDAYS_SHORT = ['Կիր', 'Երկ', 'Երք', 'Չրք', 'Հնգ', 'Ուրբ', 'Շբթ'] as const;
const HY_WEEKDAYS_LONG = [
  'Կիրակի',
  'Երկուշաբթի',
  'Երեքշաբթի',
  'Չորեքշաբթի',
  'Հինգշաբթի',
  'Ուրբաթ',
  'Շաբաթ',
] as const;

interface DayParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

/** `YYYY-MM-DD` as numbers, or null for anything else. */
function parse(dateKey: string): DayParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/** Noon UTC, so no zone on earth moves it to another day. */
function noon(parts: DayParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

function hyDay(parts: DayParts, style: CalendarDayStyle): string {
  const words: string[] = [];
  if (style.day !== false) words.push(String(parts.day));
  if (style.month) {
    words.push((style.month === 'long' ? HY_MONTHS_LONG : HY_MONTHS_SHORT)[parts.month - 1]!);
  }
  if (style.year) words.push(String(parts.year));
  const date = words.join(' ');
  if (!style.weekday) return date;
  const weekday = (style.weekday === 'long' ? HY_WEEKDAYS_LONG : HY_WEEKDAYS_SHORT)[parts.weekday]!;
  return date ? `${weekday}, ${date}` : weekday;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function intlFormatter(locale: Locale, style: CalendarDayStyle): Intl.DateTimeFormat {
  const key = `${locale}|${style.weekday ?? ''}|${style.month ?? ''}|${style.day === false ? '' : 'd'}|${style.year ? 'y' : ''}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlTag(locale), {
      ...(style.weekday ? { weekday: style.weekday } : {}),
      ...(style.month ? { month: style.month } : {}),
      ...(style.day === false ? {} : { day: 'numeric' }),
      ...(style.year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * One calendar day by name. An unreadable key is returned as it came, so a
 * screen never throws over a date.
 */
export function formatCalendarDay(
  dateKey: string,
  locale: Locale,
  style: CalendarDayStyle = { month: 'short' },
): string {
  const parts = parse(dateKey);
  if (!parts) return dateKey;
  if (locale === 'hy') return hyDay(parts, style);
  return intlFormatter(locale, style).format(noon(parts));
}

/**
 * Two calendar days as a range: "1–4 Nov", "30 Oct – 4 Nov", «1–4 նոյ». The
 * same day twice is printed once. Armenian collapses a shared month the way
 * `Intl.DateTimeFormat.formatRange` does for the other two.
 */
export function formatCalendarDayRange(
  from: string,
  to: string,
  locale: Locale,
  style: CalendarDayStyle = { month: 'short' },
): string {
  if (from === to) return formatCalendarDay(from, locale, style);
  const start = parse(from);
  const end = parse(to);
  if (!start || !end) return `${from} – ${to}`;
  if (locale === 'hy') {
    const sameMonth = start.year === end.year && start.month === end.month;
    if (sameMonth && !style.weekday && style.day !== false) {
      // «1–4 նոյ»: the day numbers share the month's word and the year.
      return hyDay({ ...end, day: NaN }, style).replace('NaN', `${start.day}–${end.day}`);
    }
    return `${hyDay(start, style)} – ${hyDay(end, style)}`;
  }
  return intlFormatter(locale, style).formatRange(noon(start), noon(end));
}

/**
 * A month's name on its own — a chart axis, a heading — capitalised as a
 * label is: "November", «Ноябрь», «Նոյեմբեր».
 */
export function formatMonthName(month: number, locale: Locale): string {
  if (month < 1 || month > 12 || !Number.isInteger(month)) return String(month);
  if (locale === 'hy') return HY_MONTHS_STANDALONE[month - 1]!;
  const name = new Intl.DateTimeFormat(intlTag(locale), { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, month - 1, 15, 12)),
  );
  return name.charAt(0).toLocaleUpperCase(intlTag(locale)) + name.slice(1);
}
