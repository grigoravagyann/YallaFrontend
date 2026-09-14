import { branchDayKey } from '@yalla/format';
import {
  hoursBlocksOn,
  instantAt,
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

/** A booking this close to now is refused by the server, so it is not offered. */
export const LEAD_MINUTES = 30;

/** Slots are cut every half hour. */
export const SLOT_MINUTES = 30;

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

export interface TimeSlot {
  /** The wall-clock reading in the place's zone, `HH:mm`. Stable across renders. */
  readonly key: ClockTime;
  /** The instant, for formatting in the place's zone and for the booking command. */
  readonly at: Date;
}

function clockOf(instant: Date, timeZoneId: string): ClockTime {
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
 * The bookable half-hour slots of one day.
 *
 * Inside any of the place's opening blocks for that weekday — a split lunch
 * and dinner service offers both, and nothing in the gap — (a close after
 * midnight counts as the same service day), at least `LEAD_MINUTES` ahead of
 * `now`, and never a closing time itself. A day the place is shut yields nothing.
 */
export function timeSlots(
  place: Pick<Place, 'hours' | 'timeZoneId'>,
  dateKey: string,
  now: Date,
): readonly TimeSlot[] {
  const blocks = hoursBlocksOn(place.hours, dateKey);
  if (blocks.length === 0) return [];

  const earliest = now.getTime() + LEAD_MINUTES * MINUTE_MS;
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

/** Only a free table can be booked from the photo. */
export function bookableTables(tables: readonly TablePhotoMarker[]): readonly TablePhotoMarker[] {
  return tables.filter((table) => table.status === 'free');
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
