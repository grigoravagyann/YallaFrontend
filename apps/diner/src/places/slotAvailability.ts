import {
  unavailableCopy,
  type CopyLine,
  type DaySlots,
  type TableUnavailableReason,
} from '@yalla/api';
import { branchDayKey } from '@yalla/format';
import type { TimeSlot } from './slots';

/**
 * Which of the booking screen's times nobody can have, from the server's day
 * of slots — so a diner never picks 20:00 only to find every table taken.
 *
 * The chips are the screen's own (the place's hours, the branch's lead and
 * window), so the grid does not reshuffle while the answer loads; the answer
 * strikes some of them and hides the ones the venue never offers.
 */
export interface SlotAvailability {
  /**
   * Times the server listed and refused — no table for the party then — or
   * every time of a date it refused outright: drawn, struck, named, never
   * chosen. Instants in milliseconds.
   */
  readonly struck: ReadonlySet<number>;
  /**
   * Times the server did not list at all: the whole sitting does not fit the
   * opening hours (the last half hours before closing). Not drawn — a struck
   * chip would say "no free table" of a time nobody can ever book.
   */
  readonly hidden: ReadonlySet<number>;
  /**
   * The whole day refused — shut, too far ahead, too late today. Every time of
   * that date is struck then, and the hint says why in the day's words.
   */
  readonly dayReason: TableUnavailableReason | null;
}

/**
 * Strike and hide from the server's answers, or nothing at all.
 *
 * - Each answer is for one calendar date, and judges only that date's times.
 *   A late venue's times after midnight (a bar open 17:00–02:00 offers 00:30
 *   on today's strip) are the next date: judged by the next date's answer, and
 *   never by a match on the clock alone, which would read last night's 00:30.
 * - No answer for a date (loading, failed): nothing on it struck or hidden.
 *   The room the diner opens still says whether a table is free; acting on a
 *   guess would take away times that are fine.
 * - A day-level reason: every time on that date struck.
 * - Otherwise a time the answer lists is struck when no table fits the party
 *   then, and a time it leaves out is hidden: the server lists every time of
 *   the date whose whole sitting fits the opening hours. Times are matched by
 *   instant.
 *
 * `dayReason` is the first answer's — the chosen day's — when it refused the
 * whole day and struck something.
 */
export function slotAvailability(
  slots: readonly TimeSlot[],
  answers: readonly (DaySlots | null | undefined)[],
  timeZoneId: string,
): SlotAvailability {
  const byDate = new Map(
    answers.flatMap((day) =>
      day
        ? [
            [
              day.date,
              { day, at: new Map(day.slots.map((s) => [Date.parse(s.slotUtc), s])) },
            ] as const,
          ]
        : [],
    ),
  );
  const struck = new Set<number>();
  const hidden = new Set<number>();
  for (const slot of slots) {
    const at = slot.at.getTime();
    const answer = byDate.get(branchDayKey(slot.at, timeZoneId));
    if (!answer) continue;
    if (answer.day.unavailableReason !== null) {
      struck.add(at);
      continue;
    }
    const time = answer.at.get(at);
    if (!time) hidden.add(at);
    else if (!time.isAvailable) struck.add(at);
  }
  const chosenDay = answers[0];
  return {
    struck,
    hidden,
    dayReason:
      chosenDay && chosenDay.unavailableReason !== null && struck.size > 0
        ? chosenDay.unavailableReason
        : null,
  };
}

/**
 * The time to show as chosen, never a struck or hidden one.
 *
 * `wanted` (an instant in milliseconds) while it can be had. Otherwise, for a
 * new booking (`substitute`), the nearest time that can — by distance in time,
 * the later one on a tie — or the first when nothing in particular is wanted.
 * A change never substitutes: the booking's own time, or the diner's pick, or
 * nothing, so a save cannot quietly move a booking to a time nobody chose.
 * `null` when there is nothing to choose, and the button stays off.
 */
export function pickSlot(
  slots: readonly TimeSlot[],
  availability: Pick<SlotAvailability, 'struck' | 'hidden'>,
  wanted: number | null,
  substitute: boolean,
): TimeSlot | null {
  const open = slots.filter((slot) => {
    const at = slot.at.getTime();
    return !availability.struck.has(at) && !availability.hidden.has(at);
  });
  const exact = wanted === null ? null : open.find((slot) => slot.at.getTime() === wanted);
  if (exact) return exact;
  if (!substitute) return null;
  if (wanted === null) return open[0] ?? null;
  let nearest: TimeSlot | null = null;
  for (const slot of open) {
    const distance = Math.abs(slot.at.getTime() - wanted);
    const best = nearest === null ? Infinity : Math.abs(nearest.at.getTime() - wanted);
    // Open slots run earliest first, so `<=` lets the later of two equals win.
    if (distance <= best) nearest = slot;
    else break;
  }
  return nearest;
}

/**
 * Why a whole day cannot be booked, in the day's words — shut that day, too
 * far ahead yet, nothing left today — under the struck times. Any other
 * reason in the table's own words.
 */
export function dayRefusalLine(reason: TableUnavailableReason, partySize: number): CopyLine {
  if (reason === 'closed') return { key: 'book.dayUnavailable.closed', params: {} };
  if (reason === 'tooFarAhead') return { key: 'book.dayUnavailable.tooFarAhead', params: {} };
  if (reason === 'pastLeadTime') return { key: 'book.noSlots', params: {} };
  return unavailableCopy(reason, partySize);
}
