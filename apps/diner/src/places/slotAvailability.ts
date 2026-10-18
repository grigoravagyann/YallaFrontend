import {
  unavailableCopy,
  type CopyLine,
  type DaySlots,
  type SlotFloor,
  type TableUnavailableReason,
} from '@yalla/api';
import { branchDayKey } from '@yalla/format';
import type { TimeSlot } from './slots';
import type { SlotState, WheelSlot } from './wheelTimes';

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
   * Times whose only tables are requestable — somebody booked them shortly
   * before, and the guest before (another day) or the floor (today) decides.
   * On offer, labelled so; never struck.
   */
  readonly requestable: ReadonlySet<number>;
  /** Times at which every table to be had is cut short, with the time to free it by. */
  readonly mustFreeBy: ReadonlyMap<number, string>;
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
  const requestable = new Set<number>();
  const mustFreeBy = new Map<number, string>();
  for (const slot of slots) {
    const at = slot.at.getTime();
    const answer = byDate.get(branchDayKey(slot.at, timeZoneId));
    if (!answer) continue;
    if (answer.day.unavailableReason !== null) {
      struck.add(at);
      continue;
    }
    const time = answer.at.get(at);
    if (!time) {
      hidden.add(at);
      continue;
    }
    // A requestable time is on offer whichever way the server counts it.
    if (time.requestable) requestable.add(at);
    else if (!time.isAvailable) struck.add(at);
    if (time.mustFreeByUtc) mustFreeBy.set(at, time.mustFreeByUtc);
  }
  const chosenDay = answers[0];
  return {
    struck,
    hidden,
    requestable,
    mustFreeBy,
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

/** What the room at one minute says about it, for a time the day does not list. */
export interface SlotVerdict {
  readonly state: SlotState;
  /** Every table to be had then is cut short: the latest time to free it by. */
  readonly mustFreeByUtc: string | null;
}

/**
 * "In 10 min" is not on the quarter hours, so the day of slots cannot judge
 * it; the room at that minute does — the same read the booking will be made
 * against. Busy when the request is refused or no table is to be had,
 * requestable when every table is only a request, and cut short when every
 * plain table is. `null` until the room has answered.
 */
export function slotFloorVerdict(floor: SlotFloor | null | undefined): SlotVerdict | null {
  if (!floor) return null;
  const bookable = floor.tables.filter((table) => table.isBookable);
  if (floor.rejection !== null || bookable.length === 0)
    return { state: 'busy', mustFreeByUtc: null };
  const plain = bookable.filter((table) => !table.isRequestable);
  if (plain.length === 0) return { state: 'requestable', mustFreeByUtc: null };
  // The server's rule: a time "until" only when no table on offer gives a full sitting.
  const cuts = bookable.map((table) => table.mustFreeByUtc ?? null);
  return {
    state: 'free',
    mustFreeByUtc: cuts.every((cut) => cut !== null)
      ? new Date(Math.max(...cuts.map((cut) => Date.parse(cut!)))).toISOString()
      : null,
  };
}

/**
 * The day with "in 10 min" in its place among the times, judged by the room
 * at that minute: never hidden for not being one of the day's quarter hours,
 * struck when the room says no table, offered while it has not answered.
 */
export function withSoon(
  slots: readonly TimeSlot[],
  availability: SlotAvailability,
  soon: TimeSlot | null,
  verdict: SlotVerdict | null,
): { readonly slots: readonly TimeSlot[]; readonly availability: SlotAvailability } {
  if (!soon) return { slots, availability };
  const at = soon.at.getTime();
  const onGrid = slots.some((slot) => slot.at.getTime() === at);
  const merged = onGrid ? slots : [...slots, soon].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (onGrid) return { slots: merged, availability };

  const hidden = new Set(availability.hidden);
  hidden.delete(at);
  const struck = new Set(availability.struck);
  const requestable = new Set(availability.requestable);
  const mustFreeBy = new Map(availability.mustFreeBy);
  if (verdict?.state === 'busy') struck.add(at);
  if (verdict?.state === 'requestable') requestable.add(at);
  if (verdict?.mustFreeByUtc) mustFreeBy.set(at, verdict.mustFreeByUtc);
  return {
    slots: merged,
    availability: { ...availability, hidden, struck, requestable, mustFreeBy },
  };
}

/** The wheel's rows: every time on offer that day, each free, requestable or busy. */
export function wheelSlots(
  slots: readonly TimeSlot[],
  availability: Pick<SlotAvailability, 'struck' | 'hidden' | 'requestable'>,
): readonly WheelSlot[] {
  return slots
    .filter((slot) => !availability.hidden.has(slot.at.getTime()))
    .map((slot) => {
      const at = slot.at.getTime();
      return {
        at,
        // The branch's own clock, 24-hour, as the wheel's two columns read it.
        label: slot.key,
        state: availability.struck.has(at)
          ? 'busy'
          : availability.requestable.has(at)
            ? 'requestable'
            : 'free',
      };
    });
}

/**
 * The room's answer for the time and party on screen — `undefined` while the
 * last one is still drawn. The slot read keeps the previous answer on screen
 * as the next loads, so the rooms do not blink between two times; but that
 * answer says nothing about this time, and booking on it would book 19:30 on
 * 19:00's tables — the table it would pick, whether it needs a promise. Read
 * by instant: the server echoes `…:00Z`, the screen asks with milliseconds.
 */
export function answerFor(
  floor: SlotFloor | null | undefined,
  slotMs: number | null,
  partySize: number,
): SlotFloor | undefined {
  if (!floor || slotMs === null) return undefined;
  return Date.parse(floor.slotUtc) === slotMs && floor.partySize === partySize ? floor : undefined;
}

/**
 * Whether a time offers a table with no limit — after a "no" to freeing the
 * table by a time, the times worth offering instead. For the chosen table that
 * table, free outright: bookable, nobody to ask, no booking after it cutting
 * it short. With none chosen, any such table — the one a press would book
 * (see `preferredTable`). A day slot's own must-free-by cannot say this: it is
 * set only when *every* table is cut short, so it would offer the chosen
 * table at a time it is cut short too.
 */
export function unlimitedAt(floor: SlotFloor | null | undefined, tableId: string | null): boolean {
  if (!floor || floor.rejection !== null) return false;
  const plain = (table: SlotFloor['tables'][number]) =>
    table.isBookable && !table.isRequestable && !table.mustFreeByUtc;
  if (tableId === null) return floor.tables.some(plain);
  const table = floor.tables.find((candidate) => candidate.tableId === tableId);
  return table ? plain(table) : false;
}
