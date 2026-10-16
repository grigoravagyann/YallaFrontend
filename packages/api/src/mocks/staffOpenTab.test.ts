import { describe, expect, it } from 'vitest';
import { TableNotSeatedError } from '../contracts/errors';
import { createStaffMockGateway } from './staffMock';

/**
 * A waiter starts the tab for a walk-in who is not going to scan. The mock
 * answers as the server does: a tab on a seated table only, with nobody on it,
 * and the same tab again for a second tap.
 */
const BRANCH = 'b-lumen-north';

async function freeTableId(gateway: ReturnType<typeof createStaffMockGateway>): Promise<string> {
  const floor = await gateway.getFloor(BRANCH);
  const free = floor?.details.find((detail) => detail.physicalStatus === 'free');
  if (!free) throw new Error('The staff fixture has no free table.');
  return free.tableId;
}

describe('starting a tab from the tablet', () => {
  it('refuses a table nobody is sitting at', async () => {
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const tableId = await freeTableId(gateway);

    await expect(
      gateway.openTabForStaff({ branchId: BRANCH, tableId, clientCommandId: 'cmd-1' }),
    ).rejects.toBeInstanceOf(TableNotSeatedError);
  });

  it('opens an empty tab on a seated table, shows it on the floor, and gives it back on a second tap', async () => {
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const tableId = await freeTableId(gateway);

    await gateway.applyTableAction({
      kind: 'seatWalkIn',
      branchId: BRANCH,
      tableId,
      clientCommandId: 'seat-1',
      partySize: 2,
    });

    const tab = await gateway.openTabForStaff({
      branchId: BRANCH,
      tableId,
      clientCommandId: 'cmd-1',
    });
    expect(tab.status).toBe('open');
    expect(tab.participants).toEqual([]);

    const floor = await gateway.getFloor(BRANCH);
    expect(floor?.details.find((detail) => detail.tableId === tableId)?.openTabId).toBe(tab.id);

    const again = await gateway.openTabForStaff({
      branchId: BRANCH,
      tableId,
      clientCommandId: 'cmd-2',
    });
    expect(again.id).toBe(tab.id);
  });
});
