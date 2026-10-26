import { describe, expect, it } from 'vitest';
import { STAFF_RECENT_LISTS, transferRefusalOf } from '../contracts/activity';
import { ForbiddenError, NotFoundError } from '../errors';
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

  it('lists who can take the table: serving people only, never its waiter, on shift first', async () => {
    const { gateway, detail } = await seatedTab();
    const targets = await gateway.listTransferTargets(detail.openTabId!);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.map((one) => one.staffMemberId)).not.toContain(detail.serverStaffMemberId);
    expect(targets.every((one) => one.role !== 'kitchen')).toBe(true);
    const shifts = targets.map((one) => one.onShiftNow);
    expect(shifts).toEqual([...shifts].sort((a, b) => Number(b) - Number(a)));
    expect(targets.map((one) => one.staffMemberId)).toContain(`${BRANCH}-manager`);
    // After a hand-over the new waiter leaves the list and the old one joins it.
    await gateway.transferTab({
      tabId: detail.openTabId!,
      toStaffMemberId: `${BRANCH}-manager`,
      clientCommandId: '33333333-3333-4333-8333-333333333333',
    });
    const after = await gateway.listTransferTargets(detail.openTabId!);
    expect(after.map((one) => one.staffMemberId)).not.toContain(`${BRANCH}-manager`);
    expect(after.map((one) => one.staffMemberId)).toContain(detail.serverStaffMemberId);
  });

  it('refuses the list for a tab that is not there, as the server does (403)', async () => {
    const { gateway } = await seatedTab();
    expect(await failing(gateway.listTransferTargets('nope'))).toBeInstanceOf(ForbiddenError);
  });

  it('refuses the kitchen as a target, as the server does', async () => {
    const { gateway, detail } = await seatedTab();
    const error = await failing(
      gateway.transferTab({
        tabId: detail.openTabId!,
        toStaffMemberId: `${BRANCH}-kitchen`,
        clientCommandId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    // 422 `transfer-target-ineligible`, `context.reason` `does-not-serve`.
    expect(transferRefusalOf(error)).toEqual({ kind: 'ineligible', reason: 'does-not-serve' });
  });
});

describe('My results', () => {
  it('answers the signed-in waiter’s own page from the branch’s month of work', async () => {
    const gateway = createStaffMockGateway({
      branchId: BRANCH,
      latencyMs: 0,
      now: () => new Date('2026-10-24T15:00:00Z'),
    });
    const week = { from: '2026-10-18', to: '2026-10-24' };
    const mine = await gateway.getMyPerformance({ ...week, limit: 3 });
    expect(mine.name).toMatch(/^Ani Hakobyan/u);
    expect(mine.daily).toHaveLength(7);
    expect(mine.figures.salesAmd).toBeGreaterThan(0);
    expect(mine.recent.items.length).toBeLessThanOrEqual(3);
    const messages = await gateway.getMyPerformance({ ...week, list: 'messages', limit: 3 });
    expect(messages.recent.list).toBe('messages');
    expect(messages.recent.items.every((entry) => entry.category === 'message')).toBe(true);
  });

  it('answers every list at once as the one-list reads do', async () => {
    const gateway = createStaffMockGateway({
      branchId: BRANCH,
      latencyMs: 0,
      now: () => new Date('2026-10-24T15:00:00Z'),
    });
    const week = { from: '2026-10-18', to: '2026-10-24' };
    const all = await gateway.getMyResults({ ...week, limit: 3 });
    const orders = await gateway.getMyPerformance({ ...week, limit: 3 });
    expect(all.figures).toEqual(orders.figures);
    expect(all.daily).toEqual(orders.daily);
    for (const list of STAFF_RECENT_LISTS) {
      const alone = await gateway.getMyPerformance({ ...week, list, limit: 3 });
      expect(all.recent[list]).toEqual(alone.recent);
    }
    // Ten of each when no limit is said, as the server.
    const unsaid = await gateway.getMyResults(week);
    expect(unsaid.recent.orders.items.length).toBeLessThanOrEqual(10);
  });
});
