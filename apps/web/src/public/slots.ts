import {
  SLOT_STEP_MINUTES,
  closesNextDay,
  toMinutes,
  type DaySlots,
  type WeeklyHours,
} from '@yalla/api';
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

/** Every quarter hour, matching the slots the backend reasons in since booking times. */
const SLOT_MINUTES = SLOT_STEP_MINUTES;

export interface SlotSelection {
  /** `YYYY-MM-DD`, in the branch's zone. */
  readonly date: string;
  /** `HH:mm`, in the branch's zone. */
  readonly time: string;
  readonly partySize: number;
}

/** The party stepper's top. Above it a party phones the venue. */
export const PARTY_MAX = 10;

/**
 * The party stepper's bounds: one guest up to the branch's largest offered
 * table, and never past {@link PARTY_MAX}.
 *
 * The public policy does not publish how far over its seats a table may be
 * filled, so a party bigger than every table is sent to the phone rather than
 * offered a room in which every table says "too small". Until the tables have
 * answered (`null`), the page top.
 */
export function partyBounds(largestTable: number | null): {
  readonly min: number;
  readonly max: number;
} {
  const max =
    largestTable === null || largestTable < 1 ? PARTY_MAX : Math.min(largestTable, PARTY_MAX);
  return { min: 1, max };
}

/** How many day chips the booking card shows before "Other day…". */
export const DAY_CHIPS = 7;

/**
 * The days the booking card offers, bounded by the branch's booking window:
 * a chip for each of the first week's days the window reaches, the last day
 * the date input may pick, and whether there are days past the chips.
 *
 * `windowDays` is how many days ahead the branch books; today is day zero.
 */
export function bookingDays(
  today: string,
  windowDays: number,
): { readonly chips: readonly string[]; readonly last: string; readonly more: boolean } {
  const ahead = Math.max(0, Math.floor(windowDays));
  const count = Math.min(DAY_CHIPS, ahead + 1);
  return {
    chips: Array.from({ length: count }, (_, index) => addDays(today, index)),
    last: addDays(today, ahead),
    more: ahead + 1 > count,
  };
}

/** The two halves of a day the time chips are split into (Main artboard). */
export type DayPart = 'day' | 'evening';

/**
 * Which half of the day a time is in: the day from 05:00, the evening from
 * 17:00 — and the small hours after midnight are still the evening before.
 */
export function dayPartOf(time: string): DayPart {
  const minutes = toMinutes(time);
  return minutes >= 5 * 60 && minutes < 17 * 60 ? 'day' : 'evening';
}

/** `YYYY-MM-DD` for the branch's calendar day now. */
export function branchToday(timeZoneId: TimeZone, now: Date = new Date()): string {
  return branchDayKey(now, timeZoneId);
}

/**
 * The branch's service day now: today, or yesterday while last night's block
 * is still open past midnight (the backend's `ServiceDateOf`).
 */
export function branchServiceToday(
  timeZoneId: TimeZone,
  weeklyHours: WeeklyHours,
  now: Date = new Date(),
): string {
  const today = branchToday(timeZoneId, now);
  return serviceDayOf(today, branchClock(now, timeZoneId), weeklyHours, timeZoneId);
}

/** The date `days` after a `YYYY-MM-DD` key, as another key. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * One formatter per zone and shape, kept: building an `Intl.DateTimeFormat` is
 * the expensive part, and the hours fallback asks hundreds of times a render
 * (review S2 measured 52 ms a call when each asked for a new one).
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(kind: 'clock' | 'day', timeZoneId: TimeZone): Intl.DateTimeFormat {
  const key = `${kind}|${timeZoneId}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter =
      kind === 'clock'
        ? new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: timeZoneId,
          })
        : new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: timeZoneId,
          });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** `YYYY-MM-DD`, the calendar day of an instant in the branch's zone. */
function dayKeyIn(instant: Date, timeZoneId: TimeZone): string {
  return formatterFor('day', timeZoneId).format(instant);
}

/** `HH:mm` wall-clock in the branch's zone for an instant. */
export function branchClock(instant: Date, timeZoneId: TimeZone): string {
  const parts = formatterFor('clock', timeZoneId).formatToParts(instant);
  const read = (type: 'hour' | 'minute') => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = read('hour') === '24' ? '00' : read('hour');
  return `${hour}:${read('minute')}`;
}

