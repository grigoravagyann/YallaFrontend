import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, intlTag, isLocale } from './locale';

describe('locales', () => {
  it('ships hy, ru and en', () => {
    expect([...LOCALES]).toEqual(['hy', 'ru', 'en']);
  });

  it('falls back to Armenian', () => {
    expect(DEFAULT_LOCALE).toBe('hy');
  });

  it('maps each locale to a region-qualified Intl tag', () => {
    // Bare `ru` resolves to Russian conventions; the branch is in Armenia.
    expect(intlTag('hy')).toBe('hy-AM');
    expect(intlTag('ru')).toBe('ru-AM');
    expect(intlTag('en')).toBe('en-GB');
  });

  it('every tag is accepted by Intl', () => {
    for (const locale of LOCALES) {
      expect(() => new Intl.NumberFormat(intlTag(locale))).not.toThrow();
    }
  });

  describe('isLocale', () => {
    it.each(LOCALES)('accepts %s', (locale) => {
      expect(isLocale(locale)).toBe(true);
    });

    it.each([['fr'], ['HY'], [''], [null], [undefined], [42], [{}]])('rejects %s', (value) => {
      expect(isLocale(value)).toBe(false);
    });
  });
});
