import { describe, expect, it } from 'vitest';
import type { TableTab } from '../contracts/tab';
import { mockBranchMenu, mockMenuItem } from './menuDetail';
import { createMockGateway } from './mockGateway';
import { mockTableCode } from './tableCodes';
import { createTabOrders } from './tabOrders';

/**
 * The mock's tab, answering what the server answers.
 */

const NOW = new Date('2026-09-16T10:00:00Z');
// The first tables on a branch are free in the fixture.
const FREE_TABLE = mockTableCode('b-lumen-north-t1');

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

describe('the mock tab', () => {
  it('hands the scan back as the tab a diner reads, with its zone and venue', async () => {
    const gateway = createMockGateway({ now: () => NOW, simulateJoiners: false });
    const opened = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId: 'c1' });

    expect(opened.kind).toBe('tabOpened');
    expect(opened.tab.venueName).toBe('Lumen Coffee');
    expect(opened.tab.timeZoneId).toBe('Asia/Yerevan');
    expect(opened.tab.me.role).toBe('host');
  });

  it('keeps the typed code case-insensitive, as the server does', async () => {
    const gateway = createMockGateway({ now: () => NOW, simulateJoiners: false });
    await expect(
      gateway.scanTableCode({ tableCode: FREE_TABLE.toLowerCase(), commandId: 'c1' }),
    ).resolves.toMatchObject({ kind: 'tabOpened' });
  });

  it('refuses to let a host with nobody approved walk away from the tab', async () => {
    const gateway = createMockGateway({ now: () => NOW, simulateJoiners: false });
    const opened = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId: 'c1' });

    expect((await caught(gateway.leaveTab({ tabId: opened.tab.tabId }))).name).toBe(
      'HostCannotLeaveError',
    );
  });

  it('refuses an invitation it does not know as expired', async () => {
    const gateway = createMockGateway({ now: () => NOW, simulateJoiners: false });
    expect((await caught(gateway.joinTab({ joinToken: 'nope' }))).name).toBe('InviteExpiredError');
  });

  it('keeps a voided line on the bill, marked, with its reason', () => {
    const branchId = 'b-lumen-north';
    const orders = createTabOrders({
      now: () => NOW,
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
      openedAtUtc: NOW.toISOString(),
      closedAtUtc: null,
      participants: [
        {
          id: 'p-you',
          displayName: 'Ani',
          role: 'host',
          status: 'active',
          isYou: true,
          joinedAtUtc: NOW.toISOString(),
          permissions: { canOrder: true, canSeeTableTotal: true, canPay: true },
        },
      ],
      yourParticipantId: 'p-you',
      yourRole: 'host',
      yourStatus: 'active',
      yourPermissions: { canOrder: true, canSeeTableTotal: true, canPay: true },
      defaultPermissions: { canOrder: true, canSeeTableTotal: true, canPay: false },
    };

    orders.place(tab, {
      tabId: tab.id,
      clientCommandId: 'order-1',
      lines: [{ menuItemId: itemId, quantity: 1, isShared: false, participantId: 'p-you' }],
    });
    const lineId = orders.lines(tab.id)[0]?.id ?? '';
    orders.void(tab, lineId, 'Spilled', 'Aram');

    const view = orders.dinerView(tab, 'p-you');
    const line = view.myLines.find((entry) => entry.id === lineId);

    expect(line).toMatchObject({ isVoided: true, voidReason: 'Spilled', lineTotalDram: 0 });
    expect(view.tableLines?.some((entry) => entry.id === lineId)).toBe(true);
  });
});
