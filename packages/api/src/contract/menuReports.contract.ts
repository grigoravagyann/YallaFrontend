import { describe, expect, it } from 'vitest';
import type { ContractSubject } from './subject';

/**
 * An incomplete menu item is invisible to a diner and visible to its owner.
 *
 * The rule, from the backend's own description of the diner-facing read:
 *
 * > An item without a photo or without allergens never appears here, for the
 * > same reason it never reaches the app: somebody reading an empty allergen
 * > list reasonably concludes there are none.
 *
 * The console read is the opposite by design — an owner cannot finish an item
 * they cannot see. So the same item must be absent from one and present in the
 * other, and a mock that filtered both ways or neither would look plausible on
 * each screen alone.
 */
export function describeMenuContract(subject: ContractSubject): void {
  const reason = subject.unsupported('menu');
  const suite = reason ? describe.skip : describe;

  suite(`menu — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { gateway, console: consoleGateway, fixtures } = subject;

    it('offers a diner nothing the console would still call incomplete', async () => {
      /*
       * Stated per read rather than by matching ids across the two.
       *
       * The rule is about one menu seen two ways, and on a real backend that is
       * literally one table. The mock, though, builds the console's world and
       * the diner's world from separate instances of the same fixture — the
       * console one deliberately strips a photo so its "incomplete" affordance
       * has something to mark. Comparing ids across those two would be
       * asserting that two demo worlds were seeded identically, which is a fact
       * about the fixtures and not about the API.
       *
       * What *is* about the API, and is what the original defect broke: the
       * diner read contains only complete items, the console read keeps the
       * incomplete ones, and a diner can never be offered something the console
       * does not have.
       */
      const admin = await consoleGateway.getAdminMenu(fixtures.branchId);
      const diner = await gateway.getBranchMenuDetail(fixtures.branchId);

      const adminItems = admin.flatMap((category) => category.items);
      const dinerItems = (diner?.categories ?? []).flatMap((category) => category.items);

      expect(adminItems.length, 'the console menu is empty; nothing to compare').toBeGreaterThan(0);
      expect(dinerItems.length, 'nothing at all is published to diners').toBeGreaterThan(0);

      // The console keeps what an owner still has to finish, or there is no
      // screen anywhere that can complete it.
      const incompleteInConsole = adminItems.filter(
        (item) => !item.photo?.thumbnailUrl || item.allergens.trim() === '',
      );
      expect(
        incompleteInConsole.length,
        'the console shows no incomplete item, so the rule has nothing to act on',
      ).toBeGreaterThan(0);

      // And nothing reaches a diner that the console does not have.
      const adminIds = new Set(adminItems.map((item) => item.id));
      for (const item of dinerItems) {
        expect(
          adminIds.has(item.id),
          `"${item.name}" is offered to diners and is not on the console's menu at all`,
        ).toBe(true);
      }
    });

    const allergenDefect = subject.knownDefect?.('menu.allergensRequired') ?? null;
    const allergenTest = allergenDefect ? it.fails : it;

    allergenTest(
      `never offers a diner an item with no allergens written down${
        allergenDefect ? ` (known defect: ${allergenDefect})` : ''
      }`,
      async () => {
        // The reason the rule exists: an empty list reads as "no allergens", and
        // somebody with an allergy acts on that.
        const diner = await gateway.getBranchMenuDetail(fixtures.branchId);
        for (const category of diner?.categories ?? []) {
          for (const item of category.items) {
            expect(
              item.allergens.trim(),
              `"${item.name}" reaches a diner with no allergens listed`,
            ).not.toBe('');
            expect(
              item.photo?.thumbnailUrl,
              `"${item.name}" reaches a diner with no photo`,
            ).toBeTruthy();
          }
        }
      },
    );
  });
}

/**
 * Reports carry a comparison or they carry none.
 *
 * Shape only — the numbers belong to whatever world the subject holds. What
 * must hold everywhere is that **a comparison is never fabricated**:
 *
 * > Null when there is no prior data at all — which is *not* the same as zero,
 * > and a client must render it differently: a venue's first week has no
 * > previous week, and "down 100%" would be a lie about it.
 *
 * And the fraction is nulled independently, because growth from a previous
 * period of zero has no percentage.
 */
export function describeReportContract(subject: ContractSubject): void {
  const reason = subject.unsupported('reports');
  const suite = reason ? describe.skip : describe;

  suite(`reports — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { console: consoleGateway, fixtures } = subject;

    const range = (() => {
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 24 * 60 * 60_000);
      return {
        branchId: fixtures.branchId,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      };
    })();

    it('never fabricates a comparison', async () => {
      const revenue = await consoleGateway.getRevenueReport(range);
      const occupancy = await consoleGateway.getOccupancyReport(range);

      const measures = [
        revenue.totalAmd,
        revenue.averageTabAmd,
        revenue.averagePerHeadAmd,
        occupancy.sessions,
        occupancy.seatsFilled,
      ];

      for (const measure of measures) {
        expect(typeof measure.value).toBe('number');

        // Absent, or a real number — never a stand-in.
        if (measure.previous !== null) expect(typeof measure.previous).toBe('number');

        // The fraction may be null even when `previous` is present, because a
        // previous of zero has no percentage. It may never be present when
        // `previous` is absent: there would be nothing to compute it from.
        if (measure.previous === null) {
          expect(
            measure.changeFraction,
            'a change fraction was produced with no previous period behind it',
          ).toBeNull();
        }
        if (measure.changeFraction !== null) {
          expect(Number.isFinite(measure.changeFraction)).toBe(true);
        }
      }
    });

    it('answers about the range it was asked about', async () => {
      const revenue = await consoleGateway.getRevenueReport(range);
      expect(revenue.scope.fromLocalDate).toBe(range.from);
      expect(revenue.scope.toLocalDate).toBe(range.to);

      /*
       * `byDay` is **sparse**: the server groups the tabs that closed, so a day
       * with no takings produces no row at all.
       *
       * This assertion originally demanded one row per day in the range, which
       * nothing in the API ever promised — and the mock happened to satisfy it,
       * so it passed. The live run is what said otherwise. What the API does
       * guarantee is asserted instead: rows fall inside the range, are ordered,
       * and never repeat a day. A client that wants a point per day fills the
       * gaps itself, and now does.
       */
      const days = revenue.byDay.map((day) => day.localDate);
      expect(new Set(days).size, 'a day appears twice in byDay').toBe(days.length);
      expect([...days].sort()).toEqual(days);
      for (const day of days) {
        expect(day >= range.from && day <= range.to, `${day} is outside the range`).toBe(true);
      }
    });
  });
}
