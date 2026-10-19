import type { WeekdayIndex, WeeklyHours } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { guestNow, todayIn, weekSummary } from './hoursPreview';

/** The Hours screen's preview cards, read from the week as typed. */

const ZONE = 'Asia/Yerevan';
const block = (opensAt: string, closesAt: string) => ({ opensAt, closesAt });
/** The artboard's week: Mon–Thu 09–23, Fri 09–01, Sat 10–01, Sun 10–15 and 17–23. */
const WEEK: WeeklyHours = [
  { day: 1, blocks: [block('09:00', '23:00')] },
  { day: 2, blocks: [block('09:00', '23:00')] },
  { day: 3, blocks: [block('09:00', '23:00')] },
  { day: 4, blocks: [block('09:00', '23:00')] },
  { day: 5, blocks: [block('09:00', '01:00')] },
  { day: 6, blocks: [block('10:00', '01:00')] },
  { day: 0, blocks: [block('10:00', '15:00'), block('17:00', '23:00')] },
];
/** Yerevan is UTC+4. */
const at = (local: string) => new Date(`${local}+04:00`);

describe('the page summary', () => {
  it('runs consecutive days with the same hours together, Monday first', () => {
    expect(weekSummary(WEEK).map((line) => [line.from, line.to, line.blocks.length])).toEqual([
      [1, 4, 1],
      [5, 5, 1],
      [6, 6, 1],
      [0, 0, 2],
    ]);
  });

  it('keeps a closed day as a line of its own', () => {
    const closedSunday = WEEK.map((day) => (day.day === 0 ? { ...day, blocks: [] } : day));
    const last = weekSummary(closedSunday).at(-1)!;
    expect([last.from, last.to, last.blocks]).toEqual([0 as WeekdayIndex, 0 as WeekdayIndex, []]);
  });
});

describe('what a guest sees now', () => {
  it('says a Saturday evening is open until 01:00 the next day', () => {
    // Saturday 17 October 2026, 18:42.
    const now = guestNow(WEEK, [], at('2026-10-17T18:42:00'), ZONE);
    expect(now.isOpen).toBe(true);
    expect(now.closesNextDay).toBe(true);
    expect(now.closesAtUtc).toBe(at('2026-10-18T01:00:00').toISOString());
    expect(todayIn(at('2026-10-17T18:42:00'), ZONE)).toBe(6);
  });

  it("says when a Sunday's break ends, as an opening today", () => {
    const now = guestNow(WEEK, [], at('2026-10-18T16:00:00'), ZONE);
    expect(now.isOpen).toBe(false);
    expect(now.opensToday).toBe(true);
    expect(now.opensAtUtc).toBe(at('2026-10-18T17:00:00').toISOString());
  });

  it('follows a special day, and names it', () => {
    const special = [{ date: '2026-10-17', note: 'Wedding', blocks: [] }];
    const now = guestNow(WEEK, special, at('2026-10-17T18:42:00'), ZONE);
    expect(now.isOpen).toBe(false);
    expect(now.special?.note).toBe('Wedding');
    // Sunday opens as the week says.
    expect(now.opensToday).toBe(false);
    expect(now.opensAtUtc).toBe(at('2026-10-18T10:00:00').toISOString());
  });
});
