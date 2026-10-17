import { beforeAll, describe, expect, it } from 'vitest';
import type { DinerTabView } from '../contracts/ordering';
import { MAX_TIP_PERCENT } from '../contracts/ordering';
import { TableOutOfServiceError, TabClosedError } from '../contracts/errors';
import { ValidationError } from '../errors';
import { pngBlob } from './png';
import type { ContractDiner, ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * The pay sheet's half of the tab: asking for the bill with a scope and a tip,
 * the tips beside the bill once cash is taken, and the faces on the roster.
 *
 * > `BillAmountAmd` (what that scope leaves to pay, service charge included,
 * > tip excluded: WholeBill = tab remaining; MyShare = the requester's
 * > remaining share from the shares view; 0 → 422 field `billScope`),
 * > `TipAmd` (= `Money.PercentOf(scope items subtotal before service, tipPercent)`).
 *
 * Asserted against the tab and shares reads, never against arithmetic of the
 * suite's own: a tip worked out here and compared with the server's would be a
 * second implementation of money, and this suite would then be testing itself.
 * The one exception is a percent of zero, which is zero in any implementation.
 */
export function describeTabGapsContract(subject: ContractSubject): void {
  const reason = subject.unsupported('tabs');
  const suite = reason ? describe.skip : describe;

  suite(
    `the bill, tips and faces — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`,
    () => {
      const { staff, fixtures } = subject;
      let diner: ContractDiner;
      let photoId: string;
      let tab: DinerTabView;

      /**
       * A tab this diner hosts: the first printed code whose table nobody is at.
       * A table with a party on it makes a scanner a pending guest; one out of
       * service or being settled refuses — each is passed over for the next.
       */
      async function hostATab(): Promise<DinerTabView> {
        for (const tableCode of await subject.tableCodes()) {
          try {
            const scan = await diner.gateway.scanTableCode({ tableCode, commandId: randomUuid() });
            if (scan.kind === 'tabOpened') return scan.tab;
          } catch (error) {
            if (error instanceof TableOutOfServiceError || error instanceof TabClosedError)
              continue;
            throw error;
          }
        }
        throw new Error('Every table at the fixture branch is taken: nowhere to open a tab.');
      }

      beforeAll(async () => {
        diner = await subject.newDiner();
        // The photo goes on first: the scan is what links the place to the account.
        photoId = (await diner.gateway.uploadDinerPhoto(pngBlob())).photoId;
        tab = await hostATab();
      });

      it("puts the account's photo on the diner's own place, and on their row of the roster", async () => {
        const read = (await diner.gateway.getDinerTab(tab.tabId))!;

        expect(read.me.photo?.photoId).toBe(photoId);
        expect(read.me.photo?.thumbnailUrl).toBeTruthy();
        const row = read.participants.find(
          (entry) => entry.participantId === read.me.participantId,
        );
        expect(row?.photo?.photoId).toBe(photoId);
      });

      it('refuses a bill with nothing on it, naming the scope', async () => {
        const refusal = await diner.gateway
          .callWaiter({
            tabId: tab.tabId,
            reason: 'bill',
            commandId: randomUuid(),
            bill: { scope: 'whole', tipPercent: 5 },
          })
          .then(
            () => null,
            (error: unknown) => error,
          );

        expect(refusal).toBeInstanceOf(ValidationError);
        expect((refusal as ValidationError).field).toBe('billScope');
      });

      it('refuses a scope on anything but the bill, and a tip over the limit', async () => {
        const ask = (reasonCode: 'bill' | 'water', tipPercent: number) =>
          diner.gateway
            .callWaiter({
              tabId: tab.tabId,
              reason: reasonCode,
              commandId: randomUuid(),
              bill: { scope: 'whole', tipPercent },
            })
            .then(
              () => null,
              (error: unknown) => error as ValidationError,
            );

        expect((await ask('water', 5))?.field).toBe('billScope');
        expect((await ask('bill', MAX_TIP_PERCENT + 1))?.field).toBe('tipPercent');
      });

      it('asks for the whole bill: what the table still owes, and a tip beside it', async () => {
        const menu = await diner.gateway.getBranchMenuDetail(tab.branchId);
        const item = menu?.categories
          .flatMap((category) => category.items)
          .find((entry) => entry.isAvailable);
        expect(item, 'the fixture branch has nothing on its menu to order').toBeDefined();
        await diner.gateway.placeOrder({
          tabId: tab.tabId,
          clientCommandId: randomUuid(),
          lines: [
            {
              menuItemId: item!.id,
              quantity: 2,
              isShared: false,
              participantId: tab.me.participantId,
            },
          ],
        });
        const read = (await diner.gateway.getDinerTab(tab.tabId))!;
        if (read.money.kind !== 'table') throw new Error('the host is shown the table total');

        const call = await diner.gateway.callWaiter({
          tabId: tab.tabId,
          reason: 'bill',
          commandId: randomUuid(),
          bill: { scope: 'whole', tipPercent: 10 },
        });

        expect(call.reason).toBe('bill');
        expect(call.bill).toMatchObject({
          scope: 'whole',
          amountDram: read.money.bill.remainingDram,
          tipPercent: 10,
        });
        expect(Number.isInteger(call.bill!.tipDram)).toBe(true);
        expect(call.bill!.tipDram).toBeGreaterThan(0);
        // On the items, before service: never more than the percent of the total.
        expect(call.bill!.tipDram).toBeLessThanOrEqual(Math.ceil(read.money.bill.totalDram / 10));

        // The counter's list carries the same numbers, when it is the same world.
        const listed = (await staff.listServiceRequests(fixtures.branchId)).find(
          (request) => request.id === call.id,
        );
        if (listed) expect(listed.bill).toEqual(call.bill);
      });

      it("asks for the diner's own share: what is left of it, as the shares view splits it", async () => {
        const shares = await diner.gateway.getTabShares(tab.tabId);
        const mine = shares!.yourShare!;

        const call = await diner.gateway.callWaiter({
          tabId: tab.tabId,
          reason: 'bill',
          commandId: randomUuid(),
          bill: { scope: 'mine', tipPercent: 0 },
        });

        expect(call.bill).toEqual({
          scope: 'mine',
          amountDram: mine.shareDram - mine.paidDram,
          tipPercent: 0,
          tipDram: 0,
        });
      });

      it('keeps the bill request amounts whole and the tips within the limit on the counter list', async () => {
        for (const request of await staff.listServiceRequests(fixtures.branchId)) {
          if (request.bill === null) continue;
          expect(request.reason).toBe('bill');
          expect(Number.isInteger(request.bill.amountDram)).toBe(true);
          expect(request.bill.amountDram).toBeGreaterThan(0);
          expect(request.bill.tipPercent).toBeGreaterThanOrEqual(0);
          expect(request.bill.tipPercent).toBeLessThanOrEqual(MAX_TIP_PERCENT);
          expect(Number.isInteger(request.bill.tipDram)).toBe(true);
        }
      });

      it('sums the tips taken with a payment beside the totals, and never into what was paid', async () => {
        const floor = await staff.getFloor(fixtures.branchId);
        // The diner's own tab when the counter can see it, else any open one.
        const tabId =
          floor?.details.find((detail) => detail.openTabId === tab.tabId)?.openTabId ??
          floor?.details.find((detail) => detail.openTabId !== null)?.openTabId;
        if (!tabId) return;
        const before = (await staff.getStaffTab(tabId))!;
        // Leave a dram owing, so the payment does not close the tab under the next suite.
        const amountDram = Math.min(100, before.totals.remainingDram - 1);
        if (amountDram <= 0) return;

        await staff.recordCashPayment({
          tabId,
          amountDram,
          tipDram: 50,
          clientCommandId: randomUuid(),
        });

        const after = (await staff.getStaffTab(tabId))!;
        expect(after.tipsDram).toBe((before.tipsDram ?? 0) + 50);
        expect(after.totals.paidDram).toBe(before.totals.paidDram + amountDram);
      });
    },
  );
}
