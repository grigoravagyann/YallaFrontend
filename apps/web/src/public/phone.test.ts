import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';

describe('a phone number on the public page', () => {
  it('reads an Armenian number in pairs after the code, as the artboards write it', () => {
    expect(formatPhone('+37411223344')).toBe('+374 11 22 33 44');
    expect(formatPhone('+37410500501')).toBe('+374 10 50 05 01');
  });

  it('leaves anything else as it was given, rather than guessing a grouping', () => {
    expect(formatPhone('+442071234567')).toBe('+442071234567');
    expect(formatPhone('+3741122')).toBe('+3741122');
  });
});
