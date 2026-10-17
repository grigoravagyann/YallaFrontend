import { describe, expect, it } from 'vitest';
import { localDateTime } from '../http/mapping';
import type { ContractSubject } from './subject';

/**
 * A day of slots — `GET /api/branches/{id}/availability/slots` — and the one
 * promise it exists to keep: **it agrees with the room**.
 *
 * The booking screen strikes the times nobody can have. A time it offers that
 * then opens a room with no free table, or a time it strikes that had one, is
 * the screen lying in each direction. The backend shares the per-table checks
 * between the single-slot read and this one so they cannot disagree; these
 * assertions hold either implementation to that, slot by slot.
 *
 * > Slots every 30 minutes from 00:00 on `date` whose whole turn fits one
 * > opening block (closed times omitted); a time before the lead time /
 * > outside the window is listed with `isAvailable=false` and its reason.
 */
export function describeDaySlotsContract(subject: ContractSubject): void {
  const reason = subject.unsupported('availability');
  const suite = reason ? describe.skip : describe;

  suite(`day slots — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { gateway, fixtures } = subject;
    const zone = fixtures.timeZoneId;
    const tomorrow = localDateTime(fixtures.tomorrowEveningUtc, zone).date;

    it('lists the day earliest first, half-hourly, each time on the branch’s own clock', async () => {
      const day = await gateway.getDaySlots({
        branchId: fixtures.branchId,
        date: tomorrow,
        partySize: 2,
      });

      expect(day).toMatchObject({ branchId: fixtures.branchId, date: tomorrow, partySize: 2 });
      expect(day!.stepMinutes).toBe(30);
      // Tomorrow evening is bookable — every reservation contract rests on it —
      // so the day is open and lists something.
      expect(day!.unavailableReason).toBeNull();
      expect(day!.slots.length).toBeGreaterThan(0);

      const instants = day!.slots.map((slot) => Date.parse(slot.slotUtc));
      expect(instants).toEqual([...instants].sort((a, b) => a - b));
      for (const slot of day!.slots) {
        expect(slot.time).toMatch(/^\d{2}:\d{2}$/u);
        expect(localDateTime(slot.slotUtc, zone)).toEqual({ date: tomorrow, time: slot.time });
        expect(Number(slot.time.slice(3)) % 30).toBe(0);
        // Available, or a reason; never both, never neither once it was asked.
        expect(slot.isAvailable).toBe(slot.unavailableReason === null);
        expect(slot.freeTableCount > 0).toBe(slot.isAvailable);
      }
    });

    it('agrees with the room: tomorrow evening, and the first and last times of the day', async () => {
      const day = await gateway.getDaySlots({
        branchId: fixtures.branchId,
        date: tomorrow,
        partySize: 2,
      });
      const evening = day!.slots.find(
        (slot) => Date.parse(slot.slotUtc) === Date.parse(fixtures.tomorrowEveningUtc),
      );
      expect(evening, 'tomorrow at 20:00 is not among the day’s times').toBeDefined();

      for (const slot of [evening!, day!.slots[0]!, day!.slots[day!.slots.length - 1]!]) {
        const floor = await gateway.getSlotFloor({
          branchId: fixtures.branchId,
          slotUtc: slot.slotUtc,
          partySize: 2,
          timeZoneId: zone,
        });
        const bookable = floor!.tables.filter((table) => table.isBookable);
        expect(slot.isAvailable, slot.time).toBe(floor!.rejection === null && bookable.length > 0);
        expect(slot.freeTableCount, slot.time).toBe(bookable.length);
        // "Will wait for the venue" is the room's word too, not a second rule.
        if (bookable[0])
          expect(slot.requiresApproval, slot.time).toBe(bookable[0].requiresApproval);
      }
    });

    it('offers nothing on a day that has gone', async () => {
      const yesterday = localDateTime(
        new Date(Date.parse(fixtures.tomorrowEveningUtc) - 2 * 24 * 60 * 60_000),
        zone,
      ).date;
      const day = await gateway.getDaySlots({
        branchId: fixtures.branchId,
        date: yesterday,
        partySize: 2,
      });

      // Refused as a day, or slot by slot — either way nothing is offered and
      // every refusal says why.
      expect(day!.slots.every((slot) => !slot.isAvailable)).toBe(true);
      for (const slot of day!.slots) {
        expect(slot.unavailableReason ?? day!.unavailableReason).not.toBeNull();
      }
    });

    it('is null for a branch that does not exist', async () => {
      await expect(
        gateway.getDaySlots({
          branchId: '00000000-0000-4000-8000-00000000dead',
          date: tomorrow,
          partySize: 2,
        }),
      ).resolves.toBeNull();
    });
  });
}
