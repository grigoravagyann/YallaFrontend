import { formatTimeRange, minutesBetween, type Locale } from '@yalla/format';
import type { FloorTable } from './types';

export interface AvailabilityWindow {
  /** Minutes from `now` until the next booking starts. */
  readonly minutes: number;
  /** Pre-formatted "18:00 – 19:45", already in the branch timezone. */
  readonly range: string;
  /** True when the window is short enough to be worth warning about. */
  readonly isTight: boolean;
}

/** Below this, a diner should be told the seating is brief before they commit. */
export const TIGHT_WINDOW_MINUTES = 90;

/**
 * How long a `reservedSoon` table is actually free for.
 *
 * This is the product's answer to "how long do you intend to stay?" — the limit
 * is told, not asked. A diner who sees "available 18:00 – 19:45" can accept it
 * or glance at a table with no limit instead, without anyone having to
 * negotiate at the door.
 *
 * @param timeZoneId The *branch* timezone. Never the device's: a tourist's
 * phone is on Europe/Moscow and their booking is not.
 */
export function availabilityWindow(
  table: FloorTable,
  now: Date,
  timeZoneId: string,
  locale: Locale,
): AvailabilityWindow | null {
  if (table.state !== 'reservedSoon') return null;
  if (!table.nextReservationStartUtc) return null;

  const start = new Date(table.nextReservationStartUtc);
  if (Number.isNaN(start.getTime())) return null;

  const minutes = minutesBetween(now, start);
  // The booking has already started; there is no window left to advertise.
  if (minutes <= 0) return null;

  return {
    minutes,
    range: formatTimeRange(now, start, timeZoneId, locale),
    isTight: minutes <= TIGHT_WINDOW_MINUTES,
  };
}

/**
 * How long an occupied table has been sitting, in minutes.
 *
 * Staff-side occupancy density. Returns `null` for any other state, and never
 * a negative number — a clock skew between device and server should read as
 * "just sat", not "seated in the future".
 */
export function seatedMinutes(table: FloorTable, now: Date): number | null {
  if (table.state !== 'occupied' || !table.occupiedSinceUtc) return null;
  const seatedAt = new Date(table.occupiedSinceUtc);
  if (Number.isNaN(seatedAt.getTime())) return null;
  return Math.max(0, minutesBetween(seatedAt, now));
}
