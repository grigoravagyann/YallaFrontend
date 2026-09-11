import { describe, expect, it } from 'vitest';
import type { BranchSummary, VenueSummary } from './booking';
import { branchAvailability, isVenueOpenNow, venueAvailability, venueFreeTables } from './helpers';

/**
 * "N tables free now", said only where it is true.
 *
 * The wire's `freeTableCount` is the number of tables nobody is sitting at *this
 * second*. After hours every table at a shut venue is free by that measure, so a
 * sum over every branch told a diner at 02:00 that every venue in the city had
 * its whole room free. And zero only means every table is taken right now — not
 * that the night is booked out.
 */

function branch(over: Partial<BranchSummary> = {}): BranchSummary {
  return {
    id: 'b1',
    slug: 'northern-avenue',
    venueId: 'lumen-coffee',
    venueName: 'Lumen Coffee',
    name: 'Northern Avenue',
    addressLine: 'Northern Avenue 5',
    timeZoneId: 'Asia/Yerevan',
    openState: { isOpen: true, closesAtUtc: null, opensAtUtc: null },
    freeTables: 3,
    ...over,
  };
}

function venue(branches: BranchSummary[]): VenueSummary {
  return { id: 'lumen-coffee', name: 'Lumen Coffee', type: 'cafe', branches };
}

const CLOSED = { isOpen: false, closesAtUtc: null, opensAtUtc: null } as const;

describe('free tables, counted where somebody could sit down', () => {
  it('does not count the free tables of a branch that is shut', () => {
    const shut = branch({ id: 'b2', openState: CLOSED, freeTables: 20 });
    expect(venueFreeTables(venue([branch(), shut]))).toBe(3);
  });

  it('says a shut venue is closed, not that its room is free', () => {
    const shut = venue([branch({ openState: CLOSED, freeTables: 20 })]);
    expect(isVenueOpenNow(shut)).toBe(false);
    expect(venueAvailability(shut)).toEqual({ kind: 'closed' });
  });

  it('says none are free right now when an open venue has every table taken', () => {
    expect(venueAvailability(venue([branch({ freeTables: 0 })]))).toEqual({
      kind: 'noneFreeNow',
    });
  });

  it('gives the count when an open branch has room', () => {
    expect(venueAvailability(venue([branch()]))).toEqual({ kind: 'freeNow', count: 3 });
  });

  it('reads a single branch the same way', () => {
    expect(branchAvailability(branch({ openState: CLOSED, freeTables: 9 }))).toEqual({
      kind: 'closed',
    });
    expect(branchAvailability(branch({ freeTables: 0 }))).toEqual({ kind: 'noneFreeNow' });
    expect(branchAvailability(branch({ freeTables: 2 }))).toEqual({ kind: 'freeNow', count: 2 });
  });
});
