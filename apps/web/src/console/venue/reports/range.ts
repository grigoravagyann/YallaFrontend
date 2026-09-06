import { REPORT_MAX_DAYS } from '@yalla/api';
import { branchDayKey, type TimeZone } from '@yalla/format';

/**
 * Which stretch of trading a report covers.
 *
 * Every date here is a **local date key in the branch's own zone**, never an
 * instant and never UTC. "Yesterday's covers" is a statement in the venue's
 * clock, and a range computed on UTC midnight is wrong by four hours in
 * Yerevan — every day, and in the direction that moves the late sittings, which
 * is where a restaurant's interesting numbers are. The server converts these
 * keys with the branch's `TimeZoneId`; the client's job is to never introduce a
 * second interpretation of what a day is.
 *
 * The presets are the questions an owner actually asks, in the order they ask
 * them, and the default is **last week** rather than yesterday or this month.
 * Yesterday is one service and too noisy to conclude anything from; this month
 * is incomplete and always looks like a decline against a full previous one.
 * Last week is the shortest range that is both finished and representative.
 */
export type RangePreset =
  'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

export const RANGE_PRESETS: readonly RangePreset[] = [
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'custom',
];

/** The preset the screen opens on. See above for why it is not "yesterday". */
export const DEFAULT_PRESET: RangePreset = 'lastWeek';

export interface DateRange {
  /** Inclusive `YYYY-MM-DD` in the branch's zone. */
  readonly from: string;
  readonly to: string;
}

// --- Date-key arithmetic -------------------------------------------------------
// All of it on `YYYY-MM-DD` keys via UTC, which is safe *because* these are keys
// rather than instants: no zone is involved once a day has been named, so no
// daylight-saving boundary can shift one.

function toParts(key: string): [number, number, number] {
  const [year, month, day] = key.split('-').map(Number);
  return [year ?? 1970, month ?? 1, day ?? 1];
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = toParts(key);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday, as `Date#getUTCDay` reports it. */
function weekdayOf(key: string): number {
  const [year, month, day] = toParts(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The Monday of the week containing `key`.
 *
 * Monday, not Sunday. Armenia's week starts on Monday, and a venue comparing
 * "this week" against "last week" is comparing two trading weeks that each run
 * Monday to Sunday — a Sunday-start week would split every weekend in half,
 * which is the part of the week the numbers are made of.
 */
function mondayOf(key: string): string {
  const weekday = weekdayOf(key);
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

function firstOfMonth(key: string): string {
  const [year, month] = toParts(key);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function lastOfMonth(key: string): string {
  const [year, month] = toParts(key);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Inclusive of both ends, matching `ReportRange.Days` on the server. */
export function daysInRange(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/** `YYYY-MM-DD` for the branch's current day. */
export function branchToday(timeZoneId: TimeZone, now: Date = new Date()): string {
  return branchDayKey(now, timeZoneId);
}

/**
 * What a preset resolves to, in the branch's local dates.
 *
 * `custom` has no answer of its own — it is whatever the two date inputs say —
 * so it returns null and the caller keeps the range it already had. That is
 * what makes switching to Custom preserve the dates on screen rather than
 * snapping them to something arbitrary.
 */
export function rangeFor(preset: RangePreset, today: string): DateRange | null {
  switch (preset) {
    case 'yesterday': {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case 'thisWeek':
      // Ends today, not on Sunday: a range that ran into the future would
      // compare a part-week against a whole one and always look like a fall.
      return { from: mondayOf(today), to: today };
    case 'lastWeek': {
      const monday = addDays(mondayOf(today), -7);
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'thisMonth':
      return { from: firstOfMonth(today), to: today };
    case 'lastMonth': {
      const lastMonthDay = addDays(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastMonthDay), to: lastOfMonth(lastMonthDay) };
    }
    case 'custom':
      return null;
  }
}

/**
 * The period every comparison on the screen is against.
 *
 * The same number of days, ending the day before this range starts — exactly
 * `ReportRange.Previous()` on the server. Recomputed here only to *label* the
 * comparison ("on the 7 days before"), never to compute one: the numbers come
 * from the server already compared, and a client that did its own arithmetic
 * would eventually disagree with the figure printed beside it.
 */
export function previousRange(range: DateRange): DateRange {
  const days = daysInRange(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

export type RangeProblem = 'backwards' | 'tooLong' | null;

/**
 * Whether a range can be asked for at all.
 *
 * Checked before the request rather than after the refusal, because the two
 * failures have different fixes and both are the owner's to make: a backwards
 * range is a typo in a date input, and an over-long one needs narrowing. The
 * server enforces the same cap — this only saves a round trip and says so in
 * the owner's own language.
 */
export function problemWith(range: DateRange): RangeProblem {
  if (range.to < range.from) return 'backwards';
  if (daysInRange(range) > REPORT_MAX_DAYS) return 'tooLong';
  return null;
}

/** One day of takings, as the revenue report reports them. */
export interface DailyRow {
  readonly localDate: string;
  readonly revenueAmd: number;
  readonly tabs: number;
}

/**
 * The first day in the range that anything was recorded on, when that is not
 * the range's own first day.
 *
 * A branch that went live mid-range shows a ramp, and an owner reading it
 * without this reads a decline. Derived from the daily series rather than from
 * a go-live date, because **there is no go-live date on the wire** — neither
 * the report contract nor `ConsoleBranch` carries one. So the sentence this
 * feeds says only what is actually known: nothing was recorded before this day.
 *
 * Compared against the **range**, not against leading zero rows. `byDay` is
 * sparse — the server groups the tabs that closed, so a day with no takings has
 * no row at all — and the first version of this function looked for leading
 * zeroes that the real backend never sends. The contract suite's live run is
 * what caught it; the mock had been emitting a dense series and agreeing with
 * the mistake.
 *
 * Null when the range was trading from its first day, or not at all — an empty
 * range is the empty state's business, not this one's.
 */
export function firstActiveDay(range: DateRange, days: readonly DailyRow[]): string | null {
  const active = days
    .filter((day) => day.revenueAmd > 0 || day.tabs > 0)
    .map((day) => day.localDate)
    .sort();

  const first = active[0];
  if (first === undefined || first <= range.from) return null;
  return first;
}

/**
 * The series with a point for every day in the range, zero where the server
 * sent nothing.
 *
 * A line chart plotted straight off a sparse series draws a straight slope
 * across the days it is missing, which reads as steady trade through a week the
 * venue was shut. The gaps are the venue's quiet days and they belong on the
 * chart.
 */
export function everyDayIn(range: DateRange, days: readonly DailyRow[]): DailyRow[] {
  const known = new Map(days.map((day) => [day.localDate, day]));
  const filled: DailyRow[] = [];

  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    filled.push(known.get(day) ?? { localDate: day, revenueAmd: 0, tabs: 0 });
  }
  return filled;
}
