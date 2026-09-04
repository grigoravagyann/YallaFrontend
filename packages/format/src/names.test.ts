import { describe, expect, it } from 'vitest';
import { formatNameList } from './names';

describe('formatNameList', () => {
  it('joins two names the way the language does, not with a comma', () => {
    expect(formatNameList(['Aram', 'Nare'], 'en')).toBe('Aram and Nare');
  });

  it('joins three, keeping the last conjunction where CLDR puts it', () => {
    expect(formatNameList(['Aram', 'Nare', '1 guest'], 'en')).toBe('Aram, Nare and 1 guest');
  });

  it('uses the Armenian and Russian conjunctions rather than the English one', () => {
    const hy = formatNameList(['Արամ', 'Նարե'], 'hy');
    const ru = formatNameList(['Арам', 'Наре'], 'ru');

    expect(hy).toContain('Արամ');
    expect(hy).toContain('Նարե');
    expect(hy).not.toContain('and');
    expect(ru).toContain('и');
    expect(ru).not.toContain('and');
  });

  it('a single name is just the name', () => {
    expect(formatNameList(['Aram'], 'en')).toBe('Aram');
  });

  it('an empty or blank-only list is empty, not a crash', () => {
    expect(formatNameList([], 'en')).toBe('');
    expect(formatNameList(['  ', ''], 'en')).toBe('');
  });
});
