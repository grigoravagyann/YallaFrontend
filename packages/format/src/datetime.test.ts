import { describe, expect, it } from 'vitest';
import {
  InvalidInstantError,
  branchDayKey,
  formatDate,
  formatTime,
  formatTimeRange,
} from './datetime';
import { YEREVAN } from './locale';

const MOSCOW = 'Europe/Moscow';
const EVENING = '2026-09-04T15:00:00Z'; // 19:00 in Yerevan, 18:00 in Moscow

describe('formatTime', () => {
  it('formats in the branch timezone, not UTC', () => {
    expect(formatTime(EVENING, YEREVAN, 'en')).toBe('19:00');
  });

  it('uses the timezone it is given rather than a device default', () => {
    // The whole point: a tourist's phone is on Moscow time, the booking is not.
    expect(formatTime(EVENING, MOSCOW, 'en')).toBe('18:00');
    expect(formatTime(EVENING, 'UTC', 'en')).toBe('15:00');
  });

  it('uses a 24-hour clock in all three locales', () => {
    for (const locale of ['hy', 'ru', 'en'] as const) {
      expect(formatTime(EVENING, YEREVAN, locale)).toBe('19:00');
    }
  });

  it('accepts Date and epoch millis as well as ISO strings', () => {
    const asDate = new Date(EVENING);
    expect(formatTime(asDate, YEREVAN, 'en')).toBe('19:00');
    expect(formatTime(asDate.getTime(), YEREVAN, 'en')).toBe('19:00');
  });

  it('rejects unparseable input', () => {
    expect(() => formatTime('not a date', YEREVAN, 'en')).toThrow(InvalidInstantError);
  });
});

describe('formatTimeRange', () => {
  it('formats a booking window', () => {
    const range = formatTimeRange(EVENING, '2026-09-04T17:30:00Z', YEREVAN, 'en');
    expect(range).toContain('19:00');
    expect(range).toContain('21:30');
  });

  it('shifts both ends by the branch timezone', () => {
    const range = formatTimeRange(EVENING, '2026-09-04T17:30:00Z', 'UTC', 'en');
    expect(range).toContain('15:00');
    expect(range).toContain('17:30');
  });
});

describe('formatDate', () => {
  it('formats a calendar date in the branch timezone', () => {
    expect(formatDate(EVENING, YEREVAN, 'en')).toContain('2026');
    expect(formatDate(EVENING, YEREVAN, 'en')).toContain('4');
  });

  it('localises the month name', () => {
    expect(formatDate(EVENING, YEREVAN, 'ru')).not.toBe(formatDate(EVENING, YEREVAN, 'en'));
  });
});

describe('branchDayKey', () => {
  it('groups by the branch calendar day', () => {
    expect(branchDayKey(EVENING, YEREVAN)).toBe('2026-09-04');
  });

  it('keeps a late Yerevan service on its own service day', () => {
    // 21:30 UTC is 01:30 the next morning in Yerevan. Grouping on the UTC day
    // would split a single Friday evening service across two dates.
    const lateNight = '2026-09-04T21:30:00Z';
    expect(branchDayKey(lateNight, 'UTC')).toBe('2026-09-04');
    expect(branchDayKey(lateNight, YEREVAN)).toBe('2026-09-05');
  });

  it('always returns a zero-padded YYYY-MM-DD', () => {
    expect(branchDayKey('2026-01-05T09:00:00Z', YEREVAN)).toBe('2026-01-05');
  });
});
