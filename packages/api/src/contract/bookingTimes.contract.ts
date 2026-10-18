import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EARLIER_GUEST_WINDOW_MINUTES } from '../contracts/approvals';
import type { Booking, CreateBookingCommand } from '../contracts/booking';
import { FreeByRequiredError } from '../contracts/errors';
import type { ContractDiner, ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * Booking times and table sequencing, on one table.
 *
 * > A booking starting within 90 minutes after another on the table, or later
 * > than 45 minutes before the next, is refused for that table. One whose
 * > sitting would run into the next is cut to the next start less 5 minutes,
 * > and the request must carry `acceptsFreeByUtc` equal to that instant (422
 * > naming the field, with `context.requiredFreeByUtc`, otherwise);
 * > `promisedFreeByUtc` records it. From 90 to 180 minutes after an earlier
 * > booking the table is requestable: another day, the later booking waits
 * > (`EarlierGuestConsent`) for up to two hours.
 *
 * One diner books both sides, so the suite holds against the mock (a world per
 * diner) and a live backend alike. Whether the earlier guest is asked by push
 * or the floor decides depends on their devices, so the answer itself is not
 * asserted here — only what every surface can rely on.
 */
export function describeBookingTimesContract(subject: ContractSubject): void {
  const reason = subject.unsupported('reservations');
  const suite = reason ? describe.skip : describe;

  suite(`booking times — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { fixtures } = subject;
    const MINUTE = 60_000;
    const evening = Date.parse(fixtures.tomorrowEveningUtc);
    const shifted = (minutes: number) => new Date(evening + minutes * MINUTE).toISOString();
    let diner: ContractDiner;
    let first: Booking;

    function command(slotUtc: string, extra: Partial<CreateBookingCommand> = {}) {
      return {
        commandId: randomUuid(),
        branchId: fixtures.branchId,
        tableId: first.tableId,
        slotUtc,
        timeZoneId: fixtures.timeZoneId,
        partySize: 2,
        guestName: 'Contract Diner',
        guestPhone: diner.phoneE164,
        channel: 'app' as const,
        ...extra,
      };
    }

    async function onTable(slotUtc: string) {
      const floor = await diner.gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc,
        partySize: 2,
        timeZoneId: fixtures.timeZoneId,
      });
      return floor!.tables.find((table) => table.tableId === first.tableId)!;
    }

    beforeAll(async () => {
      diner = await subject.newDiner();
      const floor = await diner.gateway.getSlotFloor({
        branchId: fixtures.branchId,
        slotUtc: fixtures.tomorrowEveningUtc,
        partySize: 2,
        timeZoneId: fixtures.timeZoneId,
      });
      const table = floor!.tables.find((entry) => entry.isBookable && !entry.mustFreeByUtc);
      expect(table, 'no uncut table is bookable tomorrow evening').toBeDefined();
      first = await diner.gateway.createBooking({
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
    });

    afterAll(async () => {
      // The table is left as the suite found it for every suite after this one.
      if (first) await diner.gateway.cancelBooking(first.id).catch(() => undefined);
    });

    it('refuses the table for the 90 minutes after a booking, and 45 before it', async () => {
      for (const minutes of [30, 75, -30]) {
        const table = await onTable(shifted(minutes));
        expect(table.isBookable, `${minutes} min`).toBe(false);
        expect(table.unavailableReason, `${minutes} min`).toBe('alreadyBooked');
      }
    });

    it('cuts a sitting that would run into the booking, and needs the promise to take it', async () => {
      const slotUtc = shifted(-90);
      const table = await onTable(slotUtc);
      expect(table.isBookable).toBe(true);
      // The next start less the branch's clearing time — five minutes by default.
      const freeBy = table.mustFreeByUtc!;
      expect(Date.parse(freeBy)).toBeLessThan(evening);
      expect(Date.parse(freeBy)).toBeGreaterThan(Date.parse(slotUtc));

      let refused: unknown;
      try {
        await diner.gateway.createBooking(command(slotUtc));
      } catch (error) {
        refused = error;
      }
      expect(refused).toBeInstanceOf(FreeByRequiredError);
      expect(Date.parse((refused as FreeByRequiredError).requiredFreeByUtc!)).toBe(
        Date.parse(freeBy),
      );

      const kept = await diner.gateway.createBooking(
        command(slotUtc, { acceptsFreeByUtc: freeBy }),
      );
      expect(Date.parse(kept.promisedFreeByUtc!)).toBe(Date.parse(freeBy));
      expect(Date.parse(kept.endUtc)).toBe(Date.parse(freeBy));
      await diner.gateway.cancelBooking(kept.id);
    });

    it('offers it from 90 minutes after as a request, which waits for the guest before', async () => {
      const slotUtc = shifted(120);
      const table = await onTable(slotUtc);
      expect(table).toMatchObject({
        isBookable: true,
        requiresApproval: true,
        isRequestable: true,
      });

      const later = await diner.gateway.createBooking(command(slotUtc));
      expect(later).toMatchObject({
        status: 'pendingApproval',
        awaitingApprovalBecause: 'earlierGuestConsent',
      });
      const window = Date.parse(later.approvalExpiresAtUtc!) - Date.now();
      expect(window).toBeGreaterThan(0);
      expect(window).toBeLessThanOrEqual(EARLIER_GUEST_WINDOW_MINUTES * MINUTE + MINUTE);
      await diner.gateway.cancelBooking(later.id);
    });
  });
}
