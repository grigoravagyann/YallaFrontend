import { branchDayKey, instantFromZonedClock, type TimeZone } from '@yalla/format';

/**
 * The date, time and party-size choices above the floor plan.
 *
 * Every choice is built in the **branch's** zone. The server takes a booking in
 * the branch's wall-clock date and time, so a list of slots cut from the UTC day
 * — which is what this used to be — ran 04:00 to 03:30 in Yerevan, and picking
 * "00:30" silently booked the next date.
 */

/** 1 to 20. A party of 7 used to be inexpressible, and so was large-party approval. */
export const PARTY_SIZES: readonly number[] = Array.from({ length: 20 }, (_, index) => index + 1);

/** `ReservationPolicy.bookingWindowDays`'s own default, for a branch whose rules are unknown. */
export const DEFAULT_BOOKING_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;

function clockAt(instant: Date, timeZone: TimeZone): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { hour: get('hour'), minute: get('minute') };
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function atClock(dateKey: string, hour: number, minute: number, timeZone: TimeZone): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return instantFromZonedClock({ year, month, day, hour, minute }, timeZone);
}

/**
 * The half-hour slots of one branch-local day, from its own midnight.
 *
 * A slot already past — or inside the branch's lead time — is not offered: it
 * would only come back refused after a round trip. Slots that do not exist on
 * that date (a clock change) are skipped rather than shifted.
 */
export function timeOptions(input: {
  readonly dateKey: string;
  readonly now: Date;
  readonly timeZoneId: TimeZone;
  readonly leadMinutes: number;
}): readonly Date[] {
  const earliest = input.now.getTime() + input.leadMinutes * 60_000;
  const slots: Date[] = [];
  for (let index = 0; index < 48; index += 1) {
    const slot = atClock(input.dateKey, Math.floor(index / 2), (index % 2) * 30, input.timeZoneId);
    if (branchDayKey(slot, input.timeZoneId) !== input.dateKey) continue;
    if (slot.getTime() >= earliest) slots.push(slot);
  }
  return slots;
}

export interface DayOption {
  readonly dateKey: string;
  /** The same wall-clock time as the current pick, on this day — or its first bookable slot. */
  readonly slotUtc: Date;
  readonly isToday: boolean;
  readonly isTomorrow: boolean;
  readonly isSelected: boolean;
}

/**
 * The days to choose from: branch-local today onward, for as far ahead as the
 * branch takes bookings.
 *
 * Anchored on **today**, not on the day already picked. Anchoring on the pick
 * labelled whatever was chosen "Today", put every earlier day out of reach, and
 * walked forward past the booking window on repeated picks — which the server
 * then refused.
 */
export function dayOptions(input: {
  readonly now: Date;
  readonly selected: Date;
  readonly timeZoneId: TimeZone;
  readonly windowDays: number;
  readonly leadMinutes?: number | undefined;
}): readonly DayOption[] {
  const { now, selected, timeZoneId } = input;
  const leadMinutes = input.leadMinutes ?? 0;
  const today = branchDayKey(now, timeZoneId);
  const selectedKey = branchDayKey(selected, timeZoneId);
  const { hour, minute } = clockAt(selected, timeZoneId);
  const count = Math.max(1, Math.min(Math.floor(input.windowDays), 90));

  return Array.from({ length: count }, (_, offset): DayOption => {
    const dateKey = addDays(today, offset);
    let slotUtc = atClock(dateKey, hour, minute, timeZoneId);
    // Moving to today at a time that has already gone lands on the first time
    // still bookable today, rather than on a slot the server will refuse.
    if (slotUtc.getTime() < now.getTime() + leadMinutes * 60_000) {
      slotUtc = timeOptions({ dateKey, now, timeZoneId, leadMinutes })[0] ?? slotUtc;
    }
    return {
      dateKey,
      slotUtc,
      isToday: offset === 0,
      isTomorrow: offset === 1,
      isSelected: dateKey === selectedKey,
    };
  });
}
