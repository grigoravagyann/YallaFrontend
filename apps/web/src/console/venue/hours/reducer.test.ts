import { closesNextDay, type WeekdayIndex, type WeeklyHours } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  dinerPreview,
  emptyWeek,
  hoursProblems,
  hoursReducer,
  initialHoursState,
  isClosed,
  isDirty,
  problemIndexes,
  type HoursState,
} from './reducer';

/**
 * The opening-hours editor.
 *
 * The failure this file exists for is quiet and total: a bar that shuts at one
 * in the morning, recorded as shutting at one in the afternoon. Every
 * availability query then reports a venue closed for fourteen hours a day, the
 * branch card says the wrong thing to every diner, and nothing on the screen
 * ever looked wrong.
 */

const MON: WeekdayIndex = 1;
const TUE: WeekdayIndex = 2;
const SAT: WeekdayIndex = 6;
const SUN: WeekdayIndex = 0;

function state(week: WeeklyHours = emptyWeek()): HoursState {
  return initialHoursState(week);
}

function dayIn(week: WeeklyHours, day: WeekdayIndex) {
  return week.find((candidate) => candidate.day === day)!;
}

function open(day: WeekdayIndex, opensAt: string, closesAt: string): HoursState {
  let next = hoursReducer(state(), { type: 'setClosed', day, closed: false });
  next = hoursReducer(next, { type: 'setTime', day, index: 0, field: 'opensAt', value: opensAt });
  return hoursReducer(next, { type: 'setTime', day, index: 0, field: 'closesAt', value: closesAt });
}

// ---------------------------------------------------------------------------
// Test 1: the derivation, the copy, and the closed day
// ---------------------------------------------------------------------------

describe('a closing time before the opening time', () => {
  it('is the next day, derived rather than asked', () => {
    const next = open(SAT, '10:00', '01:00');
    const block = dayIn(next.draft, SAT).blocks[0]!;

    // No checkbox anywhere in this: the two times are the input and the fact
    // falls out of them. A control for it is a control somebody ticks on the
    // wrong row, on the one row where it matters.
    expect(closesNextDay(block)).toBe(true);
    expect(dinerPreview(dayIn(next.draft, SAT)).spans[0]).toEqual({
      text: '10:00 – 01:00',
      nextDay: true,
    });
    // Fifteen hours, not a negative nine.
    expect(dinerPreview(dayIn(next.draft, SAT)).totalMinutes).toBe(15 * 60);
  });

  it('is not the next day for an ordinary evening', () => {
    const next = open(MON, '09:00', '23:00');
    expect(closesNextDay(dayIn(next.draft, MON).blocks[0]!)).toBe(false);
    expect(dinerPreview(dayIn(next.draft, MON)).totalMinutes).toBe(14 * 60);
  });

  it('treats equal times as twenty-four hours, not zero', () => {
    // A venue open around the clock is a real thing; a venue open for zero
    // minutes is not, and reading `10:00–10:00` as nothing would silently shut
    // one every day.
    const next = open(MON, '10:00', '10:00');
    expect(closesNextDay(dayIn(next.draft, MON).blocks[0]!)).toBe(true);
    expect(dinerPreview(dayIn(next.draft, MON)).totalMinutes).toBe(24 * 60);
  });
});

describe('copying a day', () => {
  it('replicates the spans onto the days chosen and no others', () => {
    let next = open(MON, '08:30', '22:00');
    next = hoursReducer(next, { type: 'copyDay', from: MON, to: [TUE, SAT] });

    expect(dayIn(next.draft, TUE).blocks).toEqual([{ opensAt: '08:30', closesAt: '22:00' }]);
    expect(dayIn(next.draft, SAT).blocks).toEqual([{ opensAt: '08:30', closesAt: '22:00' }]);
    // Untouched, because it was not in the list.
    expect(isClosed(dayIn(next.draft, SUN))).toBe(true);
  });

  it('copies by value, so editing the copy does not edit the original', () => {
    let next = open(MON, '08:30', '22:00');
    next = hoursReducer(next, { type: 'copyDay', from: MON, to: [TUE] });
    next = hoursReducer(next, {
      type: 'setTime',
      day: TUE,
      index: 0,
      field: 'closesAt',
      value: '01:00',
    });

    expect(dayIn(next.draft, TUE).blocks[0]?.closesAt).toBe('01:00');
    // The bug a shared reference would produce, and the one nobody would look
    // for: "same every day" quietly changing every day at once, later.
    expect(dayIn(next.draft, MON).blocks[0]?.closesAt).toBe('22:00');
  });

  it('copying a closed day closes the others', () => {
    let next = open(MON, '08:30', '22:00');
    next = hoursReducer(next, { type: 'copyDay', from: SUN, to: [MON] });
    expect(isClosed(dayIn(next.draft, MON))).toBe(true);
  });
});

