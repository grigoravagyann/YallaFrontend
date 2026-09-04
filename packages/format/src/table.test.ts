import { describe, expect, it } from 'vitest';
import { formatSeatCount, formatTableLabel } from './table';

describe('formatTableLabel', () => {
  it('prefixes the floor area when there is one', () => {
    expect(formatTableLabel({ label: 'T12', areaName: 'Terrace' })).toBe('Terrace · T12');
  });

  it('omits the separator for a single-room venue', () => {
    expect(formatTableLabel({ label: 'T12' })).toBe('T12');
    expect(formatTableLabel({ label: 'T12', areaName: undefined })).toBe('T12');
  });

  it('treats a blank area name as absent', () => {
    expect(formatTableLabel({ label: 'T12', areaName: '   ' })).toBe('T12');
  });

  it('preserves the owner-authored label verbatim, including non-Latin scripts', () => {
    expect(formatTableLabel({ label: 'Բալկոն 2' })).toBe('Բալկոն 2');
    expect(formatTableLabel({ label: 'Стол 5', areaName: 'Зал' })).toBe('Зал · Стол 5');
  });

  it('trims incidental whitespace from the editor', () => {
    expect(formatTableLabel({ label: '  T12 ', areaName: ' Terrace ' })).toBe('Terrace · T12');
  });
});

describe('formatSeatCount', () => {
  it('formats the numeral only, leaving the noun to i18n', () => {
    expect(formatSeatCount(4, 'en')).toBe('4');
  });

  it('rejects fractional or negative seat counts', () => {
    expect(() => formatSeatCount(2.5, 'en')).toThrow(RangeError);
    expect(() => formatSeatCount(-1, 'en')).toThrow(RangeError);
  });
});
