import { describe, expect, it } from 'vitest';
import { OnMyWayNotOpenError } from '../contracts/errors';
import { localDateTime } from '../http/mapping';
import type { ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * A booking taken by hand on the floor (2026-10-31, Yalla
 * `docs/reservations.md`, staff-taken bookings), as a waiter's session:
 *
 * > `POST /api/branches/{branchId}/reservations/staff` — confirmed at once,
 * > `Channel = Staff`, `TakenByStaffId` the acting staff member; a second
 * > POST with the same `clientCommandId` answers 200 with the same booking.
 * > `GET …/reservations/slots?date&party` — the day's times with the staff
 * > rules. `GET …/reservations/to-call` — Staff bookings from `StartUtc − 30
 * > min`. `POST /api/reservations/{id}/guest-coming` — allowed from
 * > `StartUtc − 2 h`.
 *
 * Tomorrow evening, as every reservation contract: the booking waits for no
 * answer, is on no call list tonight, and "coming" is refused for being early
 * — each of which both implementations must say.
 */
export function describeStaffBookingsContract(subject: ContractSubject): void {
  const reason = subject.unsupported('staffBookings');
  const suite = reason ? describe.skip : describe;

  suite(`staff-taken bookings — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { staff, fixtures } = subject;
    const zone = fixtures.timeZoneId;
    const tomorrow = localDateTime(fixtures.tomorrowEveningUtc, zone).date;
    const commandId = randomUuid();

    it("lists tomorrow's times with the staff rules: open or struck, a table or guests left per time", async () => {
      const day = await staff.getStaffDaySlots({
        branchId: fixtures.branchId,
        date: tomorrow,
        partySize: 2,
      });

      expect(day).toMatchObject({ branchId: fixtures.branchId, date: tomorrow, partySize: 2 });
      expect(day.unavailableReason).toBeNull();
      expect(day.slots.length).toBeGreaterThan(0);
      const instants = day.slots.map((slot) => Date.parse(slot.slotUtc));
      expect(instants).toEqual([...instants].sort((a, b) => a - b));
      for (const slot of day.slots) {
        expect(slot.time).toMatch(/^\d{2}:\d{2}$/u);
        expect(localDateTime(slot.slotUtc, zone)).toEqual({ date: tomorrow, time: slot.time });
        // Available, or a reason; never both, never neither.
        expect(slot.isAvailable).toBe(slot.unavailableReason === null);
        if (day.bookingMode === 'timeOnly') {
          expect(slot.tables).toEqual([]);
          expect(typeof slot.guestsLeft).toBe('number');
          if (slot.isAvailable) expect(slot.guestsLeft!).toBeGreaterThanOrEqual(2);
        } else {
          expect(slot.guestsLeft).toBeNull();
          // An open time names at least one free table that seats the party.
          expect(slot.tables.length > 0).toBe(slot.isAvailable);
          for (const table of slot.tables) expect(table.seats).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('takes a booking by hand, confirmed at once and linked to the taker; the same command answers it again', async () => {
      const day = await staff.getStaffDaySlots({
        branchId: fixtures.branchId,
        date: tomorrow,
        partySize: 2,
      });
      const slot =
        day.slots.find(
          (candidate) =>
            candidate.isAvailable &&
            Date.parse(candidate.slotUtc) >= Date.parse(fixtures.tomorrowEveningUtc),
        ) ?? day.slots.find((candidate) => candidate.isAvailable);
      expect(slot, 'tomorrow has no time a staff booking could take').toBeDefined();
      const tableId = day.bookingMode === 'timeOnly' ? null : (slot!.tables[0]?.tableId ?? null);

      const command = {
        branchId: fixtures.branchId,
        guestName: 'Contract Guest',
        guestPhone: '+37491000777',
        partySize: 2,
        date: tomorrow,
        time: slot!.time,
        tableId,
        note: 'by hand',
        clientCommandId: commandId,
      };
      const booking = await staff.createStaffBooking(command);

      expect(booking.status).toBe('confirmed');
      expect(booking.channel).toBe('staff');
      expect(booking.wasReplay).toBe(false);
      expect(booking.code).toMatch(/\S/u);
      expect(booking.guestName).toBe('Contract Guest');
      expect(booking.partySize).toBe(2);
      expect(localDateTime(booking.startUtc, zone)).toEqual({ date: tomorrow, time: slot!.time });
      expect(booking.takenByStaffId).toMatch(/\S/u);
      expect(booking.takenByName).toMatch(/\S/u);
      expect(booking.bookedWithoutTable).toBe(tableId === null);
      if (tableId !== null) expect(booking.tableId).toBe(tableId);

      const again = await staff.createStaffBooking(command);
      expect(again.id).toBe(booking.id);
      expect(again.wasReplay).toBe(true);

      // Tomorrow evening is outside everybody's call window tonight.
      const toCall = await staff.listBookingsToCall(fixtures.branchId);
      expect(toCall.some((row) => row.reservationId === booking.id)).toBe(false);

      // And "coming" opens two hours before the start, not the night before.
      await expect(
        staff.markGuestComing({ reservationId: booking.id, clientCommandId: randomUuid() }),
      ).rejects.toBeInstanceOf(OnMyWayNotOpenError);

      // Let go, as the guest told us: the fixture branch is left as it was found.
      const released = await staff.releaseReservation({
        reservationId: booking.id,
        outcome: 'guestCancelled',
        clientCommandId: randomUuid(),
      });
      expect(released.countsTowardNoShowThreshold).toBe(false);
    });
  });
}
