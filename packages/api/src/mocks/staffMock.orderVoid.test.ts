import { describe, expect, it } from 'vitest';
import { LineAlreadyPaidError } from '../contracts/errors';
import { tableDetail } from '../contracts/service';
import { createStaffMockGateway } from './staffMock';

/**
 * Voiding a whole order in the staff mock, as the server does it since
 * 2026-10-25: every line of the order still on the bill is voided with it, so
 * the totals drop; and once the tab has been paid against the void is refused
 * with `line-already-paid`, as one line's void is, because it would be a refund.
 */

const BRANCH = 'b1';

function mock() {
  return createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
}

/** A tab, and an order on it of two dishes the server prices. */
async function tabWithOrder(gateway: ReturnType<typeof mock>, orderId: string) {
  const floor = (await gateway.getFloor(BRANCH))!;
  const tabId = floor.plan.tables
    .map((table) => tableDetail(floor, table.id)?.openTabId)
    .find(Boolean)!;
  const menu = (await gateway.getMenu(BRANCH))!;
  const dish = menu.sections[0]!.items.find((item) => item.isAvailable && item.priceDram > 0)!;
  await gateway.placeOrder({
    tabId,
    clientCommandId: orderId,
    lines: [{ menuItemId: dish.id, quantity: 2, isShared: true, participantId: null }],
  });
  return { tabId, dish };
}

describe('voiding a whole order', () => {
  it("voids the order's lines with it, and the bill drops by what they cost", async () => {
    const gateway = mock();
    const orderId = '44444444-4444-4444-8444-444444444444';
    const { tabId, dish } = await tabWithOrder(gateway, orderId);
    const before = (await gateway.getStaffTab(tabId))!;

    const moved = await gateway.setOrderStatus({
      orderId,
      status: 'voided',
      clientCommandId: 'v1',
    });

    expect(moved.status).toBe('voided');
    const after = (await gateway.getStaffTab(tabId))!;
    const lines = after.lines.filter((line) => line.orderId === orderId);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.status).toBe('voided');
      expect(line.lineTotalDram).toBe(0);
      expect(line.voidReason).toBe('The whole order was voided.');
    }
    expect(before.totals.subtotalDram - after.totals.subtotalDram).toBe(dish.priceDram * 2);
    // Every other line is as it was.
    const others = (tab: typeof before) =>
      tab.lines.filter((line) => line.orderId !== orderId).map((line) => line.status);
    expect(others(after)).toEqual(others(before));
  });

  it('is refused once the tab has been paid against, and nothing changes', async () => {
    const gateway = mock();
    const orderId = '55555555-5555-4555-8555-555555555555';
    const { tabId } = await tabWithOrder(gateway, orderId);
    await gateway.recordCashPayment({
      tabId,
      amountDram: 1_000,
      tipDram: 0,
      clientCommandId: 'pay-1',
    });
    const before = (await gateway.getStaffTab(tabId))!;

    await expect(
      gateway.setOrderStatus({ orderId, status: 'voided', clientCommandId: 'v2' }),
    ).rejects.toBeInstanceOf(LineAlreadyPaidError);

    const after = (await gateway.getStaffTab(tabId))!;
    expect(after.totals).toEqual(before.totals);
    expect(after.lines.filter((line) => line.orderId === orderId).map((l) => l.status)).toEqual(
      before.lines.filter((line) => line.orderId === orderId).map((l) => l.status),
    );
    const ticket = (await gateway.listOrderQueue(BRANCH)).find((o) => o.orderId === orderId);
    expect(ticket?.status).not.toBe('voided');
  });

  it('still moves an order on along the rail on a paid tab: only a void is a refund', async () => {
    const gateway = mock();
    const orderId = '66666666-6666-4666-8666-666666666666';
    const { tabId } = await tabWithOrder(gateway, orderId);
    await gateway.recordCashPayment({ tabId, amountDram: 1_000, tipDram: 0, clientCommandId: 'p' });

    const moved = await gateway.setOrderStatus({ orderId, status: 'ready', clientCommandId: 'r' });

    expect(moved.status).toBe('ready');
  });
});
