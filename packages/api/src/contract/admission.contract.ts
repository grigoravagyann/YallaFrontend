import { describe, expect, it } from 'vitest';
import {
  TabAdmissionDecidedError,
  TabAwaitingAdmissionError,
  TabClosedError,
  TableOutOfServiceError,
} from '../contracts/errors';
import type { DinerTabView } from '../contracts/ordering';
import type { ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * A tab a scan opened with no proved number (2026-10-20, UG wire §4).
 *
 * > A tab opened by `POST /api/tabs/open` whose scanner has no diner token …
 * > waits: phone orders 409 `tab-awaiting-admission`, the bill too; other
 * > calls are allowed; `canOrderNow` false for everybody. A waiter admits or
 * > rejects it; reject closes the tab and frees a table the scan seated.
 *
 * The diner's half runs against every subject. The waiter's half needs the
 * floor and the phone to share one world — the mock's are two — so it is
 * gated on `admission`. It rejects rather than admits, which leaves the table
 * as the suite found it for every suite after this one.
 */
export function describeAdmissionContract(subject: ContractSubject): void {
  const reason = subject.unsupported('tabs');
  const suite = reason ? describe.skip : describe;
  const staffReason = subject.unsupported('admission');

  suite(
    `a scan with no proved number — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`,
    () => {
      /** An anonymous scan of the first table nobody is at: this phone hosts a new tab. */
      async function scanAnonymously(): Promise<DinerTabView> {
        for (const tableCode of await subject.tableCodes()) {
          try {
            const scan = await subject.gateway.scanTableCode({
              tableCode,
              commandId: randomUuid(),
            });
            if (scan.kind === 'tabOpened') return scan.tab;
          } catch (error) {
            if (error instanceof TableOutOfServiceError || error instanceof TabClosedError)
              continue;
            throw error;
          }
        }
        throw new Error('Every table at the fixture branch is taken: nowhere to open a tab.');
      }

      it('waits for a waiter: nothing ordered, no bill, water yes', async () => {
        const tab = await scanAnonymously();

        expect(tab.admission.status).toBe('awaiting');
        expect(tab.me.canOrderNow).toBe(false);

        const menu = await subject.gateway.getBranchMenuDetail(tab.branchId);
        const item = menu!.categories.flatMap((category) => category.items)[0]!;
        const order: unknown = await subject.gateway
          .placeOrder({
            tabId: tab.tabId,
            clientCommandId: randomUuid(),
            lines: [
              {
                menuItemId: item.id,
                quantity: 1,
                isShared: false,
                participantId: tab.me.participantId,
              },
            ],
          })
          .catch((error: unknown) => error);
        expect(order).toBeInstanceOf(TabAwaitingAdmissionError);

        const bill: unknown = await subject.gateway
          .callWaiter({
            tabId: tab.tabId,
            reason: 'bill',
            commandId: randomUuid(),
            bill: { scope: 'whole', tipPercent: 0 },
          })
          .catch((error: unknown) => error);
        expect(bill).toBeInstanceOf(TabAwaitingAdmissionError);

        await expect(
          subject.gateway.callWaiter({
            tabId: tab.tabId,
            reason: 'water',
            commandId: randomUuid(),
          }),
        ).resolves.toMatchObject({ tabId: tab.tabId, reason: 'water' });

        if (staffReason) return;
        // The waiter's half: on the list, turned away, and the table freed.
        const { staff, fixtures } = subject;
        const listed = await staff.listTabsAwaitingAdmission(fixtures.branchId);
        expect(listed.map((entry) => entry.tabId)).toContain(tab.tabId);

        const rejected = await staff.rejectTab({ tabId: tab.tabId, clientCommandId: randomUuid() });
        // Freed only when this scan is what seated the table; a suite before
        // this one may have left the party seated by a waiter, and then the
        // table stays as it was. Either way the answer says which it was.
        expect(rejected.admission.status).toBe('rejected');
        expect(typeof rejected.admission.tableFreed).toBe('boolean');
        expect(rejected.status).toBe('closed');

        const late: unknown = await staff
          .admitTab({ tabId: tab.tabId, clientCommandId: randomUuid() })
          .catch((error: unknown) => error);
        expect(late).toBeInstanceOf(TabAdmissionDecidedError);
      });
    },
  );
}
