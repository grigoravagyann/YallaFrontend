import { createMockGateway, mockTableCode, type DinerTabLine, type DinerTabView } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { ownItemsSubtotalDram, projectTab } from './projection';

/**
 * What a diner is shown, and what they are deliberately not shown.
 *
 * The case that matters is the guest whose host has hidden the table total. The
 * failure to guard against is not an exception — it is a screen that renders
 * `0 ֏` where there should be nothing at all, which reads as a free meal.
 */

const ME = 'p-me';
const THEM = 'p-them';
const ZONE = 'Asia/Yerevan';

function line(id: string, overrides: Partial<DinerTabLine> = {}): DinerTabLine {
  return {
    id,
    name: 'Cappuccino',
    quantity: 1,
    unitPriceDram: 1200,
    lineTotalDram: 1200,
    isShared: false,
    participantId: ME,
    orderedByName: 'AM',
    orderId: 'o1',
    menuItemId: 'm1',
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
    tabId: 'tab-1',
    branchId: 'b1',
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    timeZoneId: ZONE,
    tableLabel: '7',
    status: 'open',
    settlementMode: 'everyonePaysOwnItems',
    settlementModeLocked: false,
    hostParticipantId: ME,
    hideTotalFromGuests: false,
    me: {
      participantId: ME,
      displayName: 'Ani',
      role: 'host',
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-09-06T09:00:00Z',
    },
    participants: [
      { participantId: ME, displayName: 'Ani', role: 'host', status: 'approved' },
      { participantId: THEM, displayName: 'Davit', role: 'guest', status: 'approved' },
    ],
    myLines: [line('l1')],
    tableLines: [line('l1')],
    money: {
      kind: 'table',
      bill: {
        subtotalDram: 1200,
        serviceChargeDram: 120,
        totalDram: 1320,
        paidDram: 0,
        remainingDram: 1320,
      },
    },
    serviceChargePercent: 10,
    adjustments: [],
    maxSequence: 3,
    openedAtUtc: '2026-09-06T09:00:00Z',
    closedAtUtc: null,
    fetchedAtUtc: '2026-09-06T10:01:00Z',
    ...overrides,
  };
}

// --- the permission projection ---------------------------------------------

describe('a participant who may see the table total', () => {
  it('gets the subtotal, the service charge as its own line, and the total', () => {
    const rendered = projectTab(tab(), ZONE);

    expect(rendered.showsTableTotal).toBe(true);
    if (rendered.money.kind !== 'table') throw new Error('expected the table branch');

    expect(rendered.money.subtotalDram).toBe(1200);
    // Its own line, from the very first item, never folded into the total.
    expect(rendered.money.serviceChargeDram).toBe(120);
    expect(rendered.money.totalDram).toBe(1320);
  });

  it('carries the venue rate on the tab, not inside the aggregate', () => {
    const rendered = projectTab(tab(), ZONE);
    // The tab read carries the rate for everyone; it is a fact about the
    // venue, so it is not on the money union a hidden total takes away.
    expect(rendered.serviceChargePercent).toBe(10);
    expect(rendered.money).not.toHaveProperty('serviceChargePercent');
  });

  it('sees everyone at the table, not only their own lines', () => {
    const rendered = projectTab(
      tab({
        myLines: [line('l1')],
        tableLines: [line('l1'), line('l2', { participantId: THEM, orderedByName: 'DV' })],
      }),
      ZONE,
    );

    expect(rendered.tableLines).toHaveLength(2);
    expect(rendered.tableLines?.map((l) => l.isMine)).toEqual([true, false]);
  });
});

// --- Test 2: the hidden-total branch ---------------------------------------