describe('a day marked closed', () => {
  it('emits no interval at all', () => {
    let next = open(MON, '09:00', '23:00');
    next = hoursReducer(next, { type: 'setClosed', day: MON, closed: true });

    const day = dayIn(next.draft, MON);
    // Not a zero-length span. `00:00–00:00` looks like "shut" and reads to
    // every consumer as a venue open for an instant at midnight.
    expect(day.blocks).toEqual([]);
    expect(isClosed(day)).toBe(true);
    expect(dinerPreview(day).spans).toEqual([]);
    expect(dinerPreview(day).totalMinutes).toBe(0);
  });

  it('gets a usable span back when reopened rather than a blank row', () => {
    const next = hoursReducer(state(), { type: 'setClosed', day: MON, closed: false });
    expect(dayIn(next.draft, MON).blocks).toHaveLength(1);
    expect(hoursProblems(next.draft)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 2: overlaps caught before the request
// ---------------------------------------------------------------------------

describe('two spans on one day', () => {
  it('may touch', () => {
    // Lunch until three, dinner from three. Nothing overlaps, and a client
    // stricter than the server here would refuse a real venue's real week.
    let next = open(MON, '11:00', '15:00');
    next = hoursReducer(next, { type: 'addBlock', day: MON });
    next = hoursReducer(next, {
      type: 'setTime',
      day: MON,
      index: 1,
      field: 'opensAt',
      value: '15:00',
    });
    next = hoursReducer(next, {
      type: 'setTime',
      day: MON,
      index: 1,
      field: 'closesAt',
      value: '23:00',
    });

    expect(hoursProblems(next.draft)).toEqual([]);
  });

  it('may not overlap, and the rows are named before anything is sent', () => {
    let next = open(MON, '11:00', '16:00');
    next = hoursReducer(next, { type: 'addBlock', day: MON });
    next = hoursReducer(next, {
      type: 'setTime',
      day: MON,
      index: 1,
      field: 'opensAt',
      value: '15:00',
    });
    next = hoursReducer(next, {
      type: 'setTime',
      day: MON,
      index: 1,
      field: 'closesAt',
      value: '23:00',
    });

    const problems = hoursProblems(next.draft);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toEqual({ kind: 'overlap', day: MON, indexes: [0, 1] });

    // Which rows, so the screen marks them. The server refuses the whole PUT
    // with one sentence about the week, which on a table of seven
    // identical-looking days is not something anybody can act on.
    expect([...problemIndexes(problems, MON)]).toEqual([0, 1]);
    expect(problemIndexes(problems, TUE).size).toBe(0);
  });

  it('catches an overlap that only exists because one span crosses midnight', () => {
    // 22:00–02:00 and 01:00–04:00. Compared naively these look disjoint —
    // 22 > 2 and 1 < 4 — and the venue would be recorded as open twice at once.
    let next = open(SAT, '22:00', '02:00');
    next = hoursReducer(next, { type: 'addBlock', day: SAT });
    next = hoursReducer(next, {
      type: 'setTime',
      day: SAT,
      index: 1,
      field: 'opensAt',
      value: '23:00',
    });
    next = hoursReducer(next, {
      type: 'setTime',
      day: SAT,
      index: 1,
      field: 'closesAt',
      value: '03:00',
    });

    expect(hoursProblems(next.draft)).toHaveLength(1);
  });

  it('reports a time that is not a time, rather than sending it', () => {
    const next = hoursReducer(open(MON, '09:00', '23:00'), {
      type: 'setTime',
      day: MON,
      index: 0,
      field: 'closesAt',
      value: '99:99',
    });
    expect(hoursProblems(next.draft)).toEqual([{ kind: 'invalidTime', day: MON, index: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// The dirty flag
// ---------------------------------------------------------------------------

describe('the unsaved-changes guard', () => {
  it('is clean on load and after a discard, dirty in between', () => {
    const loaded = state();
    expect(isDirty(loaded)).toBe(false);

    const edited = hoursReducer(loaded, { type: 'setClosed', day: MON, closed: false });
    expect(isDirty(edited)).toBe(true);

    expect(isDirty(hoursReducer(edited, { type: 'discard' }))).toBe(false);
  });

  it('is clean again once the saved week catches up', () => {
    const edited = hoursReducer(state(), { type: 'setClosed', day: MON, closed: false });
    const saved = hoursReducer(edited, { type: 'loaded', week: edited.draft });
    expect(isDirty(saved)).toBe(false);
  });
});
