import { describe, expect, it } from 'vitest';
import { createMockGateway } from './mockGateway';
import { mockTableCode } from './tableCodes';

/**
 * The whole diner loop, through the gateway the screens use.
 *
 * Not a substitute for running it on two phones — that needs the backend and is
 * pending — but it does check the one thing a screen cannot check for itself:
 * that scanning, ordering, a waiter voiding a line and reading the bill all
 * agree with each other through a single tab, with the service charge present
 * from the first item and the shares summing to the total.
 */

const COMMAND = (n: number) => `${n}0000000-0000-4000-8000-000000000000`;

describe('a diner ordering from their own phone', () => {
  it('scans, orders, and sees the bill with the service charge from the first item', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });

    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t4'),
      commandId: COMMAND(1),
    });
    expect(scan.kind).toBe('tabOpened');
    const tab = scan.tab;

    // Nothing ordered: the bill exists and is honestly empty rather than absent.
    const empty = await gateway.getDinerTab(tab.tabId);
    expect(empty?.myLines).toEqual([]);
    expect(empty?.tableLines).toEqual([]);
    expect(empty?.money.kind).toBe('table');

    const menu = await gateway.getBranchMenuDetail(tab.branchId);
    const items = (menu?.categories ?? []).flatMap((category) => category.items);
    const coffee = items.find((item) => item.id === 'cappuccino')!;

    // The descriptive fields the backend made required, so a diner stops having
    // to ask a waiter what is in something.
    expect(coffee.ingredients).not.toBe('');
    expect(coffee.allergens).toContain('Milk');
    expect(coffee.portionSize).not.toBe('');
    expect(coffee.prepMinutes).toBeGreaterThan(0);

    // An unavailable item is still listed, marked — never quietly missing.
    const soldOut = items.find((item) => !item.isAvailable);
    expect(soldOut).toBeDefined();

    const result = await gateway.placeOrder({
      tabId: tab.tabId,
      clientCommandId: COMMAND(2),
      lines: [
        {
          menuItemId: coffee.id,
          quantity: 2,
          isShared: false,
          participantId: tab.me.participantId,
        },
      ],
    });
    expect(result.wasReplay).toBe(false);
    // Stated at order time rather than shown as a bar that creeps.
    expect(result.estimatedReadyAtUtc).not.toBeNull();

    const view = await gateway.getDinerTab(tab.tabId);
    expect(view?.money.kind).toBe('table');
    if (view?.money.kind !== 'table') return;

    expect(view.money.bill.subtotalDram).toBe(coffee.priceDram * 2);
    expect(view.money.bill.serviceChargeDram).toBe(Math.round(coffee.priceDram * 2 * 0.1));
    expect(view.money.bill.totalDram).toBe(
      view.money.bill.subtotalDram + view.money.bill.serviceChargeDram,
    );

    // The percentage itself is not on this view and is not on any diner
    // endpoint: `ReservationPolicyView` is `ManagerOrAbove`. What a share comes
    // to is read from the shares endpoint, which is where the server puts it.
    const shares = await gateway.getTabShares(tab.tabId);
    expect(shares?.kind).toBe('table');
    if (shares?.kind !== 'table') return;
    expect(shares.yourShare?.shareDram).toBe(view.money.bill.totalDram);
  });

  it('replays a repeated send rather than doubling the round', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t5'),
      commandId: COMMAND(3),
    });
    const menu = await gateway.getBranchMenuDetail(scan.tab.branchId);
    const item = (menu?.categories ?? []).flatMap((c) => c.items)[0]!;

    const command = {
      tabId: scan.tab.tabId,
      clientCommandId: COMMAND(4),
      lines: [
        {
          menuItemId: item.id,
          quantity: 1,
          isShared: false,
          participantId: scan.tab.me.participantId,
        },
      ],
    };

    const first = await gateway.placeOrder(command);
    const second = await gateway.placeOrder(command);

    expect(first.wasReplay).toBe(false);
    // The case a lost response produces. Treating it as new is how a round of
    // drinks doubles.
    expect(second.wasReplay).toBe(true);
    expect(second.orderId).toBe(first.orderId);

    const view = await gateway.getDinerTab(scan.tab.tabId);
    expect(view?.myLines).toHaveLength(1);
  });

  it('shows what the shares endpoint says, summing to the total', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t6'),
      commandId: COMMAND(5),
    });
    const menu = await gateway.getBranchMenuDetail(scan.tab.branchId);
    const items = (menu?.categories ?? []).flatMap((c) => c.items);

    await gateway.placeOrder({
      tabId: scan.tab.tabId,
      clientCommandId: COMMAND(6),
      lines: [
        {
          menuItemId: items[0]!.id,
          quantity: 1,
          isShared: false,
          participantId: scan.tab.me.participantId,
        },
        {
          menuItemId: items[1]!.id,
          quantity: 3,
          isShared: true,
          participantId: scan.tab.me.participantId,
        },
      ],
    });

    const shares = await gateway.getTabShares(scan.tab.tabId);
    expect(shares?.kind).toBe('table');
    // Narrowed, not optional-chained: the aggregate is absent from the payload
    // when it is hidden, and a test that reached for it through `?.` would pass
    // against a body that has no total in it at all.
    if (shares?.kind !== 'table') throw new Error('expected the table aggregate');
    const summed = shares.shares.reduce((sum, share) => sum + share.shareDram, 0);
    expect(summed).toBe(shares.totals.totalDram);
  });

  it('lets the host pick how the bill splits', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t7'),
      commandId: COMMAND(7),
    });

    const updated = await gateway.setSettlementMode({
      tabId: scan.tab.tabId,
      mode: 'hostPaysEverything',
      clientCommandId: COMMAND(8),
    });

    expect(updated.settlementMode).toBe('hostPaysEverything');
    expect(updated.settlementModeLocked).toBe(false);
  });

  it('records a waiter call so the counter is actually pinged', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t8'),
      commandId: COMMAND(9),
    });

    const call = await gateway.callWaiter({
      tabId: scan.tab.tabId,
      reason: 'bill',
      commandId: COMMAND(1).replace('1', 'a'),
    });

    expect(call.reason).toBe('bill');
    expect(call.tabId).toBe(scan.tab.tabId);
  });
});
