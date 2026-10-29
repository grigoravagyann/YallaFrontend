import { describe, expect, it } from 'vitest';
import { ReservationNotStartedError } from '../contracts/errors';
import { ForbiddenError } from '../errors';
import { newCommandId } from '../ids';
import { createStaffMockGateway } from './staffMock';

/**
 * Booking by time only on the tablet's mock (2026-10-29): the door's list of
 * confirmed bookings on no table, seating one at the table the waiter chose —
 * which becomes its table, and leaves the table's own next booking alone —
 * letting one go with no table to free, and one made that way waiting for the
 * floor's yes.
 */

const START = new Date('2026-10-29T15:00:00Z');
const now = () => START;

const SEEDS = [
  {
    id: 'res-t-late',
    guestName: 'Lilit',
    partySize: 6,
    startsInMinutes: 40,
    note: 'A quiet corner',
  },
  { id: 'res-t-soon', guestName: 'Narek', partySize: 2, startsInMinutes: 10, note: '  ' },
] as const;

async function freeTable(staff: ReturnType<typeof createStaffMockGateway>) {
  const floor = await staff.getFloor('b1');
  const detail = floor!.details.find(
    (entry) => entry.physicalStatus === 'free' && entry.nextReservationId !== null,
  );
  if (!detail) throw new Error('the fixture has a free table with a booking later');
  return detail;
}

describe('bookings without a table', () => {
  it('lists the confirmed ones on no table, soonest first, with the wish', async () => {
    const staff = createStaffMockGateway({ now, bookingsWithoutTable: SEEDS });

    const listed = await staff.listBookingsWithoutTable('b1');

    expect(listed?.map((booking) => booking.id)).toEqual(['res-t-soon', 'res-t-late']);
    expect(listed?.[1]).toMatchObject({
      partySize: 6,
      note: 'A quiet corner',
      startUtc: '2026-10-29T15:40:00.000Z',
      endUtc: '2026-10-29T17:40:00.000Z',
    });
    // A blank wish is none.
    expect(listed?.[0]?.note).toBeNull();
  });

  it("refuses a session the floor's read refuses, as the server's 403", async () => {
    const staff = createStaffMockGateway({
      now,
      bookingsWithoutTable: SEEDS,
      bookingsWithoutTableRefused: true,
    });

    await expect(staff.listBookingsWithoutTable('b1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets one go with no table to free, and undoes a no-show back onto the list', async () => {
    const staff = createStaffMockGateway({
      now,
      bookingsWithoutTable: [
        ...SEEDS,
        { id: 'res-t-gone', guestName: 'Gor', partySize: 3, startsInMinutes: -20 },
      ],
    });

    // No no-show before the start, as the server says.
    await expect(
      staff.releaseReservation({
        reservationId: 'res-t-late',
        outcome: 'noShow',
        clientCommandId: newCommandId(),
      }),
    ).rejects.toBeInstanceOf(ReservationNotStartedError);

    const released = await staff.releaseReservation({
      reservationId: 'res-t-gone',
      outcome: 'noShow',
      clientCommandId: newCommandId(),
    });
    expect(released).toMatchObject({
      outcome: 'noShow',
      countsTowardNoShowThreshold: true,
      tableId: null,
      tableLabel: null,
      tableFreed: false,
    });
    const after = await staff.listBookingsWithoutTable('b1');
    expect(after?.map((booking) => booking.id)).not.toContain('res-t-gone');

    const undone = await staff.undoNoShow({
      reservationId: 'res-t-gone',
      clientCommandId: newCommandId(),
    });
    expect(undone).toEqual({
      reservationId: 'res-t-gone',
      status: 'confirmed',
      tableId: null,
      tableLabel: null,
    });
    const again = await staff.listBookingsWithoutTable('b1');
    expect(again?.map((booking) => booking.id)).toContain('res-t-gone');

    const cancelled = await staff.releaseReservation({
      reservationId: 'res-t-late',
      outcome: 'guestCancelled',
      clientCommandId: newCommandId(),
    });
    expect(cancelled.countsTowardNoShowThreshold).toBe(false);
  });

  it('seats one at the chosen table, which keeps its own next booking', async () => {
    const staff = createStaffMockGateway({ now, bookingsWithoutTable: SEEDS });
    const table = await freeTable(staff);

    const result = await staff.applyTableAction({
      kind: 'seatReservation',
      branchId: 'b1',
      tableId: table.tableId,
      clientCommandId: newCommandId(),
      reservationId: 'res-t-late',
      partySize: 6,
    });

    expect(result.toStatus).toBe('occupied');
    expect(result.reservationId).toBe('res-t-late');
    const listed = await staff.listBookingsWithoutTable('b1');
    expect(listed?.map((booking) => booking.id)).toEqual(['res-t-soon']);
    const after = (await staff.getFloor('b1'))!.details.find(
      (entry) => entry.tableId === table.tableId,
    );
    expect(after).toMatchObject({
      physicalStatus: 'occupied',
      partySize: 6,
      // Somebody else's booking later on: the waiter chose this table anyway.
      nextReservationId: table.nextReservationId,
    });
  });

  it('puts one made by time only on the list once the floor approves it', async () => {
    const staff = createStaffMockGateway({ now, seedBookingsWithoutTable: true });

    const waiting = await staff.listAwaitingApproval('b1');
    const request = waiting.find((entry) => entry.id === 'res-time-await');
    expect(request).toMatchObject({ tableId: null, tableLabel: null, bookedWithoutTable: true });
    expect(request?.currentSitting).toBeNull();

    const approved = await staff.approveReservation({ reservationId: 'res-time-await' });

    expect(approved).toMatchObject({ status: 'confirmed', tableLabel: null });
    const listed = await staff.listBookingsWithoutTable('b1');
    expect(listed?.some((booking) => booking.id === 'res-time-await')).toBe(true);
    expect(listed?.find((booking) => booking.id === 'res-time-await')?.note).toBe(
      'Ծխողների սրահում',
    );
  });
});
