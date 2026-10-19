import { describe, expect, it } from 'vitest';
import { serviceHours } from './hours';

/** 24 amounts, with takings in the given hours. */
const day = (open: readonly number[]) =>
  Array.from({ length: 24 }, (_, hour) => (open.includes(hour) ? 100 : 0));

describe('the hours a by-hour chart draws', () => {
  it('runs a day service from its first hour to its last', () => {
    expect(serviceHours(day([8, 9, 10, 14, 22]))).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);
  });

  it('keeps a bar open past midnight together: 23, 00, 01', () => {
    expect(serviceHours(day([18, 19, 20, 21, 22, 23, 0, 1]))).toEqual([
      18, 19, 20, 21, 22, 23, 0, 1,
    ]);
  });

  it('draws nothing for a day that took nothing', () => {
    expect(serviceHours(day([]))).toEqual([]);
  });
});
