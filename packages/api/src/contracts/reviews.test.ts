import { describe, expect, it } from 'vitest';
import { ANONYMOUS_AUTHOR, publicAuthorName } from './reviews';

/** The K8 author-name rule, with the backend's own cases first. */
describe('publicAuthorName', () => {
  it.each([
    ['ani@example.test', ANONYMOUS_AUTHOR],
    ['+374 91 000 999', ANONYMOUS_AUTHOR],
    ['Anahit Sargsyan', 'Anahit S.'],
    ['Անահիտ Սարգսյան', 'Անահիտ Ս.'],
  ])('%s → %s', (input, expected) => {
    expect(publicAuthorName(input)).toBe(expected);
  });

  it('drops anything that looks like contact details, and an empty name', () => {
    expect(publicAuthorName('www.example Deals')).toBe(ANONYMOUS_AUTHOR);
    expect(publicAuthorName('ani/2 x')).toBe(ANONYMOUS_AUTHOR);
    expect(publicAuthorName('   ')).toBe(ANONYMOUS_AUTHOR);
    expect(publicAuthorName(null)).toBe(ANONYMOUS_AUTHOR);
    expect(publicAuthorName('!!!')).toBe(ANONYMOUS_AUTHOR);
  });

  it('keeps letters and hyphens only, at most 24, and an initial only when the second word starts with a letter', () => {
    expect(publicAuthorName('Jean-Luc Picard')).toBe('Jean-Luc P.');
    expect(publicAuthorName("O'Neil Smith")).toBe('ONeil S.');
    expect(publicAuthorName('Ani 2nd')).toBe('Ani');
    expect(publicAuthorName('Ani')).toBe('Ani');
    expect(publicAuthorName(`${'a'.repeat(30)} Brown`)).toBe(`${'a'.repeat(24)} B.`);
  });
});
