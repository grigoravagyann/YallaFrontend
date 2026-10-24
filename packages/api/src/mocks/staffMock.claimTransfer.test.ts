import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../errors';
import { createStaffMockGateway } from './staffMock';

/**
 * "I'm on it" and handing a table over, on the tablet's mock (2026-10-24):
 * the first claim wins, and the floor names the waiter after a transfer.
 */

const BRANCH = 'b-lumen-north';
const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

async function seatedTab() {
  const gateway = createStaffMockGateway({ branchId: BRANCH, latencyMs: 0 });
  const floor = (await gateway.getFloor(BRANCH))!;
  const detail = floor.details.find((candidate) => candidate.openTabId !== null)!;
  return { gateway, detail };
}

describe('claiming a call', () => {
  it('names the claimer, and a second claim answers the first', async () => {
    const gateway = createStaffMockGateway({ branchId: BRANCH, latencyMs: 0 });
    await gateway.getFloor(BRANCH);
    const [call] = await gateway.listServiceRequests(BRANCH);
    expect(call).toBeDefined();
    const first = await gateway.claimServiceRequest({ branchId: BRANCH, requestId: call!.id });
    expect(first.claimedByName).toMatch(/^Ani Hakobyan/u);
    expect(first.claimedAtUtc).toBeTruthy();
    const again = await gateway.claimServiceRequest({ branchId: BRANCH, requestId: call!.id });
    expect(again.claimedAtUtc).toBe(first.claimedAtUtc);
    const listed = (await gateway.listServiceRequests(BRANCH)).find((r) => r.id === call!.id);
    expect(listed?.claimedByName).toBe(first.claimedByName);
  });

  it('refuses a call that is not there', async () => {
    const gateway = createStaffMockGateway({ branchId: BRANCH, latencyMs: 0 });
    expect(
      await failing(gateway.claimServiceRequest({ branchId: BRANCH, requestId: 'nope' })),
    ).toBeInstanceOf(NotFoundError);
  });
});

describe('transferring a table', () => {
  it('moves the table to the manager and the floor says so', async () => {
    const { gateway, detail } = await seatedTab();
    expect(detail.serverName).toMatch(/^Ani Hakobyan/u);
    const command = {
      tabId: detail.openTabId!,
      toStaffMemberId: `${BRANCH}-manager`,
      clientCommandId: '11111111-1111-4111-8111-111111111111',
    };
    const result = await gateway.transferTab(command);
    expect(result.server).toEqual({
      staffMemberId: `${BRANCH}-manager`,
      name: 'Nare Petrosyan',
    });
    expect(result.previousServer?.name).toMatch(/^Ani Hakobyan/u);
    // A retry with the same command id answers the same transfer.
    expect(await gateway.transferTab(command)).toEqual(result);
    const after = (await gateway.getFloor(BRANCH))!.details.find(
      (candidate) => candidate.tableId === detail.tableId,
    )!;
    expect(after).toMatchObject({
      serverStaffMemberId: `${BRANCH}-manager`,
      serverName: 'Nare Petrosyan',
    });
  });

  it('refuses the kitchen as a target', async () => {
    const { gateway, detail } = await seatedTab();
    const error = await failing(
      gateway.transferTab({
        tabId: detail.openTabId!,
        toStaffMemberId: `${BRANCH}-kitchen`,
        clientCommandId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
  });
});
