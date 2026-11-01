import type { BookingToCall, StaffBooking, StaffDaySlots } from '../../contracts/staffBookings';
import type { StaffGateway } from '../../staffGateway';
import { rethrowBookingRefusal } from '../bookingRefusal';
import { rethrowPreOrderRefusal } from '../preOrderMapping';
import {
  bookingToCallFromWire,
  staffBookingFromWire,
  staffBookingRequest,
  staffDaySlotsFromWire,
  type WireBookingToCall,
  type WireStaffDaySlots,
  type WireStaffReservationView,
} from '../staffBookingsMapping';
import type { StaffHttpContext } from './context';

/**
 * Bookings taken by hand on the floor (2026-10-31): the day's times for the
 * sheet, taking one, the call list, and "the guest is coming".
 *
 * The routes are in `generated/schema.ts`.
 */
export function staffBookingsMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  'getStaffDaySlots' | 'createStaffBooking' | 'listBookingsToCall' | 'markGuestComing'
> {
  const { client } = ctx;
  return {
    // --- Bookings taken by staff (2026-10-31) --------------------------------

    async getStaffDaySlots({ branchId, date, partySize }): Promise<StaffDaySlots> {
      const { data } = await client.get<WireStaffDaySlots>(
        `/api/branches/${branchId}/reservations/slots`,
        { query: { date, party: partySize } },
      );
      return staffDaySlotsFromWire(data);
    },

    async createStaffBooking(command): Promise<StaffBooking> {
      try {
        // 201, or 200 with `wasReplay` for a second send of the same command.
        const { data } = await client.post<WireStaffReservationView>(
          `/api/branches/${command.branchId}/reservations/staff`,
          staffBookingRequest(command),
        );
        return staffBookingFromWire(data);
      } catch (error) {
        // The ordinary booking refusals: a taken table, closed, past, too far
        // ahead, too small — the sheet says the sentence and lets the staff pick again.
        rethrowBookingRefusal(error, {
          branchId: command.branchId,
          tableId: command.tableId,
          partySize: command.partySize,
        });
      }
    },

    async listBookingsToCall(branchId): Promise<readonly BookingToCall[]> {
      const { data } = await client.get<WireBookingToCall[]>(
        `/api/branches/${branchId}/reservations/to-call`,
      );
      return (data ?? []).map(bookingToCallFromWire);
    },

    async markGuestComing({ reservationId, clientCommandId }): Promise<StaffBooking> {
      try {
        const { data } = await client.post<WireStaffReservationView>(
          `/api/reservations/${reservationId}/guest-coming`,
          { clientCommandId },
        );
        return staffBookingFromWire(data);
      } catch (error) {
        // The same window as the guest's own answer: `on-my-way-not-open`
        // before the start less two hours, or once the booking is over.
        rethrowPreOrderRefusal(error);
      }
    },
  };
}
