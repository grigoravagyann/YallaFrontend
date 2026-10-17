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
 * The chips stay the screen's own (the place's hours, the branch's lead and
 * window), so the grid does not reshuffle when the answer lands; the answer
 * only strikes some of them.
 */
export interface SlotAvailability {
  /** The `HH:mm` keys of the times to strike: drawn, named, never chosen. */
  readonly struck: ReadonlySet<string>;
  /**
   * The whole day refused — shut, too far ahead, too late today. Every time of
   * that date is struck then, and the hint says why in the day's words.
   */
  readonly dayReason: TableUnavailableReason | null;
}

/**
 * Strike from the server's answers, or nothing at all.
 *
 * - Each answer is for one calendar date, and judges only that date's times.
 *   A late venue's times after midnight (a bar open 17:00–02:00 offers 00:30
 *   on today's strip) are the next date: judged by the next date's answer, and
 *   never by a match on the clock alone, which would read last night's 00:30.
 * - No answer for a date (loading, failed): nothing on it struck. The room the
 *   diner opens still says whether a table is free; striking on a guess would
 *   hide times that are fine.
 * - A day-level reason: every time on that date struck.
 * - Otherwise a time is struck when the server says no table fits the party
 *   then, or when the server left it out: it lists every time of the date
 *   whose whole sitting fits the opening hours, so one it omits cannot be
 *   booked. Times are matched by instant.
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
  const struck = new Set<string>();
  for (const slot of slots) {
    const answer = byDate.get(branchDayKey(slot.at, timeZoneId));
    if (!answer) continue;
    if (answer.day.unavailableReason !== null) {
      struck.add(slot.key);
      continue;
    }
    const time = answer.at.get(slot.at.getTime());
    if (!time || !time.isAvailable) struck.add(slot.key);
  }
  const chosenDay = answers[0];
  return {
    struck,
    dayReason:
      chosenDay && chosenDay.unavailableReason !== null && struck.size > 0
        ? chosenDay.unavailableReason
        : null,
  };
}

/**
 * The time to show as chosen: the diner's own pick while it can still be
 * had, else the first time that can — never a struck one. `null` when every
 * time is struck (or there are none), and Book stays off.
 */
export function pickSlot(
  slots: readonly TimeSlot[],
  struck: ReadonlySet<string>,
  wanted: string | null,
): TimeSlot | null {
  const open = (slot: TimeSlot) => !struck.has(slot.key);
  return slots.find((slot) => slot.key === wanted && open(slot)) ?? slots.find(open) ?? null;
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
