import type { BookingWithoutTable } from '../../contracts/bookingsWithoutTable';
import { ForbiddenError } from '../../errors';
import type { StaffGateway } from '../../staffGateway';
import {
  bookingWithoutTableFromWire,
  waitsForTable,
  type WireReservationView,
} from '../bookingsWithoutTableMapping';
import type { StaffHttpContext } from './context';

/** `ReservationStatus` 2: Confirmed — booked, not yet seated. */
const CONFIRMED = 2;

export function withoutTableMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'listBookingsWithoutTable'> {
  const { client } = ctx;
  return {
    // --- Bookings by time only, waiting for a table (2026-10-29) -------------

    async listBookingsWithoutTable(branchId): Promise<readonly BookingWithoutTable[] | null> {
      try {
        // The branch's confirmed bookings, earliest first as the server sorts
        // them (at most 200); only those made by time only and not yet seated
        // wait for the floor to choose a table.
        const { data } = await client.get<WireReservationView[]>(
          `/api/branches/${branchId}/reservations`,
          { query: { status: CONFIRMED } },
        );
        return (data ?? []).filter(waitsForTable).map(bookingWithoutTableFromWire);
      } catch (error) {
        // The list is a manager's read. A waiter's session is refused, and
        // that says nothing about whether any such booking exists.
        if (error instanceof ForbiddenError) return null;
        throw error;
      }
    },
  };
}
