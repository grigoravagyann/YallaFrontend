import { MIN_LEAD_MINUTES, SLOT_STEP_MINUTES } from '@yalla/api';
import { branchDayKey } from '@yalla/format';
import {
  hoursBlocksOn,
  instantAt,
  parseDateKey,
  serviceWindow,
  shiftDateKey,
  weekdayOf,
  type ClockTime,
  type Place,
  type TablePhotoMarker,
  type Weekday,
} from './model';

/**
 * The choices on the booking screen: which day, which time, which table.
 *
 * Pure, and every reading is in the PLACE's zone. The device may be on any
 * clock; the venue opens when its own wall clock says so.
 */

/**
 * How soon a booking may start when the branch's own rule is not known yet —
 * the fixed default, ten minutes. Only a stand-in while the rules load: the
 * branch's `minLeadMinutes` replaces it.
 */
export const LEAD_MINUTES = MIN_LEAD_MINUTES;

/** How many days the strip offers while the branch's `bookingWindowDays` is not known yet. */
export const WINDOW_DAYS = 7;

/** Slots are cut every quarter hour, as the server's day of slots is. */
export const SLOT_MINUTES = SLOT_STEP_MINUTES;

const MINUTE_MS = 60_000;

export interface DayOption {
  /** `YYYY-MM-DD` in the place's zone. */
  readonly dateKey: string;
  /** Midnight of that day in the place's zone, for `Intl.DateTimeFormat` with the same zone. */
  readonly date: Date;
  readonly weekday: Weekday;
  readonly dayOfMonth: number;
  readonly isToday: boolean;
  readonly isTomorrow: boolean;
}

/** The next `days` days starting from today in `timeZoneId`. */
export function dayOptions(now: Date, timeZoneId: string, days = 7): readonly DayOption[] {
  const today = branchDayKey(now, timeZoneId);
  const count = Math.max(1, Math.min(Math.floor(days), 90));
  return Array.from({ length: count }, (_, offset): DayOption => {
    const dateKey = shiftDateKey(today, offset);
    return {
      dateKey,
      date: instantAt(dateKey, '00:00', timeZoneId),
      weekday: weekdayOf(dateKey),
      dayOfMonth: Number(dateKey.slice(8, 10)),
      isToday: offset === 0,
      isTomorrow: offset === 1,
    };
  });
}

/**
 * How many days the strip offers so that `dateKey` is on it: `days`, or more
 * when the date lies further out. A booking being changed may sit beyond the
 * window the strip starts with — the default, before the branch's own rules
 * have loaded — and its own day has to be there to be shown as chosen.
 */
export function windowReaching(
  now: Date,
  timeZoneId: string,
  days: number,
  dateKey: string | null,
): number {
  if (!dateKey) return days;
  const utcDay = (key: string) => {
    const { year, month, day } = parseDateKey(key);
    return Date.UTC(year, month - 1, day);
  };
  const ahead = Math.round((utcDay(dateKey) - utcDay(branchDayKey(now, timeZoneId))) / 86_400_000);
  return Math.max(days, ahead + 1);
}

export interface TimeSlot {
  /** The wall-clock reading in the place's zone, `HH:mm`. Stable across renders. */
  readonly key: ClockTime;
  /** The instant, for formatting in the place's zone and for the booking command. */
  readonly at: Date;
}

/** `HH:mm` on the place's clock, 24-hour, for an instant: a {@link TimeSlot}'s key. */
export function clockOf(instant: Date, timeZoneId: string): ClockTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/**
 * The bookable quarter-hour slots of one day.
 *
 * Inside any of the place's opening blocks for that weekday — a split lunch
 * and dinner service offers both, and nothing in the gap — (a close after
 * midnight counts as the same service day), at least `leadMinutes` ahead of
 * `now` — the branch's `minLeadMinutes`, or `LEAD_MINUTES` until that is known —
 * and never a closing time itself. A day the place is shut yields nothing.
 */
export function timeSlots(
  place: Pick<Place, 'hours' | 'timeZoneId'>,
  dateKey: string,
  now: Date,
  leadMinutes: number = LEAD_MINUTES,
): readonly TimeSlot[] {
  const blocks = hoursBlocksOn(place.hours, dateKey);
  if (blocks.length === 0) return [];

  const earliest = now.getTime() + Math.max(0, leadMinutes) * MINUTE_MS;
  const taken = new Set<number>();
  const slots: TimeSlot[] = [];

  for (const block of blocks) {
    const { opens, closes } = serviceWindow(block, dateKey, place.timeZoneId);
    for (let t = opens.getTime(); t < closes.getTime(); t += SLOT_MINUTES * MINUTE_MS) {
      if (t < earliest || taken.has(t)) continue;
      taken.add(t);
      const at = new Date(t);
      slots.push({ key: clockOf(at, place.timeZoneId), at });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Before any `now`: {@link timeSlots} with this and no lead lists every time of a day. */
const ALWAYS = new Date(0);

/**
 * The strip day a booking's instant is offered under: the service day whose
 * times include it. A bar open 17:00–02:00 offers 00:30 on the evening's strip,
 * so a 00:30 booking opens on the day before its calendar date; the calendar
 * date itself is tried next. A day before `today` is not on the strip and is
 * never chosen. When neither day lists the instant — the hours have changed
 * since — the calendar date, where the screen then says the time is gone.
 *
 * Every time of the day counts, lead time or not: a booking about to start is
 * still on its own day.
 */
export function stripDateFor(
  place: Pick<Place, 'hours' | 'timeZoneId'>,
  slotUtc: string,
  today: string,
): string {
  const at = Date.parse(slotUtc);
  const calendar = branchDayKey(new Date(at), place.timeZoneId);
  return (
    [shiftDateKey(calendar, -1), calendar]
      .filter((dateKey) => dateKey >= today)
      .find((dateKey) =>
        timeSlots(place, dateKey, ALWAYS, 0).some((slot) => slot.at.getTime() === at),
      ) ?? calendar
  );
}

/**
 * The sizes under "5+": `from` up to `max`, those the chosen table seats — and
 * `keep`, the size of the booking being changed, when the list does not have
 * it (a party bigger than the list, or one the table's figures would refuse).
 * It is then shown as chosen, and a change to the time alone saves it as it
 * was rather than shrinking it.
 */
export function largerPartySizes(
  from: number,
  max: number,
  fits: (size: number) => boolean,
  keep: number | null = null,
): readonly number[] {
  const sizes = Array.from({ length: Math.max(0, max - from + 1) }, (_, i) => from + i).filter(
    fits,
  );
  if (keep !== null && keep >= from && !sizes.includes(keep)) sizes.push(keep);
  return sizes.sort((a, b) => a - b);
}

/** Only a free table the venue takes bookings for can be booked from the photo. */
export function bookableTables(tables: readonly TablePhotoMarker[]): readonly TablePhotoMarker[] {
  return tables.filter((table) => table.status === 'free' && table.isBookable);
}

/** The tables a party of `partySize` fits at, free ones only. */
export function tablesForParty(
  tables: readonly TablePhotoMarker[],
  partySize: number,
): readonly TablePhotoMarker[] {
  return bookableTables(tables).filter(
    (table) => partySize >= table.capacityMin && partySize <= table.capacityMax,
  );
}
