import type { BookingWithoutTable } from '../../contracts/bookingsWithoutTable';
import type { StaffGateway } from '../../staffGateway';
import {
  bookingWithoutTableFromWire,
  waitsForTable,
  type WireReservationView,
} from '../bookingsWithoutTableMapping';
import type { StaffHttpContext } from './context';

export function withoutTableMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'listBookingsWithoutTable'> {
  const { client } = ctx;
  return {
    // --- Bookings by time only, waiting for a table (2026-10-29) -------------

    async listBookingsWithoutTable(branchId): Promise<readonly BookingWithoutTable[]> {
      // The floor's own read, waiter or above: the branch's confirmed bookings
      // made by time only that have no table and have not ended, soonest first
      // (at most 200). Filtered again, so one that has its table by now is on
      // that table's tile and not on the door's list.
      // gateway-schema: awaiting-route — backend feat/time-only-booking 601c00b; schema.ts is regenerated once the branches merge
      const { data } = await client.get<WireReservationView[]>(
        `/api/branches/${branchId}/reservations/without-table`,
      );
      return (data ?? []).filter(waitsForTable).map(bookingWithoutTableFromWire);
    },
  };
}