/** What the default slot has to clear: the venue's lead time and its hours. */
export interface DefaultSlotRules {
  /** How far ahead a booking must be made. Zero when the branch has no rule. */
  readonly minLeadMinutes: number;
  /** The week's hours, as the page prints them. Empty when none are published. */
  readonly weeklyHours: WeeklyHours;
  /**
   * How long a booking holds the table. The server takes a booking only when
   * the whole sitting fits inside one opening block, so 23:30 with two-hour
   * sittings at a venue closing at 01:00 is "closed". Zero when unknown.
   */
  readonly turnTimeMinutes?: number;
}

const SLOT_MS = SLOT_MINUTES * 60_000;

/** The instant rounded *up* to the next quarter-hour boundary (unchanged if on one). */
function ceilToSlot(instant: Date): Date {
  return new Date(Math.ceil(instant.getTime() / SLOT_MS) * SLOT_MS);
}

/**
 * Every sitting from yesterday to the day after tomorrow, as instants.
 *
 * Yesterday because a Friday that closes at 01:00 is still open at 00:30 under
 * Thursday's row; two days ahead because a venue shut on Mondays still has to
 * find Tuesday's opening on a Sunday night.
 */
function sittingsAround(
  dateKey: string,
  weeklyHours: WeeklyHours,
  timeZoneId: TimeZone,
): readonly { readonly start: Date; readonly end: Date }[] {
  const byDay = new Map<number, WeeklyHours[number]>();
  for (const entry of weeklyHours) byDay.set(entry.day, entry);

  const sittings: { start: Date; end: Date }[] = [];
  // A week and a day ahead: a venue shut for the weekend still has a next sitting.
  for (let offset = -1; offset <= 8; offset += 1) {
    const key = addDays(dateKey, offset);
    const [year, month, day] = key.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const entry = byDay.get(weekday);
    if (!entry) continue;

    for (const block of entry.blocks) {
      const start = clockInstant(key, block.opensAt, timeZoneId);
      const end = clockInstant(
        closesNextDay(block) ? addDays(key, 1) : key,
        block.closesAt,
        timeZoneId,
      );
      if (end.getTime() > start.getTime()) sittings.push({ start, end });
    }
  }
  return sittings.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function clockInstant(dateKey: string, clock: string, timeZoneId: TimeZone): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const minutes = toMinutes(clock);
  return instantFromZonedClock(
    { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    timeZoneId,
  );
}

/**
 * The defaults the page opens on: the first slot the venue would accept, two
 * people.
 *
 * It used to be the next half hour, which is the phone app's rule. On this
 * page that was a slot inside the venue's lead time — at 01:21 with a
 * 30-minute lead, 01:30 — and the first thing a stranger who opened the link
 * saw was "Too soon to book this table" over a room they had not touched. So
 * the default now clears the lead, rounds up to the half hour the backend
 * reasons in, and if that lands outside the hours, moves to the next sitting's
 * opening — this morning's 09:00 on the same 01:21 page.
 *
 * Two people is the commonest booking by a wide margin and the one that needs
 * the least correcting.
 *
 * This is the page's first guess, made before the server's day of slots has
 * answered. Once it has, the booking card moves to {@link defaultChoice} — the
 * first time that confirms at once — unless the visitor has picked a time.
 */
export function defaultSelection(
  timeZoneId: TimeZone,
  now: Date = new Date(),
  rules: DefaultSlotRules = { minLeadMinutes: 0, weeklyHours: [] },
): SlotSelection {
  const earliest = ceilToSlot(new Date(now.getTime() + rules.minLeadMinutes * 60_000));

  // The first sitting that has not ended by then; the slot is its opening when
  // the earliest slot falls before it. No sitting in the window — no hours
  // published, or a venue shut for three days — leaves the earliest slot, which
  // the availability query then answers honestly.
  const sittings = sittingsAround(branchDayKey(now, timeZoneId), rules.weeklyHours, timeZoneId);
  const turnMs = (rules.turnTimeMinutes ?? 0) * 60_000;
  const startIn = (span: { start: Date }) =>
    earliest.getTime() < span.start.getTime() ? span.start : earliest;
  const sitting = sittings.find(
    (span) => startIn(span).getTime() + Math.max(turnMs, 1) <= span.end.getTime(),
  );
  const slot = sitting ? startIn(sitting) : earliest;

  return {
    date: branchDayKey(slot, timeZoneId),
    time: branchClock(slot, timeZoneId),
    partySize: 2,
  };
}

/** Every quarter hour of a day, as `HH:mm`. */
export function timeOptions(): readonly string[] {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) {
    options.push(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    );
  }
  return options;
}

