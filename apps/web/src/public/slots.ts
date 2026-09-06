import { nextHalfHour } from '@yalla/api';
import { branchDayKey, instantFromZonedClock, type TimeZone } from '@yalla/format';

/**
 * Date, time and party size, in the branch's clock rather than the device's.
 *
 * The hazard this module exists for is one line long: a tourist's phone is on
 * Europe/Moscow. If "today" or "20:00" is resolved with the browser's own
 * timezone, a visitor in Yerevan books a table for 19:00, and does it while
 * looking at a control that says 20:00.
 *
 * So the controls hold **wall-clock strings** — `2026-09-06` and `20:00`, both
 * of which carry no zone at all — and this module is the single place that
 * turns a pair of them into an instant, always with the branch's zone. Native
 * `<input type="date">` produces exactly that shape, which is why the page uses
 * one: on a phone it opens the platform's own date picker, and it cannot smuggle
 * a timezone in.
 */

/** Half-hourly, matching the slots the backend reasons in. */
const SLOT_MINUTES = 30;

export interface SlotSelection {
  /** `YYYY-MM-DD`, in the branch's zone. */
  readonly date: string;
  /** `HH:mm`, in the branch's zone. */
  readonly time: string;
  readonly partySize: number;
}

/** Party sizes offered. Above the top of this a party phones the venue. */
export const PARTY_SIZES: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10];

/** `YYYY-MM-DD` for the branch's current service day. */
export function branchToday(timeZoneId: TimeZone, now: Date = new Date()): string {
  return branchDayKey(now, timeZoneId);
}

/** The date `days` after a `YYYY-MM-DD` key, as another key. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** `HH:mm` wall-clock in the branch's zone for an instant. */
export function branchClock(instant: Date, timeZoneId: TimeZone): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZoneId,
  }).formatToParts(instant);
  const read = (type: 'hour' | 'minute') => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = read('hour') === '24' ? '00' : read('hour');
  return `${hour}:${read('minute')}`;
}

/**
 * The defaults the page opens on: today, the next half-hour slot, two people.
 *
 * `nextHalfHour` is the phone app's rule, imported rather than repeated, so the
 * two surfaces open on the same slot. Two people is the commonest booking by a
 * wide margin and the one that needs the least correcting.
 */
export function defaultSelection(timeZoneId: TimeZone, now: Date = new Date()): SlotSelection {
  const slot = nextHalfHour(now);
  return {
    date: branchDayKey(slot, timeZoneId),
    time: branchClock(slot, timeZoneId),
    partySize: 2,
  };
}

/** Every half hour of a day, as `HH:mm`. */
export function timeOptions(): readonly string[] {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) {
    options.push(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    );
  }
  return options;
}

/**
 * What is wrong with a selection, or `null` when nothing is.
 *
 * Named rather than boolean because the two halves have different fallbacks:
 * a missing date falls back to today, a missing time to the next half hour.
 * Mirrors `problemWith` in the reports range module — same idiom, same reason.
 */
export type SlotProblem = 'date' | 'time';

/** `YYYY-MM-DD`, and a real calendar day rather than 2026-13-45. */
function readDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Round-tripped, so 2026-02-30 is refused rather than silently becoming the
  // 2nd of March — a date control can produce one and a diner would be booking
  // a day they did not pick.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return [year, month, day];
}

/** `HH:mm` on a 24-hour clock. */
function readTime(value: string): [number, number] | null {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : [hour, minute];
}

export function slotProblem(selection: SlotSelection): SlotProblem | null {
  if (readDate(selection.date) === null) return 'date';
  if (readTime(selection.time) === null) return 'time';
  return null;
}

/**
 * The instant a selection names, resolved in the branch's zone — or `null`.
 *
 * **Null rather than a throw, and this is the whole point of the function.**
 *
 * It used to parse with `split` and `Number` and hand whatever came out to
 * `instantFromZonedClock`. An empty date gave `NaN` for the year, which became
 * an Invalid Date, which threw `RangeError: Invalid time value` inside
 * `Intl.DateTimeFormat.formatToParts` — during render, in a tree with no error
 * boundary anywhere in the app. Clearing the date input on the public branch
 * page white-screened the tab.
 *
 * That page is the one sent to strangers on WhatsApp. It is opened by somebody
 * who has never heard of Yalla, on a phone, with no reason whatsoever to try
 * again — so of every place in the product a crash could live, this was the
 * worst. A `type="date"` input is *empty* between a clear and the next
 * keystroke, and it is empty for as long as somebody leaves it that way.
 *
 * Callers decide what an unresolvable selection means. None of them may render
 * a room for it, and none of them has to catch anything.
 */
export function slotInstant(selection: SlotSelection, timeZoneId: TimeZone): Date | null {
  const date = readDate(selection.date);
  const time = readTime(selection.time);
  if (!date || !time) return null;

  const [year, month, day] = date;
  const [hour, minute] = time;
  return instantFromZonedClock({ year, month, day, hour, minute }, timeZoneId);
}
