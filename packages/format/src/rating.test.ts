import { describe, expect, it } from 'vitest';
import { formatRating } from './rating';

describe('formatRating', () => {
  it('writes one decimal with the decimal comma in hy and ru, the point in en', () => {
    expect(formatRating(4.7, 'hy')).toBe('4,7');
    expect(formatRating(4.7, 'ru')).toBe('4,7');
    expect(formatRating(4.7, 'en')).toBe('4.7');
  });

  it('keeps the decimal on a whole rating, so 4 reads as an average', () => {
    expect(formatRating(4, 'en')).toBe('4.0');
    expect(formatRating(5, 'hy')).toBe('5,0');
  });

  it('rounds to one decimal, as the server does', () => {
    expect(formatRating(4.66, 'en')).toBe('4.7');
    expect(formatRating(3.04, 'ru')).toBe('3,0');
  });
});