/**
 * What is wrong with a selection, or `null` when nothing is.
 *
 * Named rather than boolean because the two halves have different fallbacks:
 * a missing date falls back to today, a missing time to the next half hour.
 * Mirrors `problemWith` in the reports range module — same idiom, same reason.
 */
export type SlotProblem = 'date' | 'time';

/** `YYYY-MM-DD`, and a real calendar day rather than 2026-13-45. */
function readDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Round-tripped, so 2026-02-30 is refused rather than silently becoming the
  // 2nd of March — a date control can produce one and a diner would be booking
  // a day they did not pick.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return [year, month, day];
}

/** `HH:mm` on a 24-hour clock. */
function readTime(value: string): [number, number] | null {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : [hour, minute];
}

export function slotProblem(selection: SlotSelection): SlotProblem | null {
  if (readDate(selection.date) === null) return 'date';
  if (readTime(selection.time) === null) return 'time';
  return null;
}

/**
 * The instant a selection names, resolved in the branch's zone — or `null`.
 *
 * **Null rather than a throw, and this is the whole point of the function.**
 *
 * It used to parse with `split` and `Number` and hand whatever came out to
 * `instantFromZonedClock`. An empty date gave `NaN` for the year, which became
 * an Invalid Date, which threw `RangeError: Invalid time value` inside
 * `Intl.DateTimeFormat.formatToParts` — during render, in a tree with no error
 * boundary anywhere in the app. Clearing the date input on the public branch
 * page white-screened the tab.
 *
 * That page is the one sent to strangers on WhatsApp. It is opened by somebody
 * who has never heard of Yalla, on a phone, with no reason whatsoever to try
 * again — so of every place in the product a crash could live, this was the
 * worst. A `type="date"` input is *empty* between a clear and the next
 * keystroke, and it is empty for as long as somebody leaves it that way.
 *
 * Callers decide what an unresolvable selection means. None of them may render
 * a room for it, and none of them has to catch anything.
 */
export function slotInstant(selection: SlotSelection, timeZoneId: TimeZone): Date | null {
  const date = readDate(selection.date);
  const time = readTime(selection.time);
  if (!date || !time) return null;

  const [year, month, day] = date;
  const [hour, minute] = time;
  return instantFromZonedClock({ year, month, day, hour, minute }, timeZoneId);
}

/** One option of the time select: whether it can be had, and by when a table then must be free. */
export interface TimeChoice {
  /**
   * `YYYY-MM-DD`, the calendar date the time is on — what a booking sends. A
   * service day's night past midnight is on the next date (see
   * {@link serviceDayChoices}).
   */
  readonly date: string;
  /** `HH:mm`, the branch's clock. */
  readonly time: string;
  /** `busy` is drawn and disabled; `requestable` is offered, labelled "on request". */
  readonly state: 'free' | 'requestable' | 'busy';
  /** Every table then is cut short by the next booking: free it by this. */
  readonly mustFreeByUtc: string | null;
  /**
   * A booking then is confirmed as it is made. False for a time the venue
   * answers first — short notice, a party over the instant-confirmation limit,
   * a venue that confirms every booking itself, or a table only to be had on
   * request — which the chip calls "on request", and for a struck time.
   * `null` until the server has answered for the day, or when it could not:
   * the published hours say when, not how a booking would be taken (review S5).
   */
  readonly confirmsAtOnce: boolean | null;
}

/**
 * The time select's options for one calendar date.
 *
 * The server's day of slots once it has answered for that date: every quarter
 * hour whose whole sitting fits the hours, struck when no table can be had,
 * "on request" when only requestable tables are left — and a time it does not
 * list (the sitting would run past closing) is not an option at all. Until it
 * answers, or when it fails, the quarter hours the published hours allow, all
 * on offer; with no hours published, every quarter hour of the day.
 */
