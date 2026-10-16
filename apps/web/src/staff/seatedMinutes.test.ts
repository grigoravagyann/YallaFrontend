import { describe, expect, it } from 'vitest';
import { seatedMinutes } from './seatedMinutes';

describe('how long a party has been seated, on the floor list', () => {
  it('says 0 rather than "-2 min" when the tablet clock is behind the server', () => {
    expect(seatedMinutes(-2)).toBe(0);
  });

  it('says nothing rather than "NaN min" for a timestamp it cannot read', () => {
    expect(seatedMinutes(Number.NaN)).toBeNull();
    expect(seatedMinutes(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('passes a real count through', () => {
    expect(seatedMinutes(0)).toBe(0);
    expect(seatedMinutes(47)).toBe(47);
  });
});
