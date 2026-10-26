import { describe, expect, it } from 'vitest';
import { STAFF_RECENT_LISTS, type PerformanceRange } from '../contracts/activity';
import type { ContractSubject } from './subject';

/**
 * My results in one read (`getMyResults`, 2026-10-26).
 *
 * The staff phone reads a period with one request instead of one per list, so
 * the one read has to say exactly what the separate reads say: the same
 * person, figures and chart as `getMyPerformance`, and each list the page that
 * route answers for it at the same limit — or the screen would quietly change
 * with the transport. Read as the seeded waiter, from their own session.
 */
export function describeMyResultsContract(subject: ContractSubject): void {
  describe(`my results — ${subject.name}`, () => {
    const { staff, fixtures } = subject;

    /** The last seven days on the branch's calendar, today included. */
    function lastWeek(): PerformanceRange {
      const day = (offsetDays: number) =>
        new Intl.DateTimeFormat('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: fixtures.timeZoneId,
        }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60_000));
      return { from: day(-6), to: day(0) };
    }

    it('answers every list at once, each as the one-list read answers it', async () => {
      // The phone opens on the floor first; the mock adopts its branch from it.
      await staff.getFloor(fixtures.branchId);
      const range = lastWeek();
      const limit = 3;
      const all = await staff.getMyResults({ ...range, limit });
      const orders = await staff.getMyPerformance({ ...range, limit });

      expect(all.from).toBe(range.from);
      expect(all.to).toBe(range.to);
      expect(all.staffMemberId).toBe(orders.staffMemberId);
      expect(all.figures).toEqual(orders.figures);
      expect(all.daily).toEqual(orders.daily);
      expect(all.daily.length).toBeGreaterThanOrEqual(7);

      for (const list of STAFF_RECENT_LISTS) {
        const alone = await staff.getMyPerformance({ ...range, list, limit });
        const together = all.recent[list];
        expect(together.list, `${list}: named`).toBe(list);
        expect(together.items.length, `${list}: at most the limit`).toBeLessThanOrEqual(limit);
        expect(
          together.items.map((entry) => entry.id),
          `${list}: the same entries, newest first`,
        ).toEqual(alone.recent.items.map((entry) => entry.id));
        expect(together.nextCursor === null, `${list}: more to come, or not`).toBe(
          alone.recent.nextCursor === null,
        );
      }
    });
  });
}
