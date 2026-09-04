import { describe, expect, it } from 'vitest';
import { FractionalDramError } from './errors';
import { DRAM_SIGN, formatDram, formatDramAmount } from './money';
import { LOCALES } from './locale';

/** ICU uses NBSP/narrow-NBSP as a group separator in hy and ru. */
const normalise = (value: string): string => value.replace(/[\u00A0\u202F\u2009]/gu, ' ');

describe('formatDram', () => {
  it('formats the spec example in English', () => {
    expect(normalise(formatDram(5610, 'en'))).toBe('5,610 ֏');
  });

  it('groups thousands in every locale, including hy where CLDR would not', () => {
    // Armenian CLDR sets minimumGroupingDigits=2, so an unforced formatter
    // renders "5610". A bill has to be readable at a glance.
    expect(normalise(formatDram(5610, 'hy'))).toBe('5 610 ֏');
    expect(normalise(formatDram(5610, 'ru'))).toBe('5 610 ֏');
  });

  it('puts the dram sign after the amount in every locale', () => {
    // en-GB would natively render "֏5,610".
    for (const locale of LOCALES) {
      expect(formatDram(5610, locale).endsWith(DRAM_SIGN)).toBe(true);
    }
  });

  it('joins the amount and sign with a non-breaking space so they never wrap apart', () => {
    expect(formatDram(5610, 'en')).toContain(' ֏');
  });

  it('formats zero', () => {
    expect(normalise(formatDram(0, 'en'))).toBe('0 ֏');
  });

  it('formats negative amounts (refunds) with the locale minus sign', () => {
    expect(normalise(formatDram(-2500, 'en'))).toBe('-2,500 ֏');
    expect(normalise(formatDram(-2500, 'ru'))).toBe('-2 500 ֏');
  });

  it('formats large amounts', () => {
    expect(normalise(formatDram(1234567, 'en'))).toBe('1,234,567 ֏');
  });

  it('leaves sub-thousand amounts ungrouped', () => {
    expect(normalise(formatDram(900, 'en'))).toBe('900 ֏');
  });

  it('never renders a subunit, because dram has none', () => {
    // Comparing digit-only forms: a "1,000" group separator is fine, a ".00"
    // fraction is not, and both would match a naive separator regex.
    for (const locale of LOCALES) {
      expect(formatDram(1000, locale).replace(/\D/gu, '')).toBe('1000');
      expect(formatDram(7, locale).replace(/\D/gu, '')).toBe('7');
    }
  });

  describe('rejects amounts that are not whole dram', () => {
    // A fractional dram means someone did arithmetic on the client.
    it.each([1500.5, 0.1, -3.25])('rejects %s', (amount) => {
      expect(() => formatDram(amount, 'en')).toThrow(FractionalDramError);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'rejects %s',
      (amount) => {
        expect(() => formatDram(amount, 'en')).toThrow(FractionalDramError);
      },
    );

    it('names the offending amount in the message', () => {
      expect(() => formatDram(1500.5, 'en')).toThrow(/1500\.5/);
    });

    it('carries the amount on the error for logging', () => {
      try {
        formatDram(1500.5, 'en');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FractionalDramError);
        expect((error as FractionalDramError).amount).toBe(1500.5);
      }
    });
  });

  it('returns a stable result across repeated calls (formatter memoisation)', () => {
    expect(formatDram(5610, 'hy')).toBe(formatDram(5610, 'hy'));
  });
});

describe('formatDramAmount', () => {
  it('omits the currency sign', () => {
    expect(normalise(formatDramAmount(5610, 'en'))).toBe('5,610');
    expect(formatDramAmount(5610, 'en')).not.toContain(DRAM_SIGN);
  });

  it('applies the same whole-dram guard', () => {
    expect(() => formatDramAmount(1500.5, 'en')).toThrow(FractionalDramError);
  });
});
