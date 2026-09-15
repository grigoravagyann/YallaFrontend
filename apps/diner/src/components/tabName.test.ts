import { describe, expect, it } from 'vitest';
import { TAB_NAME_MAX, hasOwnTabName, nameForTab, tidyTabName } from './tabName';

describe('tidyTabName', () => {
  it('trims, and gives null for nothing', () => {
    expect(tidyTabName('  Tigran ')).toBe('Tigran');
    expect(tidyTabName('   ')).toBeNull();
    expect(tidyTabName(null)).toBeNull();
    expect(tidyTabName(undefined)).toBeNull();
  });

  it('keeps within the server length without splitting a character', () => {
    expect(tidyTabName('a'.repeat(150))).toBe('a'.repeat(TAB_NAME_MAX));
    const emoji = '😀'.repeat(60); // 120 UTF-16 units
    const cut = tidyTabName(emoji)!;
    expect(cut.length).toBeLessThanOrEqual(TAB_NAME_MAX);
    expect(cut).toBe('😀'.repeat(50));
  });
});

describe('nameForTab', () => {
  it("prefers the account's name over the one remembered on the phone", () => {
    expect(nameForTab('Anahit Sargsyan', 'Ani')).toBe('Anahit Sargsyan');
  });

  it('falls back to the remembered name, then to none', () => {
    expect(nameForTab(null, ' Ani ')).toBe('Ani');
    expect(nameForTab('  ', 'Ani')).toBe('Ani');
    expect(nameForTab(null, null)).toBeNull();
  });
});

describe('hasOwnTabName', () => {
  it('is false for a blank name and for the server placeholder', () => {
    expect(hasOwnTabName('')).toBe(false);
    expect(hasOwnTabName(null)).toBe(false);
    expect(hasOwnTabName('Guest 3')).toBe(false);
  });

  it('is true for a real name', () => {
    expect(hasOwnTabName('Tigran')).toBe(true);
    expect(hasOwnTabName('Guest House crew')).toBe(true);
  });
});
