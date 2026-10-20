import { describe, expect, it } from 'vitest';
import { TabAdmissionDecidedError } from '../contracts/errors';
import { tableDetail } from '../contracts/service';
import { ConcurrencyConflictError } from '../errors';
import { createStaffMockGateway } from './staffMock';

/**
 * The floor tablet's side of unverified guests, in the staff mock: tables a
 * scan seated with no proved number wait on the "Now" rail until a waiter
 * admits or rejects them, online only, idempotent on the command id.
 */

const BRANCH = 'b-lumen-north';
const START = new Date('2026-10-20T15:00:00.000Z');

function floor() {
  return createStaffMockGateway({
    branchId: BRANCH,
    now: () => START,
    seedUnverifiedGuests: true,
  });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('the tables waiting to be let in', () => {
  it('lists them oldest first, with how many and whether the scan seated them', async () => {
    const gateway = floor();

    const list = await gateway.listTabsAwaitingAdmission(BRANCH);

    expect(list.map((entry) => entry.tableLabel)).toEqual(['8', '5']);
    expect(list[0]).toMatchObject({
      tableId: 't8',
      roomName: 'Windows',
      hostDisplayName: 'Արամ',
      participantCount: 2,
      sittingSeatedByScan: true,
      openedAtUtc: '2026-10-20T14:54:00.000Z',
    });
    expect(list[1]).toMatchObject({ hostDisplayName: null, participantCount: 1 });
  });

  it('marks their tables on the floor, and the booking made without a verified number', async () => {
    const gateway = floor();
    const read = await gateway.getFloor(BRANCH);

    expect(tableDetail(read, 't5')).toMatchObject({
      physicalStatus: 'occupied',
      openTabAwaitingAdmission: true,
    });
    expect(tableDetail(read, 't1')?.openTabAwaitingAdmission).toBe(false);
    expect(tableDetail(read, 't6')?.nextReservationPhoneUnverified).toBe(true);
    expect(tableDetail(read, 't4')?.nextReservationPhoneUnverified).toBe(false);

    const requests = await gateway.listAwaitingApproval(BRANCH);
    expect(requests.find((request) => request.because === 'unverifiedPhone')).toMatchObject({
      phoneUnverified: true,
      approvalExpiresAtUtc: '2026-10-20T16:00:00.000Z',
    });
  });

  it('nobody on a waiting tab can order yet', async () => {
    const gateway = floor();
    const [waiting] = await gateway.listTabsAwaitingAdmission(BRANCH);
    const tab = await gateway.getStaffTab(waiting!.tabId);

    expect(tab?.admission.status).toBe('awaiting');
    expect(tab?.participants.every((person) => !person.canOrderNow)).toBe(true);
  });
});

describe('admitting', () => {
  it('lets the table order, takes it off the list, and signals the change stream', async () => {
    const gateway = floor();
    const [waiting] = await gateway.listTabsAwaitingAdmission(BRANCH);
    const before = (await gateway.getFloor(BRANCH))!.lastSequence;

    const tab = await gateway.admitTab({ tabId: waiting!.tabId, clientCommandId: 'cmd-admit' });

    expect(tab.admission).toMatchObject({ status: 'admitted', admittedBecause: 'waiter' });
    expect(tab.participants.some((person) => person.canOrderNow)).toBe(true);
    expect((await gateway.listTabsAwaitingAdmission(BRANCH)).map((e) => e.tabId)).not.toContain(
      waiting!.tabId,
    );
    const changes = await gateway.getFloorChanges({ branchId: BRANCH, afterSequence: before });
    expect(changes.changes).toEqual([
      expect.objectContaining({
        tableId: waiting!.tableId,
        fromStatus: 'occupied',
        toStatus: 'occupied',
        tabId: waiting!.tabId,
        signal: 'tabAdmitted',
      }),
    ]);
  });

  it('answers a retry as the tab stands, and refuses the id for anything else', async () => {
    const gateway = floor();
    const [first, second] = await gateway.listTabsAwaitingAdmission(BRANCH);
    await gateway.admitTab({ tabId: first!.tabId, clientCommandId: 'cmd-1' });

    await expect(
      gateway.admitTab({ tabId: first!.tabId, clientCommandId: 'cmd-1' }),
    ).resolves.toMatchObject({ admission: { status: 'admitted' } });
    const reused = await caught(
      gateway.rejectTab({ tabId: second!.tabId, clientCommandId: 'cmd-1' }),
    );
    expect(reused).toBeInstanceOf(ConcurrencyConflictError);
    expect((reused as ConcurrencyConflictError).code).toBe('client-command-id-in-use');
  });

  it("takes a waiter's own order on a waiting tab without admitting it", async () => {
    const gateway = floor();
    const [waiting] = await gateway.listTabsAwaitingAdmission(BRANCH);

    await gateway.placeOrder({
      tabId: waiting!.tabId,
      clientCommandId: 'cmd-order',
      shape: 2,
      lines: [{ menuItemId: 'cappuccino', quantity: 1, isShared: true, participantId: null }],
    });

    expect((await gateway.getStaffTab(waiting!.tabId))?.admission.status).toBe('awaiting');
    expect((await gateway.listTabsAwaitingAdmission(BRANCH)).map((e) => e.tabId)).toContain(
      waiting!.tabId,
    );
    // Somebody is there: a reject is refused, and Admit is the way on.
    const refused = await caught(
      gateway.rejectTab({ tabId: waiting!.tabId, clientCommandId: 'cmd-reject' }),
    );
    expect(refused).toBeInstanceOf(ConcurrencyConflictError);
    expect((refused as ConcurrencyConflictError).code).toBe('conflicting-state');
  });
});

describe('rejecting', () => {
  it('closes the tab and frees the table the scan seated', async () => {
    const gateway = floor();
    const [waiting] = await gateway.listTabsAwaitingAdmission(BRANCH);
    const before = (await gateway.getFloor(BRANCH))!.lastSequence;

    const tab = await gateway.rejectTab({ tabId: waiting!.tabId, clientCommandId: 'cmd-reject' });

    expect(tab.status).toBe('closed');
    expect(tab.admission).toMatchObject({ status: 'rejected', tableFreed: true });
    const read = await gateway.getFloor(BRANCH);
    expect(tableDetail(read, waiting!.tableId)).toMatchObject({
      physicalStatus: 'free',
      openTabId: null,
      openTabAwaitingAdmission: false,
    });
    const changes = await gateway.getFloorChanges({ branchId: BRANCH, afterSequence: before });
    expect(changes.changes[0]).toMatchObject({
      fromStatus: 'occupied',
      toStatus: 'free',
      signal: 'tabAdmissionRejected',
    });
  });

  it('is refused once another waiter admitted it, and the other way round', async () => {
    const gateway = floor();
    const [first, second] = await gateway.listTabsAwaitingAdmission(BRANCH);
    await gateway.admitTab({ tabId: first!.tabId, clientCommandId: 'a-1' });
    await gateway.rejectTab({ tabId: second!.tabId, clientCommandId: 'r-1' });

    const late = await caught(gateway.rejectTab({ tabId: first!.tabId, clientCommandId: 'r-2' }));
    expect(late).toBeInstanceOf(TabAdmissionDecidedError);
    expect(late).toMatchObject({ admission: 'admitted' });
    const lateAdmit = await caught(
      gateway.admitTab({ tabId: second!.tabId, clientCommandId: 'a-2' }),
    );
    expect(lateAdmit).toMatchObject({ admission: 'rejected' });
  });
});
