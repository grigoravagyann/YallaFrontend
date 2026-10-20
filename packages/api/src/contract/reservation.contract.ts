import { beforeAll, describe, expect, it } from 'vitest';
import {
  BookingOverlapsOwnError,
  PhoneHasActiveBookingError,
  LeadTimeExceededError,
  TableTakenError,
} from '../contracts/errors';
import type { ContractDiner, ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * Booking a table, and being told plainly why not.
 *
 * The rule the whole reservation flow rests on: **each refusal is its own named
 * outcome, not a generic failure.** They have different next steps — "pick
 * another table", "pick another time", "the venue is shut then" — and a screen
 * given one error for all of them sends a diner to retry the thing that cannot
 * work.
 *
 * The window is the other half. The product does not ask people how long they
 * intend to stay; it *tells* them, before any confirm button, so somebody who
 * needs longer can pick a different table rather than negotiate at the door.
 *
 * Booked as a diner of this suite's own — registered, number confirmed by code,
 * signed in — because `POST /api/reservations` answers only to one. One diner
 * may not hold two overlapping sittings at the branch, so every test that books
 * at the same evening books as a diner of its own.
 */
export function describeReservationContract(subject: ContractSubject): void {
  const reason = subject.unsupported('reservations');
  const suite = reason ? describe.skip : describe;

  suite(`reservations — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { fixtures } = subject;
    let diner: ContractDiner;

    beforeAll(async () => {
      diner = await subject.newDiner();
    });

    async function firstBookable() {
      const floor = await diner.gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
        timeZoneId: fixtures.timeZoneId,
      });
      const table = floor!.tables.find((entry) => entry.isBookable);
      expect(table, 'nothing is bookable tomorrow evening').toBeDefined();
      return table!;
    }

    /**
     * A booking command as the app sends it. The command id is a fresh GUID,
     * which is what `clientCommandId` is on the wire: anything else is a 400
     * before any booking rule is asked.
     */
    function bookingOf(tableId: string, slotUtc: string, who: ContractDiner = diner) {
      return {
        commandId: randomUuid(),
        branchId: fixtures.branchId,
        tableId,
        slotUtc,
        partySize: 2,
        guestPhone: who.phoneE164,
        timeZoneId: fixtures.timeZoneId,
        guestName: 'Ani',
        channel: 'app' as const,
      };
    }

    it('promises a window that starts at the slot and is bounded or openly unbounded', async () => {
      const table = await firstBookable();

      expect(table.window).not.toBeNull();
      // The same instant. The wire writes it without milliseconds, so the
      // strings are not compared.
      expect(Date.parse(table.window!.fromUtc)).toBe(Date.parse(fixtures.tomorrowEveningUtc));

      /*
       * > A table with nothing booked after it does not get a blank space where
       * > the limit would be — it gets "no booking after yours", which is an
       * > advantage and a reason to choose this table.
       *
       * So the unbounded case is stated by `untilUtc: null` rather than by a
       * missing field, and `isShorterThanTurnTime` is the server's comparison
       * rather than one the client makes with a number it happens to have.
       */
      expect(table.window).toHaveProperty('untilUtc');
      expect(typeof table.window!.isShorterThanTurnTime).toBe('boolean');
      if (table.window!.untilUtc === null) {
        expect(table.window!.minutes).toBeNull();
        expect(table.window!.isShorterThanTurnTime).toBe(false);
      }
    });

    it('carries a free-cancellation deadline on every offer', async () => {
      // Shown before the diner commits, because a deadline discovered after
      // booking is a deadline nobody agreed to.
      const table = await firstBookable();
      expect(table.freeCancellationUntilUtc).toBeTruthy();
      expect(Number.isNaN(Date.parse(table.freeCancellationUntilUtc ?? ''))).toBe(false);
    });

    it('refuses a slot inside the lead time as its own named outcome', async () => {
      /*
       * Not a validation error — nothing the diner typed is wrong, time simply
       * passed. The screen offers a later slot rather than an error, and it can
       * only do that if the refusal is distinguishable.
       */
      const table = await firstBookable();
      const tooSoon = new Date(Date.now() + 60_000).toISOString();

      const attempt = diner.gateway.createBooking(bookingOf(table.tableId, tooSoon));

      await expect(attempt).rejects.toBeInstanceOf(LeadTimeExceededError);

      const error: unknown = await attempt.catch((caught: unknown) => caught);
      // It carries the earliest slot that *would* work, so the screen can offer
      // it rather than making the diner guess.
      expect(error).toBeInstanceOf(LeadTimeExceededError);
      const lead = error as LeadTimeExceededError;
      expect(lead.leadTimeMinutes).toBeGreaterThan(0);
      expect(lead.earliestSlotUtc).toBeTruthy();
    });

    it('answers a lost race with the table named and a refreshed room attached', async () => {
      /*
       * Two diners tap the same free two-top a second apart and exactly one
       * wins. The loser must be told plainly *which* table went and handed a
       * room to pick from — refetching blind is how a second diner loses the
       * same race twice.
       */
      const table = await firstBookable();
      const first = await subject.newDiner();

      await first.gateway.createBooking(
        bookingOf(table.tableId, fixtures.tomorrowEveningUtc, first),
      );
      const rival = await subject.rivalOf(first);

      const second = rival.gateway.createBooking(
        bookingOf(table.tableId, fixtures.tomorrowEveningUtc, rival),
      );

      await expect(second).rejects.toBeInstanceOf(TableTakenError);

      const caught: unknown = await second.catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(TableTakenError);
      const taken = caught as TableTakenError;
      expect(taken.tableId).toBe(table.tableId);
      expect(taken.tableLabel).toBeTruthy();
      expect(taken.floor, 'the 409 arrived with no room to pick from').not.toBeNull();
      expect(taken.floor?.tables.length).toBeGreaterThan(0);
    });

    it('replays an identical booking rather than making a second one', async () => {
      // What makes a flaky connection unable to create two bookings.
      const table = await firstBookable();
      const fresh = await subject.newDiner();
      const command = bookingOf(table.tableId, fixtures.tomorrowEveningUtc, fresh);

      const first = await fresh.gateway.createBooking(command);
      const replay = await fresh.gateway.createBooking(command);

      expect(replay.id, 'a retried booking created a second reservation').toBe(first.id);
      expect(replay.code).toBe(first.code);
    });

    it('refuses one diner a second sitting overlapping their own, naming the first', async () => {
      // Bella held table 1 at 19:45 and table 2 at 19:30 the same evening: no more.
      const bella = await subject.newDiner();
      const first = await firstBookable();
      const held = await bella.gateway.createBooking(
        bookingOf(first.tableId, fixtures.tomorrowEveningUtc, bella),
      );
      try {
        const earlier = new Date(Date.parse(fixtures.tomorrowEveningUtc) - 15 * 60_000);
        const floor = await bella.gateway.getSlotFloor({
          branchId: fixtures.branchId,
          slotUtc: earlier.toISOString(),
          partySize: 2,
          timeZoneId: fixtures.timeZoneId,
        });
        const other = floor!.tables.find(
          (entry) => entry.isBookable && entry.tableId !== held.tableId && !entry.mustFreeByUtc,
        );
        expect(other, 'no second table is bookable a quarter hour earlier').toBeDefined();

        const refused: unknown = await bella.gateway
          .createBooking(bookingOf(other!.tableId, earlier.toISOString(), bella))
          .catch((error: unknown) => error);
        expect(refused).toBeInstanceOf(BookingOverlapsOwnError);
        expect(refused).toMatchObject({
          existingReservationId: held.id,
          existingCode: held.code,
          tableLabel: held.tableLabel,
        });
        expect((refused as BookingOverlapsOwnError).localStartTime).toMatch(/^\d\d:\d\d$/u);
      } finally {
        await bella.gateway.cancelBooking(held.id).catch(() => undefined);
      }
    });

    it('refuses one number a fourth active booking, naming its earliest to its own account', async () => {
      // Since 2026-10-20 one proved number holds at most three active bookings, anywhere.
      const bella = await subject.newDiner();
      const evening = (day: number) =>
        new Date(Date.parse(fixtures.tomorrowEveningUtc) + day * 24 * 60 * 60_000).toISOString();
      const tableOn = async (slotUtc: string) => {
        const floor = await bella.gateway.getSlotFloor({
          branchId: fixtures.branchId,
          slotUtc,
          partySize: 2,
          timeZoneId: fixtures.timeZoneId,
        });
        const table = floor!.tables.find((entry) => entry.isBookable && !entry.mustFreeByUtc);
        expect(table, `no table is bookable at ${slotUtc}`).toBeDefined();
        return table!.tableId;
      };
      const made: string[] = [];
      try {
        for (const day of [0, 1, 2]) {
          const booking = await bella.gateway.createBooking(
            bookingOf(await tableOn(evening(day)), evening(day), bella),
          );
          made.push(booking.id);
        }

        const fourth = evening(3);
        const table = await tableOn(fourth);
        const refused: unknown = await bella.gateway
          .createBooking(bookingOf(table, fourth, bella))
          .catch((error: unknown) => error);
        expect(refused).toBeInstanceOf(PhoneHasActiveBookingError);
        expect(refused).toMatchObject({ maxActiveBookings: 3, held: { reservationId: made[0] } });

        // Cancelling one frees a place at once.
        await bella.gateway.cancelBooking(made[0]!);
        const again = await bella.gateway.createBooking(bookingOf(table, fourth, bella));
        made.push(again.id);
      } finally {
        for (const id of made) await bella.gateway.cancelBooking(id).catch(() => undefined);
      }
    });
  });
}
