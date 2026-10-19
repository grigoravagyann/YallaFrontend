import {
  WEEK_ORDER,
  openStateFrom,
  specialDayOn,
  type HoursBlock,
  type SpecialDay,
  type WeekdayIndex,
  type WeeklyHours,
} from '@yalla/api';
import { branchDayKey, type TimeZone } from '@yalla/format';

/**
 * What the Hours screen's two preview cards say, from the week as typed.
 *
 * Pure, and kept beside the reducer, because both are read from the draft and
 * not the saved week: "what a diner sees" is what they *will* see once this is
 * saved, which is the only version of the question worth asking while typing.
 */

/** One line of the page's summary: a run of days with the same hours. */
export interface SummaryLine {
  readonly from: WeekdayIndex;
  readonly to: WeekdayIndex;
  /** Empty: closed. */
  readonly blocks: readonly HoursBlock[];
}

/**
 * Monday to Sunday, consecutive days with the same hours run together:
 * "Mon–Thu 09:00–23:00, Fri–Sat 09:00–01:00, Sun closed".
 */
export function weekSummary(week: WeeklyHours): readonly SummaryLine[] {
  const lines: {
    from: WeekdayIndex;
    to: WeekdayIndex;
    blocks: readonly HoursBlock[];
    key: string;
  }[] = [];
  for (const day of WEEK_ORDER) {
    const blocks = week.find((entry) => entry.day === day)?.blocks ?? [];
    const key = blocks.map((block) => `${block.opensAt}-${block.closesAt}`).join(',');
    const last = lines[lines.length - 1];
    if (last && last.key === key) last.to = day;
    else lines.push({ from: day, to: day, blocks, key });
  }
  return lines.map(({ from, to, blocks }) => ({ from, to, blocks }));
}

export interface GuestNow {
  readonly isOpen: boolean;
  /** Open: when it closes. */
  readonly closesAtUtc: string | null;
  /** Open: the close is on a later date than today. */
  readonly closesNextDay: boolean;
  /** Closed: the next opening, if one is coming. */
  readonly opensAtUtc: string | null;
  /** Closed: that opening is today. */
  readonly opensToday: boolean;
  /** Today is a special day. */
  readonly special: SpecialDay | null;
}

/** "Open · closes at 01:00 (next day)", as a guest would read it at `now`, special days honoured. */
export function guestNow(
  week: WeeklyHours,
  specialDays: readonly SpecialDay[],
  now: Date,
  timeZone: TimeZone,
): GuestNow {
  const state = openStateFrom(week, now, timeZone, specialDays);
  const today = branchDayKey(now, timeZone);
  return {
    isOpen: state.isOpen,
    closesAtUtc: state.closesAtUtc,
    closesNextDay: state.closesAtUtc ? branchDayKey(state.closesAtUtc, timeZone) !== today : false,
    opensAtUtc: state.opensAtUtc,
    opensToday: state.opensAtUtc ? branchDayKey(state.opensAtUtc, timeZone) === today : false,
    special: specialDayOn(today, specialDays),
  };
}

/** Today's weekday in the branch's zone: the row the screen marks "today". */
export function todayIn(now: Date, timeZone: TimeZone): WeekdayIndex {
  const key = branchDayKey(now, timeZone);
  return new Date(`${key}T12:00:00Z`).getUTCDay() as WeekdayIndex;
}
