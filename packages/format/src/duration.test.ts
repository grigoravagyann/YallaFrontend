import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, formatDuration, formatRelativeMinutes, minutesBetween } from './duration';
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

describe('formatCountdown', () => {
  it('writes minutes and seconds, both two digits', () => {
    expect(formatCountdown(14 * 60 + 5)).toBe('14:05');
    expect(formatCountdown(59)).toBe('00:59');
  });

  it('rounds a part-second up, so the last second still reads 00:01', () => {
    expect(formatCountdown(0.2)).toBe('00:01');
    expect(formatCountdown(61.4)).toBe('01:02');
  });

  it('stops at zero rather than counting into negatives', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-30)).toBe('00:00');
  });

  it('keeps counting minutes past an hour rather than wrapping', () => {
    expect(formatCountdown(75 * 60)).toBe('75:00');
  });

  it('says hours and minutes past an hour when it knows the language — a two-hour wait', () => {
    // The duration's own words, rounded up to the minute: never "0 min" left.
    expect(formatCountdown(119 * 60, 'en')).toBe(formatDuration(119, 'en'));
    expect(formatCountdown(119 * 60 - 30, 'ru')).toBe(formatDuration(119, 'ru'));
    expect(formatCountdown(2 * 3600, 'en')).toBe(formatDuration(120, 'en'));
    expect(formatCountdown(119 * 60, 'en')).toMatch(/^1 hr,? 59 mins?$/u);
    // An hour or less is still the clock: the last hour counts down by the second.
    expect(formatCountdown(60 * 60, 'en')).toBe('60:00');
    expect(formatCountdown(59 * 60 + 5, 'en')).toBe('59:05');
  });
});

/**
 * A runtime whose ICU has no Armenian or Russian data — headless Chromium, a
 * slim browser build: `hy-AM` falls back to the root locale, and the public
 * page's confirmation read «2 h-ից պակաս…». The units must not depend on the
 * locale data the runtime happens to ship, as `formatDram`'s grouping does not.
 */
describe('formatDuration without the locale data', () => {
  const RealNumberFormat = Intl.NumberFormat;
  const RealListFormat = Intl.ListFormat;

  async function loadRootOnly() {
    vi.resetModules();
    function RootNumbers(_locales?: string | string[], asked?: Intl.NumberFormatOptions) {
      return new RealNumberFormat('und', asked);
    }
    function RootLists(_locales?: string | string[], asked?: Intl.ListFormatOptions) {
      return new RealListFormat('und', asked);
    }
    vi.stubGlobal(
      'Intl',
      Object.create(Intl, {
        NumberFormat: { value: RootNumbers, configurable: true, writable: true },
        ListFormat: { value: RootLists, configurable: true, writable: true },
      }),
    );
    return import('./duration');
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('writes hy and ru units from our own words: ժ/ր, ч/мин', async () => {
    const duration = await loadRootOnly();
    expect(duration.formatDuration(35, 'hy')).toBe('35 ր');
    expect(duration.formatDuration(120, 'hy')).toBe('2 ժ');
    expect(duration.formatDuration(95, 'hy')).toBe('1 ժ 35 ր');
    expect(duration.formatDuration(35, 'ru')).toBe('35 мин');
    expect(duration.formatDuration(120, 'ru')).toBe('2 ч');
    expect(duration.formatDuration(95, 'ru')).toBe('1 ч 35 мин');
    expect(duration.formatDuration(0, 'hy')).toBe('0 ր');
  });

  it('carries them into the long countdown too', async () => {
    const duration = await loadRootOnly();
    expect(duration.formatCountdown(119 * 60, 'hy')).toBe('1 ժ 59 ր');
    expect(duration.formatCountdown(119 * 60, 'ru')).toBe('1 ч 59 мин');
  });
});

describe('formatDuration with the locale data', () => {
  it('reads as ICU writes hy and ru, so nothing changes where the data is there', () => {
    const icu = (tag: string, hours: number, minutes: number) => {
      const unit = (u: 'hour' | 'minute') =>
        new Intl.NumberFormat(tag, { style: 'unit', unit: u, unitDisplay: 'short' });
      if (hours === 0) return unit('minute').format(minutes);
      if (minutes === 0) return unit('hour').format(hours);
      return new Intl.ListFormat(tag, { style: 'narrow', type: 'unit' }).format([
        unit('hour').format(hours),
        unit('minute').format(minutes),
      ]);
    };
    for (const [locale, tag] of [
      ['hy', 'hy-AM'],
      ['ru', 'ru-RU'],
    ] as const) {
      for (const minutes of [1, 5, 21, 35, 60, 95, 120, 121, 600]) {
        expect(formatDuration(minutes, locale)).toBe(
          icu(tag, Math.floor(minutes / 60), minutes % 60),
        );
      }
    }
  });
});
