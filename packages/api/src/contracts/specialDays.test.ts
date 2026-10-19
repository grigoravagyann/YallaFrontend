import { describe, expect, it } from 'vitest';
import { blocksOnDate, specialDayOn, type SpecialDay, type WeeklyHours } from './branchSettings';
import { coversSitting, openStateFrom } from './openState';

/**
 * Special days replace a date's weekly hours (VC3 wire §1): holidays,
 * closures, different hours on one date. A date's blocks are the ones that
 * open on it, so New Year's Eve 18:00–03:00 runs into the 1st even when the
 * 1st is closed.
 */

const ZONE = 'Asia/Yerevan';
/** 09:00–23:00 every day; Friday (5) and Saturday (6) to 01:00. */
const WEEK: WeeklyHours = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  day: day as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  blocks: [{ opensAt: '09:00', closesAt: day === 5 || day === 6 ? '01:00' : '23:00' }],
}));
const SPECIAL: readonly SpecialDay[] = [
  { date: '2026-12-31', note: 'New Year’s Eve', blocks: [{ opensAt: '18:00', closesAt: '03:00' }] },
  { date: '2027-01-01', note: 'New Year', blocks: [] },
];
/** Yerevan is UTC+4 all year. */
const at = (local: string) => new Date(`${local}+04:00`);

describe('the hours on one date', () => {
  it("are the special day's when it is one, and the weekday's otherwise", () => {
    expect(blocksOnDate('2026-12-31', WEEK, SPECIAL)).toEqual([
      { opensAt: '18:00', closesAt: '03:00' },
    ]);
    expect(blocksOnDate('2027-01-01', WEEK, SPECIAL)).toEqual([]);
    // 2027-01-02 is a Saturday: the week's own.
    expect(blocksOnDate('2027-01-02', WEEK, SPECIAL)).toEqual([
      { opensAt: '09:00', closesAt: '01:00' },
    ]);
    expect(specialDayOn('2027-01-01', SPECIAL)?.note).toBe('New Year');
    expect(specialDayOn('2027-01-02', SPECIAL)).toBeNull();
  });
});

describe('open now, with special days', () => {
  it('is closed at lunch on a special day that opens in the evening', () => {
    // 2026-12-31 is a Thursday: the week says open 09:00–23:00.
    expect(openStateFrom(WEEK, at('2026-12-31T12:00:00'), ZONE).isOpen).toBe(true);
    const state = openStateFrom(WEEK, at('2026-12-31T12:00:00'), ZONE, SPECIAL);
    expect(state.isOpen).toBe(false);
    expect(state.opensAtUtc).toBe(at('2026-12-31T18:00:00').toISOString());
  });

  it("runs New Year's Eve past midnight into a closed 1st, and then stays shut", () => {
    const late = openStateFrom(WEEK, at('2027-01-01T02:00:00'), ZONE, SPECIAL);
    expect(late.isOpen).toBe(true);
    expect(late.closesAtUtc).toBe(at('2027-01-01T03:00:00').toISOString());

    const noon = openStateFrom(WEEK, at('2027-01-01T12:00:00'), ZONE, SPECIAL);
    expect(noon.isOpen).toBe(false);
    // The 2nd, a Saturday, opens as the week says.
    expect(noon.opensAtUtc).toBe(at('2027-01-02T09:00:00').toISOString());
  });

  it("keeps the weekly closer's small hours on the morning after", () => {
    // Saturday 2027-01-02 runs to 01:00 on Sunday the 3rd, even when the 3rd is special.
    const sunday: readonly SpecialDay[] = [{ date: '2027-01-03', note: null, blocks: [] }];
    expect(openStateFrom(WEEK, at('2027-01-03T00:30:00'), ZONE, sunday).isOpen).toBe(true);
  });
});

describe('a sitting, with special days', () => {
  it('fits the special hours and not the weekly ones', () => {
    const start = at('2026-12-31T21:00:00');
    const end = at('2026-12-31T23:30:00');
    expect(coversSitting(WEEK, start, end, ZONE)).toBe(false);
    expect(coversSitting(WEEK, start, end, ZONE, SPECIAL)).toBe(true);
    expect(
      coversSitting(WEEK, at('2027-01-01T12:00:00'), at('2027-01-01T13:30:00'), ZONE, SPECIAL),
    ).toBe(false);
  });
});