describe('a participant whose host has hidden the total', () => {
  const hidden = tab({
    me: { ...tab().me, canSeeTableTotal: false },
    // The wire sends no `tableLines` at all when the total is hidden, and the
    // mapper turns that absence into `null` rather than `[]`.
    tableLines: null,
    money: { kind: 'ownItemsOnly', yourItemsSubtotalDram: 1200 },
  });

  it('renders their own lines and their own subtotal', () => {
    const rendered = projectTab(hidden, ZONE);

    expect(rendered.showsTableTotal).toBe(false);
    expect(rendered.myLines).toHaveLength(1);
    if (rendered.money.kind !== 'ownItemsOnly') throw new Error('expected the own-items branch');
    expect(rendered.money.yourItemsSubtotalDram).toBe(1200);
  });

  it('has no table aggregate at all — the absence, not a zero', () => {
    const rendered = projectTab(hidden, ZONE);

    // The assertion is on **absence**, not on a falsy value. A `totalDram` of
    // `0` would satisfy `toBeFalsy()` and would render as a free meal, which is
    // the exact failure the union exists to make unrepresentable.
    expect(rendered.money).not.toHaveProperty('totalDram');
    expect(rendered.money).not.toHaveProperty('subtotalDram');
    expect(rendered.money).not.toHaveProperty('remainingDram');
    expect(rendered.money).not.toHaveProperty('serviceChargeDram');
    expect(Object.keys(rendered.money).sort()).toEqual(['kind', 'yourItemsSubtotalDram']);
  });

  it('distinguishes "not shown the table" from "the table ordered nothing"', () => {
    // `null` and `[]` must not be the same value. A guest with the total hidden
    // gets `null`; a host at an empty table gets `[]`.
    expect(projectTab(hidden, ZONE).tableLines).toBeNull();
    expect(projectTab(tab({ tableLines: [] }), ZONE).tableLines).toEqual([]);
  });

  it('is not narrowed by whether the aggregate happened to arrive', () => {
    // The narrowing lives in the mapper and keys on `tableTotalVisible`. What
    // reaches a screen is a discriminated union, so there is no presence test
    // left to get wrong here — `kind` is the only way in.
    const rendered = projectTab(hidden, ZONE);
    expect(rendered.money.kind).toBe('ownItemsOnly');
  });
});

// --- Test 2, against the real response shape --------------------------------

describe('the shares read against the wire', () => {
  it('gives the host the table branch', async () => {
    // Through the mock gateway, which applies the same permission rule the
    // server does and produces the same union.
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const host = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t7'),
      commandId: '77777777-7777-4777-8777-777777777777',
    });

    const shares = await gateway.getTabShares(host.tab.tabId);
    // The host still sees everything.
    expect(shares?.kind).toBe('table');
  });
});

// --- voided lines -----------------------------------------------------------

describe('a line a waiter voided', () => {
  it('arrives marked, with the reason, and is never drawn as a live free item', () => {
    // The server keeps a voided line in both arrays with `isVoided` and the
    // reason, worth zero. This used to assert the opposite — that it never
    // arrived — which pinned the bill drawing it as "1× Khorovats … 0 ֏".
    const rendered = projectTab(
      tab({
        myLines: [
          line('l1'),
          line('l2', { isVoided: true, lineTotalDram: 0, voidReason: 'Wrong item' }),
        ],
      }),
      ZONE,
    );

    expect(rendered.myLines.map((l) => l.isVoided)).toEqual([false, true]);
    expect(rendered.myLines[1]?.voidReason).toBe('Wrong item');
    // And it counts toward nothing this person owes.
    expect(ownItemsSubtotalDram(rendered.myLines)).toBe(1200);
  });
});

// --- own subtotal -----------------------------------------------------------

describe('the participant own subtotal', () => {
  it('counts unshared lines only, as the server does', () => {
    const rendered = projectTab(
      tab({
        myLines: [
          line('l1'),
          line('l2', { isShared: true, lineTotalDram: 4500 }),
          line('l3', { participantId: THEM, lineTotalDram: 900 }),
        ],
      }),
      ZONE,
    );

    // The shared bottle is apportioned by `/shares`, not added whole to one
    // person; somebody else's line is not theirs at all.
    expect(ownItemsSubtotalDram(rendered.myLines)).toBe(1200);
  });
});

// --- the branch zone --------------------------------------------------------

describe('times', () => {
  it('carries the branch zone through, never the device one', () => {
    // Passed in from the tab read's own zone, never the device's.
    expect(projectTab(tab(), 'Asia/Yerevan').timeZoneId).toBe('Asia/Yerevan');
    expect(projectTab(tab(), 'Europe/Moscow').timeZoneId).toBe('Europe/Moscow');
  });
});

// --- ordering permission ----------------------------------------------------

describe('whether more can go on the tab', () => {
  it('reads the server flag rather than reassembling it', () => {
    expect(projectTab(tab(), ZONE).acceptsOrders).toBe(true);

    // A tab the waiter marked closing: the server computes `canOrderNow` false
    // by the same rule the ordering endpoint enforces.
    const closing = tab({
      status: 'closing',
      me: { ...tab().me, canOrderNow: false },
    });
    expect(projectTab(closing, ZONE).acceptsOrders).toBe(false);
  });
});
