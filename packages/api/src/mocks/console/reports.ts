import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext } from './context';

/** Reports and their CSV export. */
export function reportsMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'getOccupancyReport'
  | 'getReservationReport'
  | 'getRevenueReport'
  | 'getMenuReport'
  | 'getStaffReport'
  | 'exportReport'
> {
  const { reports, requireBranchInVenue, requireRollUp, wait } = ctx;
  return {
    // --- Reports ------------------------------------------------------------

    async getOccupancyReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      requireRollUp(query);
      return reports.occupancy(query);
    },

    async getReservationReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      requireRollUp(query);
      return reports.reservations(query);
    },

    async getRevenueReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      requireRollUp(query);
      return reports.revenue(query);
    },

    async getMenuReport(query) {
      // The slowest of the five against a real database — it anti-joins the
      // whole menu to find what never sold — so the mock is slow too. A section
      // that always answers instantly is a section whose loading state nobody
      // ever sees, and this is the one that needs a real one.
      await wait(3);
      requireBranchInVenue(query.branchId);
      requireRollUp(query);
      return reports.menu(query);
    },

    async getStaffReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      requireRollUp(query);
      return reports.staff(query);
    },

    async exportReport(input) {
      await wait();
      return reports.csv(input);
    },
  };
}
