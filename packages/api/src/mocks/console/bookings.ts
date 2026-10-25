import { branchOverviewFrom } from '../branchOverviewMock';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** Bookings waiting for approval and the branch overview's booking actions. */
export function bookingsMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'listPendingReservations'
  | 'approveReservation'
  | 'rejectReservation'
  | 'getBranchOverview'
  | 'actOnBooking'
> {
  const {
    actOnTodayBooking,
    approvalRowsFor,
    bookings,
    branchTimeZone,
    decideBooking,
    hoursFor,
    now,
    overviewTables,
    policyFor,
    requireBranchInVenue,
    requireManagerAtBranch,
    seedBookings,
    specialDaysFor,
    sweepExpired,
    todayRowsFor,
    wait,
  } = ctx;
  return {
    // --- Bookings waiting for approval ------------------------------------------

    async listPendingReservations(branchId) {
      await wait();
      // `BranchScoped`: since K4 a manager whose home branch is another one is
      // refused here, as on every branch route.
      requireBranchInVenue(branchId);
      seedBookings();
      sweepExpired();
      return [...bookings.values()]
        .filter((booking) => booking.branchId === branchId && booking.status === 'pendingApproval')
        .sort(
          (a, b) =>
            a.localDate.localeCompare(b.localDate) ||
            a.localStartTime.localeCompare(b.localStartTime),
        );
    },

    async approveReservation(command) {
      await wait();
      return decideBooking(command, true);
    },

    async rejectReservation(command) {
      await wait();
      return decideBooking(command, false);
    },

    // --- Overview -------------------------------------------------------------------

    async getBranchOverview(branchId) {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/overview`);
      seedBookings();
      sweepExpired();
      return branchOverviewFrom({
        branchId,
        timeZoneId: branchTimeZone(branchId),
        now: now(),
        weeklyHours: hoursFor(branchId),
        specialDays: specialDaysFor(branchId),
        tables: overviewTables(branchId),
        bookings: [...todayRowsFor(branchId), ...approvalRowsFor(branchId)],
        graceMinutes: policyFor(branchId).graceMinutes,
      });
    },

    async actOnBooking(command) {
      await wait();
      return actOnTodayBooking(command);
    },
  };
}
