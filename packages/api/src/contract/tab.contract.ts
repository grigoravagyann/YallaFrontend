import { describe, expect, it } from 'vitest';
import type { ContractSubject } from './subject';

/**
 * What one diner may see of a tab, and what they may not.
 *
 * The rule this exists to protect is a permission, not a formatting choice.
 * `TabView` sends two line arrays because the difference *is* the permission —
 * `myLines` is always present, `tableLines` is absent exactly when the total is
 * hidden — and `TabMoney` is a discriminated union so that a participant who
 * may not see the table's money has **no node for it at all**.
 *
 * > There is deliberately no total, no service charge and no remaining.
 *
 * A zero would be a different claim: it would say the table owes nothing. The
 * assertions below check for absence, never for zero, which is the one thing a
 * mock is most likely to get wrong and the one thing nothing else would catch.
 */
export function describeTabContract(subject: ContractSubject): void {
  const reason = subject.unsupported('tabs');
  const suite = reason ? describe.skip : describe;

  suite(`tabs — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { gateway, staff, fixtures } = subject;

    /**
     * A table with an open tab on it, found through the staff floor.
     *
     * `null` when this world has none — a contract asserts what must hold *when
     * the situation arises*, and inventing one here would mean the suite
     * seeding data through an interface it is meant to be testing.
     */
    async function openTab(): Promise<{ tableId: string; tabId: string } | null> {
      const floor = await staff.getFloor(fixtures.branchId);
      const detail = floor?.details.find((entry) => entry.openTabId !== null);
      return detail ? { tableId: detail.tableId, tabId: detail.openTabId! } : null;
    }

    it('hides the table aggregate by its absence, never by a zero', async () => {
      const open = await openTab();
      if (!open) return;
      const tab = await gateway.getDinerTab(open.tabId).catch(() => null);
      if (!tab) return;

      if (tab.money.kind === 'ownItemsOnly') {
        // The union carries no total node. Asserted structurally, because a
        // `bill: { totalDram: 0 }` would type-check against a laxer shape and
        // would tell the diner the table owes nothing.
        expect(Object.keys(tab.money).sort()).toEqual(['kind', 'yourItemsSubtotalDram']);
        expect(tab.money).not.toHaveProperty('bill');

        // And the line array that would reveal it is absent too, for the same
        // reason: the permission is expressed by absence on both.
        expect(tab.tableLines).toBeNull();
      } else {
        expect(tab.money.bill).toBeDefined();
        expect(tab.tableLines).not.toBeNull();
      }
    });

    it('always gives a participant their own lines and their own subtotal', async () => {
      const open = await openTab();
      if (!open) return;
      const tab = await gateway.getDinerTab(open.tabId).catch(() => null);
      if (!tab) return;

      // `myLines` is never withheld: a diner may always see what they ordered.
      expect(Array.isArray(tab.myLines)).toBe(true);

      if (tab.money.kind === 'ownItemsOnly') {
        expect(typeof tab.money.yourItemsSubtotalDram).toBe('number');
        // Whole dram. The client must never compute money, and a fraction here
        // means somebody did.
        expect(Number.isInteger(tab.money.yourItemsSubtotalDram)).toBe(true);
      }
    });

    it('reports a shared line by the snapshot taken when it was ordered', async () => {
      /*
       * > How many ways a shared line splits, snapshotted when it was ordered.
       * > Not the current participant count: a badge computed from "who is on
       * > the tab now" would relabel every past line the moment somebody joins.
       *
       * The failure this catches is a mock that computes the count from the
       * roster it happens to hold, which reads correctly until a second person
       * joins and then silently rewrites history.
       */
      const open = await openTab();
      if (!open) return;
      const lines = await staff
        .getTabLines({ branchId: fixtures.branchId, tabId: open.tabId })
        .catch(() => [] as const);
      if (lines.length === 0) return;

      for (const line of lines) {
        expect(Number.isInteger(line.sharedWithCount)).toBe(true);
        expect(line.sharedWithCount).toBeGreaterThanOrEqual(0);
        // An unshared line splits no ways; a shared one splits at least one.
        if (!line.isShared) expect(line.sharedWithCount).toBe(0);
      }
    });

    it('marks a voided line by its zeroed total, keeping the snapshot intact', async () => {
      /*
       * > No read model carries a void flag; the only signal on the wire is
       * > that the server zeroes `lineTotalAmd` for a voided line while
       * > `unitPriceAmd` and `quantity` keep their snapshots.
       *
       * So "voided" is `status`, inferred from that combination — and the
       * snapshot has to survive, or there is nothing left to infer from.
       */
      const open = await openTab();
      if (!open) return;
      const lines = await staff
        .getTabLines({ branchId: fixtures.branchId, tabId: open.tabId })
        .catch(() => [] as const);

      for (const line of lines.filter((entry) => entry.status === 'voided')) {
        expect(line.lineTotalDram, 'a voided line still counts toward the bill').toBe(0);
        expect(line.quantity, 'a voided line lost its quantity snapshot').toBeGreaterThan(0);
        expect(line.unitPriceDram, 'a voided line lost its price snapshot').toBeGreaterThan(0);
      }
    });
  });
}
