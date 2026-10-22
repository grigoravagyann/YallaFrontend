import { describe, expect, it } from 'vitest';
import { mapPillCompact } from './headerFit';

describe('the Map pill keeps its word while the greeting fits beside it', () => {
  it('stays a pill before anything is measured', () => {
    expect(mapPillCompact(0, 0, 0)).toBe(false);
  });

  it('keeps the word when the greeting fits at 390, drops it when it would be cut', () => {
    // 390 wide: 390 - 32 - 48 - 44 - 36 = 230 for the greeting and the pill.
    // A 32 px "Map" makes a 90 px pill, leaving 140 for the greeting.
    expect(mapPillCompact(390, 120, 32)).toBe(false);
    expect(mapPillCompact(390, 141, 32)).toBe(true);
  });
});
