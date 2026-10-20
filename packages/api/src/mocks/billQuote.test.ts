import { describe, expect, it } from 'vitest';
import type { ParticipantShare, TabBill } from '../contracts/ordering';
import type { TableTab, TabParticipant } from '../contracts/tab';
import { ForbiddenError } from '../errors';
import { percentOf, proRata, quoteBill } from './billing';
import { mockBranchMenu, mockMenuItem } from './menuDetail';
import { createMockGateway } from './mockGateway';
import { mockTableCode } from './tableCodes';
import { createTabOrders } from './tabOrders';

/**
 * A bill request priced by the shared money rules — the same figures the
 * server's `BillQuote.For` and the diner's pay sheet work out — and the floor
 * the mock plays around it: a newer request replacing an open one, cash
 * credited to whoever it was for, and a waiter who settles and closes the tab
 * so the receipt's tip row can be reached on one phone.
 */

const NOW = '2026-10-20T18:00:00.000Z';

function bill(overrides: Partial<TabBill> = {}): TabBill {
  return {
    subtotalDram: 14000,
    serviceChargeDram: 1400,
    totalDram: 15400,
    paidDram: 0,
    remainingDram: 15400,
    absorbedFromRemovedDram: 0,
    ...overrides,
  };
}

function share(overrides: Partial<ParticipantShare> = {}): ParticipantShare {
  return {
    participantId: 'p-you',
    displayName: 'Ani',
    isHost: true,
    status: 'approved',
    ownItemsDram: 9600,
    sharedItemsDram: 0,
    absorbedFromRemovedDram: 0,
    personalDram: 9600,
    serviceChargeDram: 960,
    shareDram: 10560,
    paidDram: 0,
    ...overrides,
  };
}

describe('the shared rounding', () => {
  it('takes a fraction of an amount half-up, away from zero, as Money.ProRata does', () => {
    expect(proRata(5, 1, 2)).toBe(3); // 2.5
    expect(proRata(10, 1, 4)).toBe(3); // 2.5
    expect(proRata(2, 1, 3)).toBe(1); // 0.67
    expect(proRata(1, 1, 3)).toBe(0); // 0.33
    expect(proRata(-5, 1, 2)).toBe(-3);
    expect(proRata(9_999_999, 9_999_999, 10_000_000)).toBe(9_999_998);
  });

  it('is nothing for nothing: no amount, no numerator, no denominator', () => {
    expect(proRata(0, 3, 4)).toBe(0);
    expect(proRata(100, 0, 4)).toBe(0);
    expect(proRata(100, 3, 0)).toBe(0);
    expect(proRata(100, -1, 4)).toBe(0);
  });
});

