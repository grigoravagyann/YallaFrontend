import type { DinerTabLine, DinerTabView } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { paymentRows, projectTab } from './projection';

const ZONE = 'Asia/Yerevan';

function line(id: string, overrides: Partial<DinerTabLine> = {}): DinerTabLine {
  return {
    id,
    orderId: 'o1',
    menuItemId: 'm1',
    name: 'Khorovats',
    quantity: 1,
    unitPriceDram: 4500,
    lineTotalDram: 4500,
    isShared: false,
    participantId: 'p-me',
    orderedByName: 'Ani',
    note: null,
    orderStatus: 'inKitchen',
    sharedWithCount: 0,
    isVoided: false,
    voidReason: null,
    voidedAtUtc: null,
    ...overrides,
  };
}

function tab(overrides: Partial<DinerTabView> = {}): DinerTabView {
  return {
    tabId: 't1',
    branchId: 'b1',
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    timeZoneId: ZONE,
    tableLabel: '7',
    status: 'open',
    settlementMode: 'anyonePaysAnyAmount',
    settlementModeLocked: false,
    hostParticipantId: 'p-me',
    hideTotalFromGuests: false,
    me: {
      participantId: 'p-me',
      displayName: 'Ani',
      role: 'host',
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-09-06T09:00:00Z',
    },
    participants: [{ participantId: 'p-me', displayName: 'Ani', role: 'host', status: 'approved' }],
    myLines: [line('l1')],
    tableLines: [line('l1')],
    money: {
      kind: 'table',
      bill: {
        subtotalDram: 4500,
        serviceChargeDram: 450,
        totalDram: 4950,
        paidDram: 0,
        remainingDram: 4950,
      },
    },
    serviceChargePercent: 10,
    adjustments: [],
    maxSequence: 4,
    openedAtUtc: '2026-09-06T09:00:00Z',
    closedAtUtc: null,
    fetchedAtUtc: '2026-09-06T10:00:00Z',
    ...overrides,
  };
}

describe('the bill, as the server now sends it', () => {
  it('keeps a line staff removed, marked, with their reason', () => {
    const removed = line('l2', {
      name: 'Lemonade',
      isVoided: true,
      lineTotalDram: 0,
      voidReason: 'Spilled',
    });
    const rendered = projectTab(tab({ myLines: [line('l1'), removed] }), ZONE);

    expect(rendered.myLines[1]).toMatchObject({
      name: 'Lemonade',
      isVoided: true,
      voidReason: 'Spilled',
    });
  });

  it('carries the service-charge rate, for everyone', () => {
    const hidden = tab({
      tableLines: null,
      money: { kind: 'ownItemsOnly', yourItemsSubtotalDram: 4500 },
    });
    expect(projectTab(hidden, ZONE).serviceChargePercent).toBe(10);
  });

  it('shows a comp with its reason, and not one that was reversed', () => {
    const rendered = projectTab(
      tab({
        adjustments: [
          {
            id: 'a1',
            kind: 'comp',
            lineId: null,
            percent: null,
            amountDram: 1000,
            reductionDram: 1000,
            reason: 'Birthday',
            isVoided: false,
            atUtc: '2026-09-06T10:00:00Z',
          },
          {
            id: 'a2',
            kind: 'discount',
            lineId: null,
            percent: 10,
            amountDram: null,
            reductionDram: 450,
            reason: 'Mistake',
            isVoided: true,
            atUtc: '2026-09-06T10:00:00Z',
          },
        ],
      }),
      ZONE,
    );

    expect(rendered.adjustments).toEqual([
      { id: 'a1', kind: 'comp', reductionDram: 1000, reason: 'Birthday' },
    ]);
  });

  it('says what has been paid and what is left once a payment is in', () => {
    const paid = projectTab(
      tab({
        money: {
          kind: 'table',
          bill: {
            subtotalDram: 4500,
            serviceChargeDram: 450,
            totalDram: 4950,
            paidDram: 2000,
            remainingDram: 2950,
          },
        },
      }),
      ZONE,
    );

    expect(paymentRows(paid.money)).toEqual({ paidDram: 2000, remainingDram: 2950 });
    expect(paymentRows(projectTab(tab(), ZONE).money)).toBeNull();
  });
});
