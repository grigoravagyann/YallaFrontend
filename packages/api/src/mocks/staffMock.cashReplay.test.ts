import { describe, expect, it } from 'vitest';
import { tableDetail } from '../contracts/service';
import { createStaffMockGateway } from './staffMock';

/**
 * Cash by `clientCommandId`, as on the server (`ClientCommandIdFilter` on the
 * payments routes): a retry of a payment whose answer was lost gets the first
 * payment back and takes nothing twice.
 */
describe('a cash payment retried with the same id', () => {
  it('is replayed, not taken again', async () => {
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: 'b1' });
    const floor = (await gateway.getFloor('b1'))!;
    const tabId = floor.plan.tables
      .map((table) => tableDetail(floor, table.id)?.openTabId)
      .find(Boolean)!;
    const before = (await gateway.getStaffTab(tabId))!.totals;
    const command = { tabId, amountDram: 1_000, tipDram: 0, clientCommandId: 'cash-1' };

    const first = await gateway.recordCashPayment(command);
    const again = await gateway.recordCashPayment(command);

    expect(first.wasReplay).toBe(false);
    expect(again).toMatchObject({ paymentId: first.paymentId, wasReplay: true });
    const after = (await gateway.getStaffTab(tabId))!.totals;
    expect(after.paidDram).toBe(before.paidDram + 1_000);
  });
});
