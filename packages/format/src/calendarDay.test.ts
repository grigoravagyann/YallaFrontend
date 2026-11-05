import { describe, expect, it } from 'vitest';
import { formatCalendarDay, formatCalendarDayRange, formatMonthName } from './calendarDay';

/**
 * The Armenian branch is checked by its exact words, because the bug it
 * exists for ("M11 1–4", "M10 30, Fri") only shows in a browser without
 * Armenian ICU data and never in Node. The other two languages are checked
 * for shape only: their spellings are ICU's and may move with it.
 */
describe('formatCalendarDay', () => {
  it('writes Armenian from its own words, never from Intl', () => {
    expect(formatCalendarDay('2026-11-04', 'hy')).toBe('4 նոյ');
    expect(formatCalendarDay('2026-11-04', 'hy', { weekday: 'short', month: 'short' })).toBe(
      'Չրք, 4 նոյ',
    );
    expect(formatCalendarDay('2026-10-30', 'hy', { weekday: 'long', month: 'long' })).toBe(
      'Ուրբաթ, 30 հոկտեմբերի',
    );
    expect(formatCalendarDay('2026-12-31', 'hy', { month: 'short', year: true })).toBe(
      '31 դեկ 2026',
    );
    expect(formatCalendarDay('2026-11-04', 'hy', { weekday: 'short', day: false })).toBe('Չրք');
  });

  it('reads the weekday from the calendar date, not from the device zone', () => {
    // 2026-11-04 is a Wednesday wherever the browser is.
    expect(formatCalendarDay('2026-11-04', 'en', { weekday: 'long', day: false })).toBe(
      'Wednesday',
    );
  });

  it('leaves English and Russian to Intl', () => {
    expect(formatCalendarDay('2026-11-04', 'en')).toBe('4 Nov');
    expect(formatCalendarDay('2026-11-04', 'ru')).toMatch(/4 нояб/u);
  });

  it('returns an unreadable key as it came', () => {
    expect(formatCalendarDay('tomorrow', 'hy')).toBe('tomorrow');
    expect(formatCalendarDay('2026-13-01', 'en')).toBe('2026-13-01');
  });
});

describe('formatCalendarDayRange', () => {
  it('collapses a shared month in Armenian the way Intl does elsewhere', () => {
    expect(formatCalendarDayRange('2026-11-01', '2026-11-04', 'hy')).toBe('1–4 նոյ');
    expect(formatCalendarDayRange('2026-11-01', '2026-11-04', 'en')).toMatch(/^1\s*–\s*4 Nov$/u);
  });

  it('names both months across a boundary', () => {
    expect(formatCalendarDayRange('2026-10-30', '2026-11-04', 'hy')).toBe('30 հոկ – 4 նոյ');
    expect(formatCalendarDayRange('2026-10-30', '2026-11-04', 'en')).toMatch(/30 Oct.*4 Nov/u);
  });

  it('prints the same day once', () => {
    expect(formatCalendarDayRange('2026-11-04', '2026-11-04', 'hy')).toBe('4 նոյ');
  });

  it('does not collapse when weekdays are asked for', () => {
    expect(
      formatCalendarDayRange('2026-11-01', '2026-11-04', 'hy', {
        weekday: 'short',
        month: 'short',
      }),
    ).toBe('Կիր, 1 նոյ – Չրք, 4 նոյ');
  });
});

describe('formatMonthName', () => {
  it('capitalises a standalone month in every language', () => {
    expect(formatMonthName(11, 'hy')).toBe('Նոյեմբեր');
    expect(formatMonthName(11, 'en')).toBe('November');
    expect(formatMonthName(11, 'ru')).toBe('Ноябрь');
  });
});
