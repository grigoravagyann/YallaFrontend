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

/** The instant a selection names, resolved in the branch's zone. */
export function slotInstant(selection: SlotSelection, timeZoneId: TimeZone): Date {
  const [year, month, day] = selection.date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = selection.time.split(':').map(Number) as [number, number];
  return instantFromZonedClock({ year, month, day, hour, minute }, timeZoneId);
}
