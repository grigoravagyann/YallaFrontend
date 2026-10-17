import { describe, expect, it } from 'vitest';
import { maskPhone } from './maskPhone';

describe('the masked phone on Profile', () => {
  it('keeps the calling code and the last two digits of an Armenian number', () => {
    expect(maskPhone('+37491000123')).toBe('+374 •• ••• •23');
  });

  it('knows a Russian number starts with 7', () => {
    expect(maskPhone('+79161234567')).toBe('+7 •• ••• •••67');
  });

  it('leaves something too short to be a number alone', () => {
    expect(maskPhone('+3741')).toBe('+3741');
  });
});
