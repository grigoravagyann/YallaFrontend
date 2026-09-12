import { describe, expect, it } from 'vitest';
import { branchHoursLine } from './branchHours';

describe('the hours line on a branch row', () => {
  it('says when a shut branch opens, and only "closed" when it does not know', () => {
    expect(branchHoursLine({ kind: 'closed' }, { opensAt: '09:00', closesAt: null })).toEqual({
      key: 'branches.opensAt',
      params: { time: '09:00' },
    });
    // A stale closesAt on a shut branch must not turn it into "open until".
    expect(branchHoursLine({ kind: 'closed' }, { opensAt: null, closesAt: '23:00' })).toEqual({
      key: 'branches.closed',
      params: {},
    });
  });

  it('says until when an open branch is open, whether or not tables are free', () => {
    expect(
      branchHoursLine({ kind: 'freeNow', count: 4 }, { opensAt: null, closesAt: '23:00' }),
    ).toEqual({ key: 'branches.openUntil', params: { time: '23:00' } });
    expect(branchHoursLine({ kind: 'noneFreeNow' }, { opensAt: null, closesAt: null })).toEqual({
      key: 'branches.openNow',
      params: {},
    });
  });
});