export function timeChoices(input: {
  readonly date: string;
  readonly day: DaySlots | null | undefined;
  readonly weeklyHours: WeeklyHours;
  readonly turnTimeMinutes: number;
  readonly timeZoneId: TimeZone;
}): readonly TimeChoice[] {
  const { day } = input;
  if (day && day.date === input.date && day.slots.length > 0) {
    const refused = day.unavailableReason !== null;
    // A time already too soon today is gone, not "no free table": left out,
    // as the app leaves out times inside the lead.
    return day.slots
      .filter((slot) => refused || slot.unavailableReason !== 'pastLeadTime')
      .map((slot): TimeChoice => {
        const state =
          !refused && slot.requestable
            ? 'requestable'
            : !refused && slot.isAvailable
              ? 'free'
              : 'busy';
        return {
          date: input.date,
          time: slot.time,
          state,
          mustFreeByUtc: !refused && slot.isAvailable ? (slot.mustFreeByUtc ?? null) : null,
          confirmsAtOnce: state === 'free' && !slot.requiresApproval,
        };
      });
  }
  const fromHours = hoursChoices(input);
  const times = fromHours.length > 0 ? fromHours : timeOptions();
  // A day refused outright (shut, out of reach) offers nothing that day.
  const refused = Boolean(day && day.date === input.date && day.unavailableReason !== null);
  // Until the server answers nothing is known to confirm at once or to wait,
  // and nothing is defaulted on: the page moves to the day's default only once
  // the day has answered.
  return times.map((time) => ({
    date: input.date,
    time,
    state: refused ? 'busy' : 'free',
    mustFreeByUtc: null,
    confirmsAtOnce: refused ? false : null,
  }));
}

/** The quarter hours of `date` whose whole sitting fits one of the published sittings. */
function hoursChoices(input: {
  readonly date: string;
  readonly weeklyHours: WeeklyHours;
  readonly turnTimeMinutes: number;
  readonly timeZoneId: TimeZone;
}): readonly string[] {
  const turn = Math.max(input.turnTimeMinutes, 1) * 60_000;
  const out = new Map<number, string>();
  for (const sitting of sittingsAround(input.date, input.weeklyHours, input.timeZoneId)) {
    for (let at = sitting.start.getTime(); at + turn <= sitting.end.getTime(); at += SLOT_MS) {
      const instant = new Date(at);
      if (dayKeyIn(instant, input.timeZoneId) !== input.date) continue;
      out.set(at, branchClock(instant, input.timeZoneId));
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, time]) => time);
}

/**
 * Where a selection on a time that cannot be had goes: the nearest option that
 * can, by the clock — the later of two equally near. `null` when none can.
 *
 * With `date`, by the clock of the night: 00:00 on the next date is a quarter
 * hour after 23:45, not a whole day before it.
 */
export function nearestChoice(
  choices: readonly TimeChoice[],
  time: string,
  date?: string,
): TimeChoice | null {
  const at = (choiceDate: string, clock: string) =>
    toMinutes(clock) + (date === undefined ? 0 : daysBetween(date, choiceDate) * 24 * 60);
  const wanted = at(date ?? '', time);
  let best: TimeChoice | null = null;
  let bestAt = 0;
  for (const choice of choices) {
    if (choice.state === 'busy') continue;
    const minutes = at(choice.date, choice.time);
    const distance = Math.abs(minutes - wanted);
    const bestDistance = best === null ? Infinity : Math.abs(bestAt - wanted);
    if (distance < bestDistance || (distance === bestDistance && minutes > bestAt)) {
      best = choice;
      bestAt = minutes;
    }
  }
  return best;
}

/** Whole days from one `YYYY-MM-DD` to another. */
function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The service day a time belongs to, as the backend files bookings: the day
 * its opening block began. 00:30 on Friday inside Thursday's 18:00–02:00 is
 * Thursday night's; a time in no published block is its own date's.
 */
export function serviceDayOf(
  date: string,
  time: string,
  weeklyHours: WeeklyHours,
  timeZoneId: TimeZone,
): string {
  return serviceDayReader(date, weeklyHours, timeZoneId)(date, time);
}

/** `serviceDayOf` for many times around one date, reading the hours once. */
function serviceDayReader(
  around: string,
  weeklyHours: WeeklyHours,
  timeZoneId: TimeZone,
): (date: string, time: string) => string {
  const sittings = sittingsAround(around, weeklyHours, timeZoneId);
  return (date, time) => {
    const at = clockInstant(date, time, timeZoneId).getTime();
    const sitting = sittings.find((span) => span.start.getTime() <= at && at < span.end.getTime());
    return sitting ? dayKeyIn(sitting.start, timeZoneId) : date;
  };
}

