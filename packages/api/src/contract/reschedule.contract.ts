import { beforeAll, describe, expect, it } from 'vitest';
import type { Booking, RescheduleBookingCommand } from '../contracts/booking';
import { BookingNotChangeableError } from '../contracts/errors';
import { NotFoundError } from '../errors';
import type { ContractDiner, ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * The room on a booking, and changing a booking without losing it —
 * `ReservationView.roomId/roomName` and `POST /api/reservations/{id}/reschedule`.
 *
 * > Response 200 `ReservationView` (same code, same id, new
 * > start/end/party/table/room/status). Rules: only `PendingApproval` or
 * > `Confirmed` and not yet started, else 409 `reservation-not-changeable`.
 * > Conflicts are checked … excluding this reservation.
 *
 * The reason for the endpoint is the code. A diner who cancels and books again
 * gets a new code and leaves the venue a cancellation; a moved booking is one
 * booking that the venue sees move.
 */
export function describeRescheduleContract(subject: ContractSubject): void {
  const reason = subject.unsupported('reservations');
  const suite = reason ? describe.skip : describe;

  suite(`changing a booking — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { fixtures } = subject;
    const HALF_HOUR_MS = 30 * 60_000;
    let diner: ContractDiner;
    let stranger: ContractDiner;

    beforeAll(async () => {
      diner = await subject.newDiner();
      stranger = await subject.newDiner();
    });

    /** Tomorrow evening for two, at the first table the room offers, with the room it is in. */
    async function bookTomorrow(): Promise<{ booking: Booking; floorAreaName: string | null }> {
      const floor = await diner.gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
        timeZoneId: fixtures.timeZoneId,
      });
      const table = floor!.tables.find((entry) => entry.isBookable);
      expect(table, 'nothing is bookable tomorrow evening').toBeDefined();

      const booking = await diner.gateway.createBooking({
        commandId: randomUuid(),
        branchId: fixtures.branchId,
        tableId: table!.tableId,
        slotUtc: fixtures.tomorrowEveningUtc,
        timeZoneId: fixtures.timeZoneId,
        partySize: 2,
        guestName: 'Contract Diner',
        guestPhone: diner.phoneE164,
        channel: 'app',
      });
      return { booking, floorAreaName: table!.floorAreaName };
    }

    function moving(booking: Booking, slotUtc: string): RescheduleBookingCommand {
      return {
        bookingId: booking.id,
        commandId: randomUuid(),
        // The contract's branch chooses tables, so its bookings always have one.
        tableId: booking.tableId ?? '',
        slotUtc,
        timeZoneId: fixtures.timeZoneId,
        partySize: booking.partySize,
      };
    }

    it('names the room a booking’s table is in, on the booking and in the diner’s list', async () => {
      const { booking, floorAreaName } = await bookTomorrow();

      expect(booking.roomName).toBe(floorAreaName);
      expect(booking.roomId === null).toBe(booking.roomName === null);

      const mine = await diner.gateway.listBookings();
      const listed = [...mine.upcoming, ...mine.past].find((entry) => entry.id === booking.id);
      expect(listed).toMatchObject({ roomId: booking.roomId, roomName: booking.roomName });
      await diner.gateway.cancelBooking(booking.id);
    });

    it('moves a booking half an hour on its own table, keeping its id and its code', async () => {
      const { booking } = await bookTomorrow();
      // Earlier rather than later: whatever hours make 20:00 bookable make the
      // half hour before it bookable too, and a later sitting may run past
      // closing.
      const earlier = new Date(Date.parse(booking.slotUtc) - HALF_HOUR_MS).toISOString();

      // The booking's own sitting overlaps the half hour before it, so its table
      // is free then only to the diner moving it.
      const asked = await diner.gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: earlier,
        partySize: 2,
        timeZoneId: fixtures.timeZoneId,
      });
      expect(asked!.tables.find((entry) => entry.tableId === booking.tableId)?.isBookable).toBe(
        false,
      );
      const changing = await diner.gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: earlier,
        partySize: 2,
        timeZoneId: fixtures.timeZoneId,
        excludeBookingId: booking.id,
      });
      expect(changing!.tables.find((entry) => entry.tableId === booking.tableId)?.isBookable).toBe(
        true,
      );

      const command = moving(booking, earlier);
      const moved = await diner.gateway.rescheduleBooking(command);

      expect(moved.id).toBe(booking.id);
      expect(moved.code).toBe(booking.code);
      expect(moved.tableId).toBe(booking.tableId);
      expect(moved.roomName).toBe(booking.roomName);
      expect(Date.parse(moved.slotUtc)).toBe(Date.parse(earlier));
      expect(Date.parse(moved.endUtc) - Date.parse(moved.slotUtc)).toBe(
        Date.parse(booking.endUtc) - Date.parse(booking.slotUtc),
      );
      expect(['confirmed', 'pendingApproval']).toContain(moved.status);

      // A replay answers the booking as it stands, and moves nothing.
      const replay = await diner.gateway.rescheduleBooking(command);
      expect(replay.id).toBe(booking.id);
      expect(Date.parse(replay.slotUtc)).toBe(Date.parse(earlier));

      const listed = (await diner.gateway.getBooking(booking.id))!;
      expect(Date.parse(listed.slotUtc)).toBe(Date.parse(earlier));
      await diner.gateway.cancelBooking(booking.id);
    });

    it('refuses to move a cancelled booking, by its own name', async () => {
      const { booking } = await bookTomorrow();
      await diner.gateway.cancelBooking(booking.id);

      await expect(
        diner.gateway.rescheduleBooking(
          moving(booking, new Date(Date.parse(booking.slotUtc) - HALF_HOUR_MS).toISOString()),
        ),
      ).rejects.toBeInstanceOf(BookingNotChangeableError);
    });

    it("answers somebody else's booking exactly as one that does not exist", async () => {
      const { booking } = await bookTomorrow();

      await expect(
        stranger.gateway.rescheduleBooking(moving(booking, booking.slotUtc)),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        diner.gateway.rescheduleBooking({
          ...moving(booking, booking.slotUtc),
          bookingId: randomUuid(),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      // And the booking is where it was.
      const listed = (await diner.gateway.getBooking(booking.id))!;
      expect(Date.parse(listed.slotUtc)).toBe(Date.parse(booking.slotUtc));
      await diner.gateway.cancelBooking(booking.id);
    });
  });
}
