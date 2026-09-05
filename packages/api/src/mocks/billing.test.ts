import { describe, expect, it } from 'vitest';
import {
  computeBill,
  percentOf,
  splitEvenly,
  type BillingLine,
  type BillingParticipant,
} from './billing';

/**
 * The mock's bill, against the rule the server's version exists to guarantee:
 * **the shares always sum to the total, to the dram.**
 *
 * An off-by-one here is not a rounding curiosity. The shares add up to less than
 * the total, the last person to pay is short by one, the tab will not close, and
 * a waiter sorts it out by hand while the table watches.
 */

function participant(id: string, overrides: Partial<BillingParticipant> = {}): BillingParticipant {
  return {
    participantId: id,
    displayName: id,
    isHost: false,
    status: 'approved',
    paidDram: 0,
    ...overrides,
  };
}

function line(id: string, overrides: Partial<BillingLine> = {}): BillingLine {
  return {
    lineId: id,
    ownerParticipantId: null,
    unitPriceDram: 1000,
    quantity: 1,
    isVoided: false,
    isSplitAcrossParticipants: false,
    shareParticipantIds: [],
    ...overrides,
  };
}

describe('splitting whole dram', () => {
  it('sums back exactly, with the remainder on the first part', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitEvenly(0, 4)).toEqual([0, 0, 0, 0]);
    expect(splitEvenly(7, 7)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('a percentage', () => {
  it('rounds half away from zero, once', () => {
    expect(percentOf(1000, 10)).toBe(100);
    // 2,405 at 10% is 240.5 — half-up, not banker's.
    expect(percentOf(2405, 10)).toBe(241);
    expect(percentOf(0, 10)).toBe(0);
    expect(percentOf(1000, 0)).toBe(0);
  });
});

describe('the service charge', () => {
  it('is its own line from the very first item', () => {
    const { bill } = computeBill({
      lines: [line('l1', { unitPriceDram: 1200, ownerParticipantId: 'p1' })],
      adjustments: [],
      participants: [participant('p1', { isHost: true })],
      serviceChargePercent: 10,
      paidDram: 0,
    });

    expect(bill.subtotalDram).toBe(1200);
    expect(bill.serviceChargeDram).toBe(120);
    expect(bill.totalDram).toBe(1320);
    expect(bill.remainingDram).toBe(1320);
  });

  it('is computed on what is left after a comp, not before it', () => {
    // Comping a dish comps its service charge with it. That is what a manager
    // means by comping a dish, and charging service on a free dish is the kind
    // of line a guest notices.
    const { bill } = computeBill({
      lines: [
        line('l1', { unitPriceDram: 1000, ownerParticipantId: 'p1' }),
        line('l2', { unitPriceDram: 1000, ownerParticipantId: 'p1' }),
      ],
      adjustments: [{ lineId: 'l2', percent: 100, amountDram: null }],
      participants: [participant('p1', { isHost: true })],
      serviceChargePercent: 10,
      paidDram: 0,
    });

    expect(bill.subtotalDram).toBe(1000);
    expect(bill.serviceChargeDram).toBe(100);
  });
});

describe('a voided line', () => {
  it('counts zero but stays on the bill', () => {
    const { bill, shares } = computeBill({
      lines: [
        line('l1', { unitPriceDram: 1000, ownerParticipantId: 'p1' }),
        line('l2', { unitPriceDram: 5000, ownerParticipantId: 'p1', isVoided: true }),
      ],
      adjustments: [],
      participants: [participant('p1', { isHost: true })],
      serviceChargePercent: 0,
      paidDram: 0,
    });

    expect(bill.subtotalDram).toBe(1000);
    expect(shares[0]?.ownItemsDram).toBe(1000);
  });
});

describe('a shared line', () => {
  it('splits across the people snapshotted on it, not everyone on the tab now', () => {
    // Three on the tab; the bottle was shared by two of them. The third joined
    // for dessert and does not owe for the starters.
    const { shares } = computeBill({
      lines: [
        line('l1', {
          unitPriceDram: 3000,
          isSplitAcrossParticipants: true,
          shareParticipantIds: ['p1', 'p2'],
        }),
      ],
      adjustments: [],
      participants: [participant('p1', { isHost: true }), participant('p2'), participant('p3')],
      serviceChargePercent: 0,
      paidDram: 0,
    });

    const byId = new Map(shares.map((s) => [s.participantId, s]));
    expect(byId.get('p1')?.sharedItemsDram).toBe(1500);
    expect(byId.get('p2')?.sharedItemsDram).toBe(1500);
    expect(byId.get('p3')?.sharedItemsDram).toBe(0);
  });

  it('gives the odd dram to the host', () => {
    const { shares } = computeBill({
      lines: [
        line('l1', {
          unitPriceDram: 1000,
          isSplitAcrossParticipants: true,
          shareParticipantIds: ['p1', 'p2', 'p3'],
        }),
      ],
      adjustments: [],
      participants: [participant('p2'), participant('p3'), participant('p1', { isHost: true })],
      serviceChargePercent: 0,
      paidDram: 0,
    });

    const byId = new Map(shares.map((s) => [s.participantId, s]));
    expect(byId.get('p1')?.sharedItemsDram).toBe(334);
    expect(byId.get('p2')?.sharedItemsDram).toBe(333);
    expect(byId.get('p3')?.sharedItemsDram).toBe(333);
  });
});

describe('a removed participant', () => {
  it('leaves what they ate on the host rather than on nobody', () => {
    const { bill, shares } = computeBill({
      lines: [line('l1', { unitPriceDram: 2000, ownerParticipantId: 'p2' })],
      adjustments: [],
      participants: [participant('p1', { isHost: true }), participant('p2', { status: 'removed' })],
      serviceChargePercent: 0,
      paidDram: 0,
    });

    const host = shares.find((s) => s.isHost);
    expect(host?.absorbedFromRemovedDram).toBe(2000);
    expect(bill.absorbedFromRemovedDram).toBe(2000);
    // Reported rather than folded in silently: the host can see why they owe it.
    expect(host?.shareDram).toBe(2000);
  });
});

describe('the shares', () => {
  /** Deterministic pseudo-random, so a failure is reproducible from its seed. */
  function rng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it('sum to the total across a few thousand random tabs', () => {
    const random = rng(20260906);
    let checked = 0;

    for (let trial = 0; trial < 2000; trial += 1) {
      const people = 1 + Math.floor(random() * 5);
      const participants = Array.from({ length: people }, (_, i) =>
        participant(`p${i}`, { isHost: i === 0, status: random() < 0.1 ? 'removed' : 'approved' }),
      );
      const ids = participants.map((p) => p.participantId);

      const lineCount = 1 + Math.floor(random() * 8);
      const lines = Array.from({ length: lineCount }, (_, i) => {
        const isShared = random() < 0.4;
        return line(`l${i}`, {
          // Prices that are not round hundreds, which is where rounding bugs live.
          unitPriceDram: 350 + Math.floor(random() * 4000),
          quantity: 1 + Math.floor(random() * 3),
          isVoided: random() < 0.1,
          isSplitAcrossParticipants: isShared,
          shareParticipantIds: isShared ? ids.filter(() => random() < 0.8) : [],
          ownerParticipantId: isShared ? null : (ids[Math.floor(random() * ids.length)] ?? null),
        });
      });

      const { bill, shares } = computeBill({
        lines,
        adjustments: random() < 0.2 ? [{ lineId: null, percent: 10, amountDram: null }] : [],
        participants,
        // Percentages that produce halves, so the single rounding point matters.
        serviceChargePercent: [0, 5, 10, 12.5][Math.floor(random() * 4)] ?? 10,
        paidDram: 0,
      });

      const summed = shares.reduce((sum, share) => sum + share.shareDram, 0);
      expect(summed).toBe(bill.totalDram);
      // And nobody is ever shown a negative amount owed.
      for (const share of shares) expect(share.shareDram).toBeGreaterThanOrEqual(0);
      checked += 1;
    }

    expect(checked).toBe(2000);
  });
});