/**
 * Whether a service day's night has times past midnight — a block that opens
 * that day and still fits a whole sitting after 00:00 — so the next date's
 * answer is part of the day. A block closing at 00:00 does not run past
 * midnight, and one closing at 01:00 with 90-minute sittings has its last time
 * at 23:30: neither costs a second read.
 */
export function needsNextDay(
  serviceDate: string,
  weeklyHours: WeeklyHours,
  timeZoneId: TimeZone,
  turnTimeMinutes = 0,
): boolean {
  const midnight = clockInstant(addDays(serviceDate, 1), '00:00', timeZoneId).getTime();
  const turn = Math.max(turnTimeMinutes, 1) * 60_000;
  return sittingsAround(serviceDate, weeklyHours, timeZoneId).some(
    (span) =>
      dayKeyIn(span.start, timeZoneId) === serviceDate && span.end.getTime() - turn >= midnight,
  );
}

/**
 * A day chip's times: one **service day** (review B1), the backend's notion.
 *
 * The server lists a date's slots from 00:00 of that date, so for a bar open
 * 18:00–02:00 the 22nd starts with 00:00–00:30 — which is the 21st's night.
 * Filed as the 22nd's "evening", that was the time the page opened on: a
 * visitor at 14:00 tapping "Tomorrow" was put on tonight's midnight. So a day
 * shows its own times from its first opening, then its own night past
 * midnight from the next date's answer (`nextDay`), each with the calendar
 * date a booking sends.
 */
export function serviceDayChoices(input: {
  readonly serviceDate: string;
  /** The server's answer for `serviceDate`. */
  readonly day: DaySlots | null | undefined;
  /** The server's answer for the next date, for the night past midnight. */
  readonly nextDay: DaySlots | null | undefined;
  readonly weeklyHours: WeeklyHours;
  readonly turnTimeMinutes: number;
  readonly timeZoneId: TimeZone;
}): readonly TimeChoice[] {
  const { serviceDate, weeklyHours, turnTimeMinutes, timeZoneId } = input;
  const belongs = serviceDayReader(serviceDate, weeklyHours, timeZoneId);
  const own = timeChoices({
    date: serviceDate,
    day: input.day,
    weeklyHours,
    turnTimeMinutes,
    timeZoneId,
  }).filter((choice) => belongs(choice.date, choice.time) === serviceDate);
  if (!needsNextDay(serviceDate, weeklyHours, timeZoneId, turnTimeMinutes)) return own;
  const next = addDays(serviceDate, 1);
  const night = timeChoices({
    date: next,
    day: input.nextDay,
    weeklyHours,
    turnTimeMinutes,
    timeZoneId,
  }).filter((choice) => belongs(choice.date, choice.time) === serviceDate);
  return [...own, ...night];
}

/**
 * The time a day opens on (public-page HANDOFF §3, decided 2026-10-20): the
 * first time a booking is confirmed at once, and the first on-request time only
 * when the day has no other. `null` when every time is struck.
 *
 * Within `part` — the half of the day the visitor is looking at — first, so a
 * new day opens on the evening of somebody choosing an evening (Main
 * artboard); but a time that confirms at once in the other half still comes
 * before an on-request one in this half.
 *
 * Per day, on purpose (user decision 2026-10-20, review S4): the page opens on
 * today and stays there. The server's short-notice rule makes every time
 * today wait for the venue ("today, or under six hours"), so today opens on
 * its first on-request time with the reason said beside it; another day opens
 * on its first time that confirms at once.
 */
export function defaultChoice(choices: readonly TimeChoice[], part?: DayPart): TimeChoice | null {
  const inPart = part ? choices.filter((choice) => dayPartOf(choice.time) === part) : choices;
  const confirming = (list: readonly TimeChoice[]) =>
    list.find((choice) => choice.state !== 'busy' && choice.confirmsAtOnce);
  const open = (list: readonly TimeChoice[]) => list.find((choice) => choice.state !== 'busy');
  return confirming(inPart) ?? confirming(choices) ?? open(inPart) ?? open(choices) ?? null;
}
