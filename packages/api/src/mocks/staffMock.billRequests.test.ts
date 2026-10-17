import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../errors';
import { percentOf } from './billing';
import { createStaffMockGateway } from './staffMock';

/**
 * Two people at one table asking to pay from the app: the host the whole
 * bill, the guest their own share. The counter has to see both, know whose
 * each one is, and take cash for one without disturbing the other.
 */

const NOW = '2026-09-20T17:00:00Z';

async function seeded() {
  const staff = createStaffMockGateway({ now: () => new Date(NOW) });
  const requests = await staff.listServiceRequests('any');
  const bills = requests.filter((request) => request.reason === 'bill');
  const tab = (await staff.getStaffTab(bills[0]!.tabId))!;
  return { staff, requests, bills, tab };
}

describe('bill requests at the counter, by person', () => {
  it('seeds a whole-bill and a my-share request on one tab, each from someone on it', async () => {
    const { requests, bills, tab } = await seeded();
    const [host, guest] = tab.participants;

    expect(bills).toHaveLength(2);
    expect(new Set(bills.map((bill) => bill.tabId))).toEqual(new Set([tab.id]));

    const whole = bills.find((bill) => bill.bill?.scope === 'whole')!;
    const mine = bills.find((bill) => bill.bill?.scope === 'mine')!;
    expect(whole.requestedByParticipantId).toBe(host!.id);
    expect(mine.requestedByParticipantId).toBe(guest!.id);
    // The share request is the newer one, so it is what a tab opens on.
    expect(mine.requestedAtUtc > whole.requestedAtUtc).toBe(true);

    // Every request says who asked, the water too.
    for (const request of requests) {
      expect(tab.participants.map((person) => person.id)).toContain(
        request.requestedByParticipantId,
      );
    }
  });

  it('prices the share by the shared rules: what the guest owes, the tip on their own items', async () => {
    const { bills, tab } = await seeded();
    const mine = bills.find((bill) => bill.bill?.scope === 'mine')!.bill!;

    // The guest's own drink (Tarragon lemonade, 1,300) with its 10% service.
    expect(mine).toEqual({ scope: 'mine', amountDram: 1430, tipPercent: 10, tipDram: 130 });
    expect(mine.tipDram).toBe(percentOf(1300, 10));
    // Never more than the tab still owes.
    expect(mine.amountDram).toBeLessThanOrEqual(tab.totals.remainingDram);
  });

  it('takes cash from the named payer, and refuses a payer who is not on the tab', async () => {
    const { staff, bills, tab } = await seeded();
    const mine = bills.find((bill) => bill.bill?.scope === 'mine')!;

    const paid = await staff.recordCashPayment({
      tabId: tab.id,
      amountDram: mine.bill!.amountDram,
      tipDram: mine.bill!.tipDram,
      clientCommandId: 'c-cash-1',
      participantId: mine.requestedByParticipantId!,
    });
    expect(paid.totals.paidDram).toBe(mine.bill!.amountDram);
    expect(paid.tabClosed).toBe(false);

    await expect(
      staff.recordCashPayment({
        tabId: tab.id,
        amountDram: 100,
        tipDram: 0,
        clientCommandId: 'c-cash-2',
        participantId: 'p-stranger',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // The refused one moved nothing.
    expect((await staff.getStaffTab(tab.id))!.totals.paidDram).toBe(mine.bill!.amountDram);
  });

  it('drops only the acknowledged request from the open list', async () => {
    const { staff, bills } = await seeded();
    const mine = bills.find((bill) => bill.bill?.scope === 'mine')!;

    await staff.acknowledgeServiceRequest({ requestId: mine.id, clientCommandId: 'c-ack' });

    const open = (await staff.listServiceRequests('any')).filter((r) => r.reason === 'bill');
    expect(open.map((request) => request.id)).toEqual(
      bills.filter((bill) => bill.id !== mine.id).map((bill) => bill.id),
    );
  });
});
