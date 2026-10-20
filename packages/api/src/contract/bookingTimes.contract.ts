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
 * > (`EarlierGuestConsent`) for up to two hours — whether the earlier guest
 * > answers in the app or the floor rings them and decides.
 *
 * One diner books the evening; the bookings either side of it are other
 * diners' — since 2026-10-20 one phone number holds one active booking at a
 * time — signed up beside the first (`rivalOf`), so the suite holds against the
 * mock (a world per diner) and a live backend alike. Whether the earlier guest is asked by push
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

      // Another diner: this one already holds the evening's booking.
      const other = await subject.rivalOf(diner);
      let refused: unknown;
      try {
        await other.gateway.createBooking(command(slotUtc));
      } catch (error) {
        refused = error;
      }
      expect(refused).toBeInstanceOf(FreeByRequiredError);
      expect(Date.parse((refused as FreeByRequiredError).requiredFreeByUtc!)).toBe(
        Date.parse(freeBy),
      );

      const kept = await other.gateway.createBooking(
        command(slotUtc, { acceptsFreeByUtc: freeBy }),
      );
      expect(Date.parse(kept.promisedFreeByUtc!)).toBe(Date.parse(freeBy));
      expect(Date.parse(kept.endUtc)).toBe(Date.parse(freeBy));
      await other.gateway.cancelBooking(kept.id);
    });

    it('offers it from 90 minutes after as a request, which waits for the guest before', async () => {
      // An earlier booking of its own, four hours before the evening one, so the request and its
      // sitting both fit the opening hours whatever the evening's hour is.
      const earlierUtc = shifted(-240);
      const earlierTable = await onTable(earlierUtc);
      // Two more diners: one number, one active booking.
      const earlierGuest = await subject.rivalOf(diner);
      const earlier = await earlierGuest.gateway.createBooking(
        command(
          earlierUtc,
          earlierTable.mustFreeByUtc ? { acceptsFreeByUtc: earlierTable.mustFreeByUtc } : {},
        ),
      );
      try {
        const slotUtc = shifted(-120);
        const table = await onTable(slotUtc);
        expect(table).toMatchObject({
          isBookable: true,
          requiresApproval: true,
          isRequestable: true,
        });

        const laterGuest = await subject.rivalOf(diner);
        const later = await laterGuest.gateway.createBooking(
          command(slotUtc, table.mustFreeByUtc ? { acceptsFreeByUtc: table.mustFreeByUtc } : {}),
        );
        expect(later.status).toBe('pendingApproval');
        // Tomorrow is short notice only late in the evening; otherwise the guest before is asked.
        expect(['earlierGuestConsent', 'shortNotice']).toContain(later.awaitingApprovalBecause);
        // Asked in the app (a guest with a device) or decided by the floor after ringing them
        // (no device to ask, as this run's diner): two hours at most either way, never past
        // the later booking's start - nobody's answer is waited for indefinitely.
        if (later.awaitingApprovalBecause === 'earlierGuestConsent') {
          expect(later.approvalExpiresAtUtc, 'an earlier-guest wait with no clock').not.toBeNull();
          const window = Date.parse(later.approvalExpiresAtUtc!) - Date.now();
          expect(window).toBeGreaterThan(0);
          expect(window).toBeLessThanOrEqual(EARLIER_GUEST_WINDOW_MINUTES * MINUTE + MINUTE);
          expect(Date.parse(later.approvalExpiresAtUtc!)).toBeLessThanOrEqual(Date.parse(slotUtc));
        }
        await laterGuest.gateway.cancelBooking(later.id);
      } finally {
        await earlierGuest.gateway.cancelBooking(earlier.id).catch(() => undefined);
      }
    });
  });
}