describe('a bill request, priced', () => {
  it('asks for the whole remaining balance, the tip on exactly the items when nothing is paid', () => {
    expect(
      quoteBill({
        bill: bill(),
        share: share(),
        scope: 'whole',
        tipPercent: 5,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 15400, tipDram: 700 });
  });

  it('tips the whole bill on the unpaid part of the items only', () => {
    // 14,000 × 10,400 / 15,400 = 9,454.5… → 9,455; 10% → 945.5 → 946.
    expect(
      quoteBill({
        bill: bill({ paidDram: 5000, remainingDram: 10400 }),
        share: share(),
        scope: 'whole',
        tipPercent: 10,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 10400, tipDram: 946 });
  });

  it('asks for my share less what I paid, the tip on my unpaid items', () => {
    expect(
      quoteBill({
        bill: bill(),
        share: share(),
        scope: 'mine',
        tipPercent: 10,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 10560, tipDram: 960 });

    // 9,600 × 6,560 / 10,560 = 5,963.6… → 5,964; 15% → 894.6 → 895.
    expect(
      quoteBill({
        bill: bill({ paidDram: 4000, remainingDram: 11400 }),
        share: share({ paidDram: 4000 }),
        scope: 'mine',
        tipPercent: 15,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 6560, tipDram: 895 });
  });

  it('caps my share at what the tab still owes only for somebody shown the total', () => {
    // A payment taken against the table lowered the balance, not my share.
    const paidAtTheTable = bill({ paidDram: 12400, remainingDram: 3000 });

    // 9,600 × 3,000 / 10,560 = 2,727.2… → 2,727; 5% → 136.35 → 136.
    expect(
      quoteBill({
        bill: paidAtTheTable,
        share: share(),
        scope: 'mine',
        tipPercent: 5,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 3000, tipDram: 136 });

    // Kept from the total: the quote never gives the table's balance away.
    expect(
      quoteBill({
        bill: paidAtTheTable,
        share: share(),
        scope: 'mine',
        tipPercent: 5,
        canSeeTableTotal: false,
      }),
    ).toEqual({ amountDram: 10560, tipDram: 480 });
  });

  it('has nothing to ask for on an empty share, or on none', () => {
    expect(
      quoteBill({
        bill: bill(),
        share: share({ personalDram: 0, serviceChargeDram: 0, shareDram: 0, ownItemsDram: 0 }),
        scope: 'mine',
        tipPercent: 10,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 0, tipDram: 0 });
    expect(
      quoteBill({
        bill: bill(),
        share: null,
        scope: 'mine',
        tipPercent: 10,
        canSeeTableTotal: true,
      }),
    ).toEqual({ amountDram: 0, tipDram: 0 });
  });
});

// --- The mock tab --------------------------------------------------------------------------------

function person(
  id: string,
  role: 'host' | 'guest',
  canSeeTableTotal: boolean,
  status: TabParticipant['status'] = 'active',
): TabParticipant {
  return {
    id,
    displayName: id,
    role,
    status,
    isYou: id === 'p-you',
    joinedAtUtc: NOW,
    permissions: { canOrder: true, canSeeTableTotal, canPay: true },
  };
}

/** A tab of two: this device hosting and seeing the total, Gor kept from it. */
function twoOnATab() {
  const branchId = 'b-lumen-north';
  const orders = createTabOrders({
    now: () => new Date(NOW),
    menuItem: (branch, itemId) => mockMenuItem(branch, 'cafe', itemId),
    branchMenu: (branch) => mockBranchMenu(branch, 'cafe'),
  });
  const itemId = mockBranchMenu(branchId, 'cafe')?.categories[0]?.items[0]?.id ?? '';
  const tab: TableTab = {
    id: 'tab-1',
    status: 'open',
    venueId: 'v-lumen',
    venueName: 'Lumen Coffee',
    branchId,
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    tableId: 'b-lumen-north-t1',
    tableLabel: '1',
    floorAreaName: null,
    openedAtUtc: NOW,
    closedAtUtc: null,
    participants: [person('p-you', 'host', true), person('p-gor', 'guest', false)],
    yourParticipantId: 'p-you',
    yourRole: 'host',
    yourStatus: 'active',
    yourPermissions: { canOrder: true, canSeeTableTotal: true, canPay: true },
    defaultPermissions: { canOrder: true, canSeeTableTotal: false, canPay: true },
  };
  orders.place(tab, {
    tabId: tab.id,
    clientCommandId: crypto.randomUUID(),
    lines: [
      { menuItemId: itemId, quantity: 2, isShared: false, participantId: 'p-you' },
      { menuItemId: itemId, quantity: 3, isShared: false, participantId: 'p-gor' },
    ],
  });
  const yourShare = (id: string) => {
    const read = orders.shares(tab, id);
    return read.yourShare!;
  };
  return { orders, tab, yourShare };
}

describe('the mock tab, paid in parts', () => {
  it("credits cash with a participant to that participant's share, not the host's", () => {
    const { orders, tab, yourShare } = twoOnATab();

    orders.pay(tab, 1000, 100, 'p-gor');

    expect(yourShare('p-gor').paidDram).toBe(1000);
    expect(yourShare('p-you').paidDram).toBe(0);
  });

  it("credits cash taken against the table to nobody's share", () => {
    const { orders, tab, yourShare } = twoOnATab();
    const before = orders.remaining(tab);

    orders.pay(tab, 1000);

    expect(orders.remaining(tab)).toBe(before - 1000);
    expect(yourShare('p-you').paidDram).toBe(0);
    expect(yourShare('p-gor').paidDram).toBe(0);
  });

  it('prices my share from the ledger: less what I paid, capped only for somebody shown the total', () => {
    const { orders, tab, yourShare } = twoOnATab();
    // Gor paid part of his share; then cash against the table took the
    // balance below what either still owes.
    orders.pay(tab, 1000, 0, 'p-gor');
    const gorOwes = yourShare('p-gor').shareDram - 1000;
    orders.pay(tab, orders.remaining(tab) - 500);
    expect(orders.remaining(tab)).toBe(500);

    // The host sees the total: capped at the 500 left.
    expect(orders.billQuote(tab, 'p-you', 'mine', 0).amountDram).toBe(500);
    // Gor does not: his own share less what he paid, the balance kept from him.
    expect(orders.billQuote(tab, 'p-gor', 'mine', 0).amountDram).toBe(gorOwes);
    expect(orders.seesTableTotal(tab, 'p-gor')).toBe(false);
  });

  it('tips the whole bill on the unpaid part of the items', () => {
    const { orders, tab } = twoOnATab();
    const items = orders.shares(tab, 'p-you');
    if (items.kind !== 'table') throw new Error('the host sees the table');
    const { subtotalDram, totalDram } = items.totals;

    expect(orders.billQuote(tab, 'p-you', 'whole', 10).tipDram).toBe(percentOf(subtotalDram, 10));

    orders.pay(tab, 2000);
    expect(orders.billQuote(tab, 'p-you', 'whole', 10)).toEqual({
      amountDram: totalDram - 2000,
      tipDram: percentOf(proRata(subtotalDram, totalDram - 2000, totalDram), 10),
    });
  });
});

// --- The gateway, with the floor it plays ---------------------------------------------------------

function clock(start = NOW) {
  let t = Date.parse(start);
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

async function hostedTab(simulateWaiter: boolean, time = clock()) {
  const gateway = createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    simulateWaiter,
    now: time.now,
    codeSeed: 3,
  });
  const scan = await gateway.scanTableCode({
    tableCode: mockTableCode('b-lumen-north-t1'),
    commandId: crypto.randomUUID(),
  });
  // Scanned with no proved number: a waiter lets the table order.
  gateway.admitTabAsWaiter(scan.tab.tabId);
  const tabId = scan.tab.tabId;
  const menu = await gateway.getBranchMenuDetail(scan.tab.branchId);
  const item = menu!.categories[0]!.items[0]!;
  await gateway.placeOrder({
    tabId,
    clientCommandId: crypto.randomUUID(),
    lines: [
      {
        menuItemId: item.id,
        quantity: 2,
        isShared: false,
        participantId: scan.tab.me.participantId,
      },
    ],
  });
  const ask = (scope: 'whole' | 'mine', tipPercent: number) =>
    gateway.callWaiter({
      tabId,
      reason: 'bill',
      commandId: crypto.randomUUID(),
      bill: { scope, tipPercent },
    });
  return { gateway, tabId, ask, time };
}

describe('the mock floor', () => {
  it('refuses the whole bill to somebody not shown the table total, as the server does', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false, now: clock().now });
    // Aram hosts table 9: this device arrives as a pending joiner.
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t9'),
      commandId: crypto.randomUUID(),
    });
    expect(scan.kind).toBe('joinPending');

    const refusal = await gateway
      .callWaiter({
        tabId: scan.tab.tabId,
        reason: 'bill',
        commandId: crypto.randomUUID(),
        bill: { scope: 'whole', tipPercent: 5 },
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(refusal).toBeInstanceOf(ForbiddenError);
    expect((refusal as ForbiddenError).problem?.code).toBe('forbidden');
  });

  it('puts the request on the tab stream without its amounts', async () => {
    const { gateway, tabId, ask } = await hostedTab(false);
    const call = await ask('whole', 10);

    const raised = (await gateway.getTabEvents({ tabId, afterSequence: 0 })).events.find(
      (event) => event.type === 'serviceRequested',
    );
    expect(raised?.data).toEqual({
      serviceRequestId: call.id,
      preset: 3,
      note: null,
      requestedByParticipantId: 'p-you',
      billScope: 1,
      tipPercent: 10,
    });
  });

  it('answers a repeated command id with the request it raised, not a new one', async () => {
    const { gateway, tabId } = await hostedTab(false);
    const commandId = crypto.randomUUID();
    const input = {
      tabId,
      reason: 'bill' as const,
      commandId,
      bill: { scope: 'whole' as const, tipPercent: 5 },
    };

    const first = await gateway.callWaiter(input);
    const again = await gateway.callWaiter(input);

    expect(again).toEqual(first);
  });

  it('acknowledges a bill request, takes the cash with the tip, and closes the tab on the receipt', async () => {
    const { gateway, tabId, ask, time } = await hostedTab(true);
    const call = await ask('whole', 10);
    const settledBill = call.bill!;

    time.advance(5_000);
    const seen = await gateway.getTabEvents({ tabId, afterSequence: 0 });
    expect(
      seen.events.some(
        (event) =>
          event.type === 'serviceRequestAcknowledged' &&
          event.data?.['serviceRequestId'] === call.id,
      ),
    ).toBe(true);
    expect((await gateway.getDinerTab(tabId))!.status).toBe('open');

    time.advance(7_000);
    const view = (await gateway.getDinerTab(tabId))!;
    expect(view.status).toBe('closed');
    expect(view.closedAtUtc).not.toBeNull();
    if (view.money.kind !== 'table') throw new Error('the host sees the table total');
    expect(view.money.tipsDram).toBe(settledBill.tipDram);
    expect(view.money.bill.paidDram).toBe(settledBill.amountDram);
    expect(view.money.bill.remainingDram).toBe(0);

    // The table is free again: the next scan opens a new tab.
    const next = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t1'),
      commandId: crypto.randomUUID(),
    });
    expect(next.kind).toBe('tabOpened');
    expect(next.tab.tabId).not.toBe(tabId);
  });

  it("credits my share's cash to me", async () => {
    const { gateway, tabId, ask, time } = await hostedTab(true);
    const call = await ask('mine', 0);

    time.advance(12_000);
    await gateway.getDinerTab(tabId);
    const shares = (await gateway.getTabShares(tabId))!;

    expect(shares.yourShare?.paidDram).toBe(call.bill!.amountDram);
  });

  it('serves only the newest bill request: a newer one replaces the open one', async () => {
    const { gateway, tabId, ask, time } = await hostedTab(true);
    await ask('whole', 5);
    time.advance(1_000);
    const newer = await ask('whole', 15);

    time.advance(12_000);
    const view = (await gateway.getDinerTab(tabId))!;
    if (view.money.kind !== 'table') throw new Error('the host sees the table total');
    // One payment, with the newer request's tip — the replaced one never reaches the floor.
    expect(view.money.tipsDram).toBe(newer.bill!.tipDram);
    const acknowledged = (await gateway.getTabEvents({ tabId, afterSequence: 0 })).events.filter(
      (event) => event.type === 'serviceRequestAcknowledged',
    );
    expect(acknowledged.map((event) => event.data?.['serviceRequestId'])).toEqual([newer.id]);
  });

  it('has served the floor before a scan, so the table is free after a reload', async () => {
    // A reload replays the scans and the requests, not the reads that served them.
    const { gateway, tabId, ask, time } = await hostedTab(true);
    await ask('whole', 5);
    time.advance(12_000);

    const next = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t1'),
      commandId: crypto.randomUUID(),
    });

    expect(next.kind).toBe('tabOpened');
    expect(next.tab.tabId).not.toBe(tabId);
    expect((await gateway.getDinerTab(tabId))!.status).toBe('closed');
  });

  it('leaves the tab alone when the floor is not simulated', async () => {
    const { gateway, tabId, ask, time } = await hostedTab(false);
    await ask('whole', 10);

    time.advance(60_000);
    const view = (await gateway.getDinerTab(tabId))!;
    expect(view.status).toBe('open');
    if (view.money.kind !== 'table') throw new Error('the host sees the table total');
    expect(view.money.tipsDram).toBe(0);
  });
});
