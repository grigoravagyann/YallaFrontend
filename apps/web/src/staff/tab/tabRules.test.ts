import type { ServiceRequest, StaffTab, TabAdjustment, TabLine, TabTotals } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  NO_REQUEST,
  canVoidOrders,
  cashAmountFor,
  chosenBillRequest,
  initialsOf,
  lineStage,
  orderLinesOf,
  orderVoidable,
  tabSums,
  wholeMinutesSince,
} from './tabRules';

const TOTALS: TabTotals = {
  subtotalDram: 10_000,
  serviceChargeDram: 1_000,
  totalDram: 11_000,
  paidDram: 0,
  remainingDram: 11_000,
};

function request(id: string, bill: ServiceRequest['bill']): ServiceRequest {
  return { id, bill } as ServiceRequest;
}

function line(id: string, extra: Partial<TabLine>): TabLine {
  return {
    id,
    status: 'active',
    orderStatus: 'inKitchen',
    quantity: 1,
    lineTotalDram: 1_000,
    ...extra,
  } as TabLine;
}

describe('initialsOf', () => {
  it('takes the first letter of the first two words that are names', () => {
    expect(initialsOf('ani hakobyan')).toBe('AH');
    expect(initialsOf('Aram')).toBe('A');
    expect(initialsOf('(guest) Lilit Sargsyan Petrosyan')).toBe('LS');
    expect(initialsOf('')).toBe('');
  });
});

describe('lineStage', () => {
  it("is the order's stage, or voided for a voided line whatever its order did", () => {
    expect(lineStage(line('a', { orderStatus: 'ready' }))).toBe('ready');
    expect(lineStage(line('b', { status: 'voided', orderStatus: 'served' }))).toBe('voided');
  });
});

describe('chosenBillRequest', () => {
  const newest = request('r2', { scope: 'whole', amountDram: 11_000, tipPercent: 0, tipDram: 0 });
  const older = request('r1', { scope: 'mine', amountDram: 3_000, tipPercent: 10, tipDram: 300 });
  const requests = [newest, older];

  it('is the newest with no pick, or with a pick handled since', () => {
    expect(chosenBillRequest(requests, null)).toBe(newest);
    expect(chosenBillRequest(requests, 'gone')).toBe(newest);
  });

  it("is the waiter's pick, or none for none of these", () => {
    expect(chosenBillRequest(requests, 'r1')).toBe(older);
    expect(chosenBillRequest(requests, NO_REQUEST)).toBeNull();
    expect(chosenBillRequest([], null)).toBeNull();
  });
});

describe('cashAmountFor', () => {
  it('opens on the balance for the whole bill, or for no request', () => {
    const whole = request('r', { scope: 'whole', amountDram: 9_000, tipPercent: 0, tipDram: 0 });
    expect(cashAmountFor(TOTALS, whole)).toBe(11_000);
    expect(cashAmountFor(TOTALS, null)).toBe(11_000);
  });

  it('opens on a share, capped at what is left', () => {
    const mine = request('r', { scope: 'mine', amountDram: 3_000, tipPercent: 0, tipDram: 0 });
    expect(cashAmountFor(TOTALS, mine)).toBe(3_000);
    expect(cashAmountFor({ ...TOTALS, remainingDram: 2_000 }, mine)).toBe(2_000);
  });

  it('is nothing with no totals', () => {
    expect(cashAmountFor(undefined, null)).toBe(0);
  });
});

describe('tabSums', () => {
  it('sums the lines still on the bill and what the standing adjustments took off', () => {
    const tab = {
      totals: { ...TOTALS, paidDram: 500 },
      linesKnown: true,
      lines: [
        line('a', { quantity: 2, lineTotalDram: 4_000 }),
        line('b', { quantity: 1, lineTotalDram: 1_500 }),
        line('c', { status: 'voided', quantity: 3, lineTotalDram: 0 }),
      ],
      adjustments: [
        { id: 'x', isVoided: false, reductionDram: 700 } as TabAdjustment,
        { id: 'y', isVoided: true, reductionDram: 900 } as TabAdjustment,
      ],
    } as unknown as StaffTab;
    const sums = tabSums(tab);
    expect(sums.lines).toHaveLength(3);
    expect(sums.activeLines.map((each) => each.id)).toEqual(['a', 'b']);
    expect(sums.linesDram).toBe(5_500);
    expect(sums.dishCount).toBe(3);
    expect(sums.adjustments.map((each) => each.id)).toEqual(['x']);
    expect(sums.adjustedDram).toBe(700);
    expect(sums.paidAgainst).toBe(true);
    expect(sums.linesKnown).toBe(true);
  });

  it('is empty with no tab', () => {
    expect(tabSums(null)).toEqual({
      lines: [],
      linesKnown: false,
      adjustments: [],
      activeLines: [],
      linesDram: 0,
      dishCount: 0,
      adjustedDram: 0,
      paidAgainst: false,
    });
  });
});

describe('wholeMinutesSince', () => {
  const now = new Date('2026-10-26T19:30:00Z');

  it('counts whole minutes, rounding down', () => {
    expect(wholeMinutesSince(now, '2026-10-26T19:00:00Z')).toBe(30);
    expect(wholeMinutesSince(now, '2026-10-26T19:29:01Z')).toBe(0);
  });

  it('never goes below zero for an instant still ahead', () => {
    expect(wholeMinutesSince(now, '2026-10-26T19:45:00Z')).toBe(0);
  });
});

describe('voiding a whole order', () => {
  it('is every floor role but the kitchen, as the server allows it', () => {
    expect(
      ['waiter', 'manager', 'generalManager', 'owner', 'platformAdmin'].map((role) =>
        canVoidOrders(role as Parameters<typeof canVoidOrders>[0]),
      ),
    ).toEqual([true, true, true, true, true]);
    expect(canVoidOrders('kitchen')).toBe(false);
  });

  it('is only from new or in the kitchen, as the rail allows it', () => {
    expect(orderVoidable(line('a', { orderStatus: 'new' }))).toBe(true);
    expect(orderVoidable(line('a', { orderStatus: 'inKitchen' }))).toBe(true);
    expect(orderVoidable(line('a', { orderStatus: 'ready' }))).toBe(false);
    expect(orderVoidable(line('a', { orderStatus: 'served' }))).toBe(false);
    expect(orderVoidable(line('a', { orderStatus: 'voided' }))).toBe(false);
  });

  it("takes off the order's lines still on the bill, and nobody else's", () => {
    const lines = [
      line('a', { orderId: 'o1' }),
      line('b', { orderId: 'o1', status: 'voided' }),
      line('c', { orderId: 'o2' }),
      line('d', { orderId: 'o1' }),
    ];
    expect(orderLinesOf(lines, 'o1').map((entry) => entry.id)).toEqual(['a', 'd']);
  });
});
