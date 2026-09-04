import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelativeMinutes, minutesBetween } from './duration';
import { LOCALES } from './locale';

describe('formatDuration', () => {
  it('formats minutes under an hour', () => {
    expect(formatDuration(35, 'en')).toBe('35 mins');
  });

  it('formats a whole number of hours without a minutes part', () => {
    expect(formatDuration(120, 'en')).toBe('2 hrs');
  });

  it('formats hours and minutes together', () => {
    expect(formatDuration(95, 'en')).toContain('1 hr');
    expect(formatDuration(95, 'en')).toContain('35 min');
  });

  it('localises the unit names', () => {
    expect(formatDuration(35, 'ru')).toBe('35 мин');
    expect(formatDuration(35, 'hy')).toBe('35 ր');
  });

  it('formats zero', () => {
    expect(formatDuration(0, 'en')).toBe('0 mins');
  });

  it('clamps negative input to zero', () => {
    expect(formatDuration(-10, 'en')).toBe(formatDuration(0, 'en'));
  });

  it('truncates fractional minutes', () => {
    expect(formatDuration(35.9, 'en')).toBe(formatDuration(35, 'en'));
  });

  it('rejects non-finite input', () => {
    expect(() => formatDuration(Number.NaN, 'en')).toThrow(RangeError);
  });

  it('produces a non-empty string in every locale', () => {
    for (const locale of LOCALES) {
      expect(formatDuration(95, locale).length).toBeGreaterThan(0);
    }
  });
});

describe('formatRelativeMinutes', () => {
  it('formats the past', () => {
    expect(formatRelativeMinutes(-6, 'en')).toBe('6 min ago');
  });

  it('formats the future', () => {
    expect(formatRelativeMinutes(6, 'en')).toBe('in 6 min');
  });

  it('localises direction wording', () => {
    expect(formatRelativeMinutes(-6, 'ru')).toContain('назад');
    expect(formatRelativeMinutes(-6, 'hy')).toContain('առաջ');
  });

  it('switches to hours past 60 minutes so the number stays readable', () => {
    expect(formatRelativeMinutes(-120, 'en')).toBe('2 hr ago');
    expect(formatRelativeMinutes(-214, 'en')).not.toContain('214');
  });

  it('stays in minutes just under the hour boundary', () => {
    expect(formatRelativeMinutes(-59, 'en')).toBe('59 min ago');
  });

  it('rejects non-finite input', () => {
    expect(() => formatRelativeMinutes(Number.POSITIVE_INFINITY, 'en')).toThrow(RangeError);
  });
});

describe('minutesBetween', () => {
  it('is positive when the second instant is later', () => {
    expect(minutesBetween('2026-09-04T19:00:00Z', '2026-09-04T19:06:00Z')).toBe(6);
  });

  it('is negative when the second instant is earlier', () => {
    expect(minutesBetween('2026-09-04T19:06:00Z', '2026-09-04T19:00:00Z')).toBe(-6);
  });

  it('truncates toward zero', () => {
    expect(minutesBetween('2026-09-04T19:00:00Z', '2026-09-04T19:00:59Z')).toBe(0);
  });

  it('composes with formatRelativeMinutes for a late booking', () => {
    const booked = '2026-09-04T19:00:00Z';
    const now = '2026-09-04T19:06:00Z';
    expect(formatRelativeMinutes(-minutesBetween(booked, now), 'en')).toBe('6 min ago');
  });
});
