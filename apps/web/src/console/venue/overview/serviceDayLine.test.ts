import { i18next } from '@yalla/i18n';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../reports/testHarness';
import { serviceDayLine } from './serviceDayLine';

/**
 * The Overview header's date in our own words.
 *
 * On the hy console the line under the greeting read "M10 30, Fri · Yerevan
 * Centre · թարմացված 13:13": `Intl.DateTimeFormat` with `hy-AM` in a Chromium
 * that ships no Armenian locale data falls back to ICU's root month pattern,
 * which spells October "M10". The header now reads the day from the copy, so
 * what the browser's ICU knows about Armenian no longer matters.
 */

/** Friday 30 October 2026. */
const FRIDAY = '2026-10-30';

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * `Intl.DateTimeFormat` as a browser without Armenian data has it: any `hy`
 * request resolves to root-locale month names ("M10") and English weekdays,
 * while `ru` and `en` keep their own words. Node's full ICU knows Armenian, so
 * the symptom has to be staged to be asserted on.
 */
function stubIntlWithoutArmenian() {
  const Real = Intl.DateTimeFormat;
  const Fake = function (
    this: unknown,
    locale?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    const tag = Array.isArray(locale) ? locale[0] : locale;
    if (tag?.startsWith('hy')) {
      return {
        format: (date: Date) => {
          const english = new Real('en-GB', { ...options, timeZone: options?.timeZone ?? 'UTC' });
          const parts = english.formatToParts(date);
          const day = parts.find((part) => part.type === 'day')?.value ?? '';
          const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
          return `M${date.getUTCMonth() + 1} ${day}${weekday ? `, ${weekday}` : ''}`;
        },
      };
    }
    return new Real(locale, options);
  } as unknown as typeof Intl.DateTimeFormat;
  vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: Fake });
}

describe('serviceDayLine', () => {
  it('reproduces the bug: Intl in a browser without Armenian data spells October "M10"', () => {
    stubIntlWithoutArmenian();
    const intl = new Intl.DateTimeFormat('hy-AM', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${FRIDAY}T12:00:00Z`));
    expect(intl).toBe('M10 30, Fri');
    // The header no longer goes through Intl, so the same browser reads a real date.
    expect(serviceDayLine(FRIDAY, i18next.getFixedT('hy'))).toBe('30 հոկտեմբերի, ուրբաթ');
  });

  it('writes the hy date from the copy, in the genitive, with no Latin letters', () => {
    const line = serviceDayLine(FRIDAY, i18next.getFixedT('hy'));
    expect(line).toBe('30 հոկտեմբերի, ուրբաթ');
    expect(line).not.toMatch(/[A-Za-z]/u);
  });

  it('writes the ru date with the weekday first, the month in the genitive', () => {
    const line = serviceDayLine(FRIDAY, i18next.getFixedT('ru'));
    expect(line).toBe('Пятница, 30 октября');
    expect(line).not.toMatch(/[A-Za-z]/u);
  });

  it('writes the en date day-first, as the rest of the console does', () => {
    expect(serviceDayLine(FRIDAY, i18next.getFixedT('en'))).toBe('Friday, 30 October');
    expect(serviceDayLine('2026-10-18', i18next.getFixedT('en'))).toBe('Sunday, 18 October');
  });

  it('reads the weekday from the date itself, not from the clock', () => {
    vi.useFakeTimers({ now: new Date('2026-10-18T14:42:00Z') });
    try {
      expect(serviceDayLine('2027-01-01', i18next.getFixedT('en'))).toBe('Friday, 1 January');
      expect(serviceDayLine('2028-02-29', i18next.getFixedT('ru'))).toBe('Вторник, 29 февраля');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands back anything that is not a calendar date unchanged', () => {
    expect(serviceDayLine('not-a-date', i18next.getFixedT('en'))).toBe('not-a-date');
  });
});
