import type { BookingWithoutTable } from '../../contracts/bookingsWithoutTable';
import { ForbiddenError } from '../../errors';
import type { StaffGateway } from '../../staffGateway';
import { localDateAndTime } from '../approvalWindow';
import type { StaffMockContext } from './context';

/** Bookings by time only, waiting for the floor to choose a table (2026-10-29). */
export function withoutTableMethods(
  ctx: StaffMockContext,
): Pick<StaffGateway, 'listBookingsWithoutTable'> {
  // `calm`, not `settle`: a read the floor added later must not take the send
  // failures a test arranged for the commands it watches.
  const { calm, now, options, plan, requireSession, withoutTable } = ctx;
  return {
    async listBookingsWithoutTable(branchId): Promise<readonly BookingWithoutTable[]> {
      requireSession(`/api/branches/${branchId}/reservations`);
      // A session the floor's read refuses — a cook, another branch.
      if (options.bookingsWithoutTableRefused) {
        throw new ForbiddenError({ url: `/api/branches/${branchId}/reservations/without-table` });
      }
      const listed = [...withoutTable.bookings.values()]
        // Seated, it is on its table's tile like any other booking; let go,
        // or over, it is nobody's to seat.
        .filter(
          (booking) =>
            booking.tableId === null &&
            booking.releasedAs === null &&
            Date.parse(booking.endUtc) > now().getTime(),
        )
        // The server's order: the branch's day, then the start.
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
        .map((booking): BookingWithoutTable => ({
          id: booking.id,
          code: booking.code,
          guestName: booking.guestName,
          guestPhone: booking.guestPhone,
          partySize: booking.partySize,
          startUtc: booking.startUtc,
          endUtc: booking.endUtc,
          ...localDateAndTime(booking.startUtc, plan.timeZoneId),
          note: booking.note,
          phoneUnverified: booking.phoneUnverified,
          guestRecord: booking.guestRecord,
          guestConfirmedOnWayAtUtc: booking.guestConfirmedOnWayAtUtc,
          guestRunningLateMinutes: booking.guestRunningLateMinutes,
          channel: booking.channel,
          takenByName: booking.takenByName,
        }));
      return calm(listed);
    },
  };
}
