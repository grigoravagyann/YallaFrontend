import { describe, expect, it } from 'vitest';
import type { ContractSubject } from './subject';

/**
 * The contract that would have caught the original bug.
 *
 * `GET /api/branches/{id}/availability` has answered **for a requested
 * instant** since Backend Prompt 7. Its documentation is explicit about the two
 * things asserted hardest here:
 *
 * > `State` — what to draw, derived for the *requested* instant rather than for
 * > now. A table free now but booked at 20:00 reads as `ReservedSoon` when the
 * > question is about 20:00.
 *
 * > Beyond a few minutes out, physical status is excluded entirely and only
 * > projected sessions and reservations decide.
 *
 * Neither implementation honoured that. The client drew the room from a
 * now-shaped read, and the mock derived every answer from `table.state`
 * whatever slot it was asked about — so the double agreed with the defect and
 * the suite stayed green through five prompts.
 *
 * Every assertion below is written from those two sentences, not from either
 * implementation.
 */
export function describeAvailabilityContract(subject: ContractSubject): void {
  const reason = subject.unsupported('availability');
  const suite = reason ? describe.skip : describe;

  suite(`availability — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { gateway, fixtures } = subject;

    it('answers about the slot it was asked about, not about now', async () => {
      const now = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: new Date().toISOString(),
        partySize: 2,
      });
      const later = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });

      expect(now, 'the fixture branch is missing').not.toBeNull();
      expect(later).not.toBeNull();

      // The echo is what makes a stale render detectable, and it is the
      // cheapest possible proof that the slot reached the server at all.
      expect(later!.slotUtc).not.toBe(now!.slotUtc);
      expect(later!.partySize).toBe(2);
    });

    it('frees a table occupied now for a slot far enough ahead', async () => {
      /*
       * The headline. "Somebody is sitting there" says nothing about tomorrow
       * evening — they will have finished, paid and gone — so beyond the
       * physical horizon only bookings decide.
       *
       * Asserted over whatever the world happens to hold rather than over a
       * seeded table, because the two subjects have different worlds. The
       * question is the same either way: does *anything* stay unavailable
       * tomorrow purely because it is occupied right now?
       */
      const now = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: new Date().toISOString(),
        partySize: 1,
      });
      const later = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 1,
      });

      const occupiedNow = now!.plan.tables.filter(
        (table) => table.state === 'occupied' && table.nextReservationStartUtc === null,
      );

      for (const table of occupiedNow) {
        const tomorrow = later!.plan.tables.find((entry) => entry.id === table.id);
        expect(
          tomorrow?.state,
          `table ${table.label} is occupied now and still occupied tomorrow evening — ` +
            'physical status is leaking past the horizon',
        ).not.toBe('occupied');

        const answer = later!.tables.find((entry) => entry.tableId === table.id);
        expect(
          answer?.unavailableReason,
          `table ${table.label} is refused tomorrow because somebody is sitting there now`,
        ).not.toBe('occupied');
      }
    });

    it('refuses a table for a slot that collides with a booking on it', async () => {
      // `reservedSoon` is the derived state for "spoken for at the time you
      // asked". Whatever is in that state must not also be offered.
      const later = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });

      for (const table of later!.plan.tables) {
        if (table.state !== 'reservedSoon') continue;
        const answer = later!.tables.find((entry) => entry.tableId === table.id);
        expect(
          answer?.isBookable,
          `table ${table.label} reads as booked at this slot and is offered anyway`,
        ).toBe(false);
      }
    });

    it('tells "sitting there now" apart from "booked for that slot"', async () => {
      /*
       * Two different sentences with two different next steps — pick another
       * table, or pick another time. The backend reports both as
       * `TableAlreadyBooked` and separates them by the state it derived *for
       * the requested instant*, so a client that collapses them sends a diner
       * to look at an empty table.
       */
      const later = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });

      for (const answer of later!.tables) {
        const table = later!.plan.tables.find((entry) => entry.id === answer.tableId);
        if (answer.unavailableReason === 'occupied') {
          expect(
            table?.state,
            `table ${answer.tableLabel} is refused as "occupied" while reading as ${table?.state}`,
          ).toBe('occupied');
        }
        if (table?.state === 'reservedSoon' && !answer.isBookable) {
          expect(
            answer.unavailableReason,
            `table ${answer.tableLabel} is booked at this slot but refused as "${answer.unavailableReason}"`,
          ).toBe('alreadyBooked');
        }
      }
    });

    it('offers a window that starts at the slot that was asked about', async () => {
      // The sheet renders this as "held for you 20:00 – 21:45". A window
      // starting anywhere but the requested slot is a promise about a
      // different booking.
      const later = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });

      const bookable = later!.tables.filter((entry) => entry.isBookable);
      expect(bookable.length, 'nothing is bookable tomorrow evening in this world').toBeGreaterThan(
        0,
      );

      for (const answer of bookable) {
        expect(
          answer.window,
          `table ${answer.tableLabel} is bookable with no window`,
        ).not.toBeNull();
        expect(
          answer.window!.fromUtc,
          `table ${answer.tableLabel}'s window starts somewhere other than the requested slot`,
        ).toBe(later!.slotUtc);

        // A bounded window ends after it starts, and an unbounded one says so
        // explicitly rather than by omission.
        if (answer.window!.untilUtc !== null) {
          expect(new Date(answer.window!.untilUtc).getTime()).toBeGreaterThan(
            new Date(answer.window!.fromUtc).getTime(),
          );
        }
      }
    });

    it('never offers a table it also gives a refusal for', async () => {
      // `isBookable` and `unavailableReason` are two halves of one answer.
      const answer = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });

      for (const entry of answer!.tables) {
        if (entry.isBookable) {
          expect(
            entry.unavailableReason,
            `${entry.tableLabel} is bookable with a reason`,
          ).toBeNull();
        } else {
          expect(
            entry.unavailableReason,
            `${entry.tableLabel} is refused with no reason given`,
          ).not.toBeNull();
        }
      }
    });

    it('treats party size as a server input', async () => {
      // Not a local dimming rule. A ten-top the venue will not give to a couple
      // is refused by the server, and the drawn room has to carry that.
      const forTwo = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });
      const forMany = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 10,
      });

      expect(forMany!.partySize).toBe(10);
      expect(forMany!.tables.filter((entry) => entry.isBookable).length).toBeLessThanOrEqual(
        forTwo!.tables.filter((entry) => entry.isBookable).length,
      );

      // The plan agrees with the answer, table for table. This is the join the
      // original defect broke: geometry from one question, verdict from another.
      for (const entry of forMany!.tables) {
        const drawn = forMany!.plan.tables.find((table) => table.id === entry.tableId);
        expect(
          drawn?.isBookable,
          `the drawn room and the answer disagree about ${entry.tableLabel}`,
        ).toBe(entry.isBookable);
      }
    });

    it('refuses a slot in the past once, at the top, with the room intact', async () => {
      /*
       * A branch-level refusal is reported once rather than repeated on forty
       * tables, "so a client can say 'we are closed at 03:00' instead of
       * listing forty tables that are each individually unavailable for the
       * same reason". A room greyed out table by table reads as "fully booked",
       * which is a different fact and sends the diner away.
       */
      const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const answer = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: yesterday,
        partySize: 2,
      });

      expect(answer, 'a past slot returned null instead of a refusal').not.toBeNull();
      expect(answer!.rejection, 'a slot in the past was accepted').not.toBeNull();
      expect(
        answer!.plan.tables.length,
        'the room vanished instead of explaining why the slot was refused',
      ).toBeGreaterThan(0);
      expect(answer!.tables.every((entry) => !entry.isBookable)).toBe(true);
    });

    it('is null only for a branch that does not exist', async () => {
      const missing = await gateway.getSlotFloor({
        branchId: '00000000-0000-0000-0000-000000000000',
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });
      expect(missing).toBeNull();
    });

    it('carries the branch zone, because no tab endpoint does', async () => {
      // Every rendered time in the app resolves through this rather than the
      // device's zone: a tourist's phone on Moscow time would put an Armenian
      // kitchen three hours out.
      const answer = await gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
      });
      expect(answer!.plan.timeZoneId).toBe(fixtures.timeZoneId);
    });
  });
}
