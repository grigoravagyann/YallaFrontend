import { describe, expect, it } from 'vitest';
import { LeadTimeExceededError, TableTakenError } from '../contracts/errors';
import type { ContractSubject } from './subject';

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
 */
export function describeReservationContract(subject: ContractSubject): void {
  const reason = subject.unsupported('reservations');
  const suite = reason ? describe.skip : describe;

  suite(`reservations — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { gateway, fixtures } = subject;

    async function verifiedToken(phone: string): Promise<string> {
      const challenge = await gateway.requestPhoneCode(phone);
      const verified = await gateway.verifyPhoneCode({
        challengeId: challenge.challengeId,
        // Outside production the backend returns the code it sent, so the flow
        // is exercisable without an SMS provider.
        code: challenge.devCode ?? '123456',
      });
      return verified.verificationToken;
    }

    async function firstBookable() {
      const floor = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });
      const table = floor!.tables.find((entry) => entry.isBookable);
      expect(table, 'nothing is bookable tomorrow evening').toBeDefined();
      return table!;
    }

    it('promises a window that starts at the slot and is bounded or openly unbounded', async () => {
      const table = await firstBookable();

      expect(table.window).not.toBeNull();
      expect(table.window!.fromUtc).toBe(fixtures.tomorrowEveningUtc);

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
      expect(Number.isNaN(Date.parse(table.freeCancellationUntilUtc))).toBe(false);
    });

    it('refuses a slot inside the lead time as its own named outcome', async () => {
      /*
       * Not a validation error — nothing the diner typed is wrong, time simply
       * passed. The screen offers a later slot rather than an error, and it can
       * only do that if the refusal is distinguishable.
       */
      const table = await firstBookable();
      const tooSoon = new Date(Date.now() + 60_000).toISOString();

      const attempt = gateway.createBooking({
        commandId: `contract-lead-${table.tableId}`,
        branchId: fixtures.branchId,
        tableId: table.tableId,
        slotUtc: tooSoon,
        partySize: 2,
        verificationToken: await verifiedToken('+37411000001'),
      });

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
      const token = await verifiedToken('+37411000002');

      await gateway.createBooking({
        commandId: `contract-race-first-${table.tableId}`,
        branchId: fixtures.branchId,
        tableId: table.tableId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
        verificationToken: token,
      });

      const second = gateway.createBooking({
        commandId: `contract-race-second-${table.tableId}`,
        branchId: fixtures.branchId,
        tableId: table.tableId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
        verificationToken: token,
      });

      await expect(second).rejects.toBeInstanceOf(TableTakenError);

      const caught: unknown = await second.catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(TableTakenError);
      const taken = caught as TableTakenError;
      expect(taken.tableId).toBe(table.tableId);
      expect(taken.tableLabel).toBeTruthy();
      expect(taken.floor, 'the 409 arrived with no room to pick from').toBeDefined();
      expect(taken.floor.tables.length).toBeGreaterThan(0);
    });

    it('replays an identical booking rather than making a second one', async () => {
      // What makes a flaky connection unable to create two bookings.
      const table = await firstBookable();
      const command = {
        commandId: `contract-idempotent-${table.tableId}`,
        branchId: fixtures.branchId,
        tableId: table.tableId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
        verificationToken: await verifiedToken('+37411000003'),
      };

      const first = await gateway.createBooking(command);
      const replay = await gateway.createBooking(command);

      expect(replay.id, 'a retried booking created a second reservation').toBe(first.id);
      expect(replay.code).toBe(first.code);
    });
  });
}
