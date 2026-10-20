import { i18next } from '@yalla/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { freeCancellationDated, freeCancellationWords, whenWords } from './dayNames';
import { initTestI18n } from './testHarness';

/**
 * The Book sheet's dates in our own words (public-page phase 4).
 *
 * `Intl` prints hy dates in English wherever the browser has no Armenian data
 * — headless Chromium is one — so the free-cancellation line read «Անվճար
 * չեղարկում մինչև Oct 21, 2026, 15:00» on the hy page. These read the day
 * from the copy, the way the booking card's day chips do.
 */

const YEREVAN = 'Asia/Yerevan';
/** Tuesday 20 October 2026, 14:00 in Yerevan. */
const NOW = new Date('2026-10-20T10:00:00Z');
/** 15:00 in Yerevan on the 20th plus `days`. */
const at15 = (days: number) => new Date(Date.UTC(2026, 9, 20 + days, 11, 0)).toISOString();

beforeAll(async () => {
  await initTestI18n();
});

describe('freeCancellationWords', () => {
  it('says the time alone today, "tomorrow" for tomorrow, and the date after that', () => {
    const t = i18next.getFixedT('en');
    expect(freeCancellationWords(at15(0), YEREVAN, 'en', t, NOW)).toBe(
      'Free cancellation until 15:00',
    );
    expect(freeCancellationWords(at15(1), YEREVAN, 'en', t, NOW)).toBe(
      'Free cancellation until 15:00 tomorrow',
    );
    expect(freeCancellationWords(at15(3), YEREVAN, 'en', t, NOW)).toBe(
      'Free cancellation until 15:00 on Fri 23 October',
    );
  });

  it('says so once the time has passed', () => {
    const t = i18next.getFixedT('en');
    expect(freeCancellationWords(at15(-1), YEREVAN, 'en', t, NOW)).toBe(
      'The free-cancellation time has passed. Cancelling still helps the venue.',
    );
  });

  it('writes the hy and ru dates from the copy, with no English in them', () => {
    expect(freeCancellationWords(at15(3), YEREVAN, 'hy', i18next.getFixedT('hy'), NOW)).toBe(
      // The weekday in lower case inside a sentence, as hy writes it (review N10).
      'Անվճար չեղարկում մինչև ուրբ, 23 հոկտեմբերի, 15:00',
    );
    expect(freeCancellationWords(at15(1), YEREVAN, 'hy', i18next.getFixedT('hy'), NOW)).toBe(
      'Անվճար չեղարկում մինչև վաղը՝ 15:00',
    );
    const ru = freeCancellationWords(at15(3), YEREVAN, 'ru', i18next.getFixedT('ru'), NOW);
    expect(ru).toMatch(/^Бесплатная отмена до 15:00, /u);
    expect(ru).toBe('Бесплатная отмена до 15:00, пт, 23 октября');
    expect(ru).not.toMatch(/[A-Za-z]/u);
  });
});

describe('whenWords', () => {
  it('names the day and the time in the branch zone', () => {
    expect(whenWords(at15(1), YEREVAN, 'en', i18next.getFixedT('en'), NOW)).toBe(
      'Tomorrow, Wed 21 October · 15:00',
    );
    expect(whenWords(at15(3), YEREVAN, 'hy', i18next.getFixedT('hy'), NOW)).toBe(
      'Ուրբ, 23 հոկտեմբերի · 15:00',
    );
  });
});

describe('freeCancellationDated (the calendar file, review S1)', () => {
  it('always names the date, today and tomorrow included, and never says "passed"', () => {
    const t = i18next.getFixedT('en');
    expect(freeCancellationDated(at15(0), YEREVAN, 'en', t)).toBe(
      'Free cancellation until 15:00 on Tue 20 October',
    );
    expect(freeCancellationDated(at15(1), YEREVAN, 'en', t)).toBe(
      'Free cancellation until 15:00 on Wed 21 October',
    );
    expect(freeCancellationDated(at15(3), YEREVAN, 'hy', i18next.getFixedT('hy'))).toBe(
      'Անվճար չեղարկում մինչև ուրբ, 23 հոկտեմբերի, 15:00',
    );
  });
});
