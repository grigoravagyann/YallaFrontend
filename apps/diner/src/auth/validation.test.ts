import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeUsername,
} from './validation';

describe('a phone number', () => {
  it('joins the country code and the local digits into E.164', () => {
    expect(normalizePhone('+374', '77123456')).toBe('+37477123456');
  });

  it('drops the spaces, dashes and brackets people type', () => {
    expect(normalizePhone('+374', '77 123 456')).toBe('+37477123456');
    expect(normalizePhone('+1', '(212) 555-0199')).toBe('+12125550199');
    expect(normalizePhone(' +374 ', '77123456')).toBe('+37477123456');
  });

  it('drops one national trunk zero, which is not part of the number abroad', () => {
    expect(normalizePhone('+374', '077 123 456')).toBe('+37477123456');
    expect(normalizePhone('+374', '0 77 12 34 56')).toBe('+37477123456');
    // The zero is dropped before the digits are counted: five is too few.
    expect(normalizePhone('+374', '012345')).toBeNull();
  });

  it('takes a number that already carries its own country code whole', () => {
    expect(normalizePhone('+1', '+374 77 123 456')).toBe('+37477123456');
    expect(normalizePhone('+1', '00374 77 123 456')).toBe('+37477123456');
    expect(normalizePhone('', '+37477123456')).toBe('+37477123456');
    expect(normalizePhone('+374', '+0374 77123456')).toBeNull();
    expect(normalizePhone('+374', '+374 771')).toBeNull();
  });

  it('needs a country code that starts with + and has one to four digits, the first not zero', () => {
    expect(normalizePhone('374', '77123456')).toBeNull();
    expect(normalizePhone('+', '77123456')).toBeNull();
    expect(normalizePhone('+0374', '77123456')).toBeNull();
    expect(normalizePhone('+37412', '77123456')).toBeNull();
    expect(normalizePhone('+3a', '77123456')).toBeNull();
  });

  it('needs six to twelve local digits', () => {
    expect(normalizePhone('+374', '12345')).toBeNull();
    expect(normalizePhone('+374', '123456')).toBe('+374123456');
    expect(normalizePhone('+374', '123456789012')).toBe('+374123456789012');
    expect(normalizePhone('+374', '1234567890123')).toBeNull();
  });

  it('refuses letters in the local number rather than silently dropping them', () => {
    expect(normalizePhone('+374', '77abc456')).toBeNull();
    expect(normalizePhone('+374', '')).toBeNull();
  });
});

describe('an email address', () => {
  it('accepts an ordinary address, with surrounding spaces', () => {
    expect(isValidEmail('ani@example.com')).toBe(true);
    expect(isValidEmail('  ani.avagyan+yalla@mail.example.am ')).toBe(true);
  });

  it('rejects what could not receive mail', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
    expect(isValidEmail('ani')).toBe(false);
    expect(isValidEmail('ani@gmail')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('ani @example.com')).toBe(false);
    expect(isValidEmail('ani@example.c')).toBe(false);
  });

  it('rejects an address longer than the wire allows', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('the name the venue asks for', () => {
  it('is trimmed and its inner spaces collapsed', () => {
    expect(normalizeName('  Ani   Avagyan ')).toBe('Ani Avagyan');
    expect(normalizeName('Ani\tAvagyan')).toBe('Ani Avagyan');
  });

  it('is nothing when only spaces were typed', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('   ')).toBeNull();
  });

  it('composes combining marks and drops invisible format characters', () => {
    expect(normalizeName('Ané')).toBe('Ané');
    expect(normalizeName('Ani​ Avagyan‎')).toBe('Ani Avagyan');
    expect(normalizeName('​')).toBeNull();
  });

  it('keeps a single character and refuses more than sixty', () => {
    expect(normalizeName('A')).toBe('A');
    expect(normalizeName('a'.repeat(60))).toBe('a'.repeat(60));
    expect(normalizeName('a'.repeat(61))).toBeNull();
  });
});

describe('a username', () => {
  it('is lowercased and trimmed, as the server stores it', () => {
    expect(normalizeUsername(' Ani.Petrosyan_7 ')).toBe('ani.petrosyan_7');
  });

  it('needs three to thirty of letters, digits, dots and underscores, starting with a letter or digit', () => {
    expect(normalizeUsername('an')).toBeNull();
    expect(normalizeUsername('a'.repeat(31))).toBeNull();
    expect(normalizeUsername('a'.repeat(30))).toBe('a'.repeat(30));
    expect(normalizeUsername('.ani')).toBeNull();
    expect(normalizeUsername('_ani')).toBeNull();
    expect(normalizeUsername('ani-p')).toBeNull();
    expect(normalizeUsername('ani p')).toBeNull();
    expect(normalizeUsername('Անի')).toBeNull();
    expect(normalizeUsername('7ani')).toBe('7ani');
  });
});

describe('an email, as stored', () => {
  it('is trimmed and lowercased', () => {
    expect(normalizeEmail(' Ani@Example.COM ')).toBe('ani@example.com');
  });

  it('is null when it is not an address', () => {
    expect(normalizeEmail('ani@gmail')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});

describe('a password', () => {
  it('is eight to a hundred and twenty-eight characters, whatever they are', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('պատուհան ծաղիկ')).toBe(true);
    expect(isValidPassword('x'.repeat(128))).toBe(true);
    expect(isValidPassword('x'.repeat(129))).toBe(false);
  });
});
