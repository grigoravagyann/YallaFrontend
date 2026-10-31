import { describe, expect, it } from 'vitest';
import {
  BookingRejectedError,
  LeadTimeExceededError,
  OnMyWayNotOpenError,
  TableTakenError,
} from '../contracts/errors';
import { timeFullGuestsLeft } from '../contracts/booking';
import { ValidationError } from '../errors';
import { newCommandId } from '../ids';
import { createStaffMockGateway } from './staffMock';

/**
 * Bookings taken by hand on the tablet's mock (2026-10-31): the day's times
 * with every in-service table, taking one at a table (which becomes the
 * table's next booking) or by time only (which joins the door's list), the
 * replay, the room's refusals, the call list thirty minutes before — mine
 * first — and recording the guest as coming.
 */

/** A Thursday at 15:00 in Yerevan (11:00Z). */
const START = new Date('2026-10-29T11:00:00Z');
const now = () => START;
const BRANCH = 'b1';

/** The branch's day for the mock's clock, and the day after. */
const TODAY = '2026-10-29';
const TOMORROW = '2026-10-30';

const guest = {
  guestName: 'Armine Sargsyan',
  guestPhone: '+37491778899',
  partySize: 4,
};

describe("the day's times for the sheet", () => {
  it('lists every quarter hour of the hours, with the free tables that seat the party', async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH });

    const day = await staff.getStaffDaySlots({ branchId: BRANCH, date: TOMORROW, partySize: 4 });

    expect(day).toMatchObject({
      branchId: BRANCH,
      date: TOMORROW,
      partySize: 4,
      bookingMode: 'chooseTable',
      unavailableReason: null,
    });
    expect(day.slots[0]?.time).toBe('09:00');
    expect(day.slots.at(-1)?.time).toBe('21:00');
    expect(day.slots.every((slot) => slot.isAvailable)).toBe(true);
    // Every table offered seats the party; a two-top never is.
    for (const slot of day.slots) {
      expect(slot.tables.length).toBeGreaterThan(0);
      expect(slot.tables.every((table) => table.seats >= 4)).toBe(true);
      expect(slot.guestsLeft).toBeNull();
    }
  });

  it('strikes the times gone today and keeps a booked table off the times its sitting covers', async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH });
    // The mock's late booking at table 6: twenty minutes ago, so its sitting
    // runs over the next hour and forty minutes.
    const floor = (await staff.getFloor(BRANCH))!;
    const late = floor.details.find((detail) => detail.tableId === 't6')!;
    expect(late.nextReservationStartUtc).toBe('2026-10-29T10:40:00.000Z');

    const day = await staff.getStaffDaySlots({ branchId: BRANCH, date: TODAY, partySize: 2 });

    const gone = day.slots.filter((slot) => Date.parse(slot.slotUtc) <= START.getTime());
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.every((slot) => !slot.isAvailable && slot.unavailableReason === 'pastLeadTime')).toBe(
      true,
    );
    const soon = day.slots.find((slot) => slot.time === '15:15')!;
    expect(soon.isAvailable).toBe(true);
    expect(soon.tables.some((table) => table.tableId === 't6')).toBe(false);
    // Two hours on, its sitting is over: the table is offered again.
    const later = day.slots.find((slot) => slot.time === '17:00')!;
    expect(later.tables.some((table) => table.tableId === 't6')).toBe(true);
  });

  it('answers in guests at a branch that books by time only', async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH, bookingMode: 'timeOnly' });

    const day = await staff.getStaffDaySlots({ branchId: BRANCH, date: TOMORROW, partySize: 6 });

    expect(day.bookingMode).toBe('timeOnly');
    expect(day.slots[0]).toMatchObject({ isAvailable: true, tables: [], guestsLeft: 20 });
  });

  it('refuses a bad day or party as the request binder would', async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH });
    await expect(
      staff.getStaffDaySlots({ branchId: BRANCH, date: '2026-13-45', partySize: 2 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      staff.getStaffDaySlots({ branchId: BRANCH, date: TOMORROW, partySize: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('taking a booking by hand', () => {
  it("takes one at a table: confirmed, the taker's, and the table's next booking", async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH, staffName: 'Ani Hakobyan' });
    const day = await staff.getStaffDaySlots({ branchId: BRANCH, date: TOMORROW, partySize: 4 });
    const slot = day.slots.find((candidate) => candidate.time === '20:00')!;
    const table = slot.tables[0]!;
    const clientCommandId = newCommandId();

    const booking = await staff.createStaffBooking({
      branchId: BRANCH,
      ...guest,
      date: TOMORROW,
      time: '20:00',
      tableId: table.tableId,
      note: '  Birthday cake ',
      clientCommandId,
    });

    expect(booking).toMatchObject({
      status: 'confirmed',
      channel: 'staff',
      guestName: 'Armine Sargsyan',
      guestPhone: '+37491778899',
      partySize: 4,
      localDate: TOMORROW,
      localStartTime: '20:00:00',
      tableId: table.tableId,
      tableLabel: table.label,
      bookedWithoutTable: false,
      note: 'Birthday cake',
      wasReplay: false,
      guestConfirmedOnWayAtUtc: null,
    });
    expect(booking.takenByName).toMatch(/^Ani Hakobyan/u);
    expect(booking.takenByStaffId).toMatch(/\S/u);
    expect(booking.code).toMatch(/^Y\d{4}$/u);

    // A second send answers the same booking.
    const again = await staff.createStaffBooking({
      branchId: BRANCH,
      ...guest,
      date: TOMORROW,
      time: '20:00',
      tableId: table.tableId,
      clientCommandId,
    });
    expect(again).toMatchObject({ id: booking.id, wasReplay: true });

    // The table's evening is taken at that time now, and the floor knows its next booking.
    const after = await staff.getStaffDaySlots({ branchId: BRANCH, date: TOMORROW, partySize: 4 });
    const same = after.slots.find((candidate) => candidate.time === '20:00')!;
    expect(same.tables.some((candidate) => candidate.tableId === table.tableId)).toBe(false);
    const detail = (await staff.getFloor(BRANCH))!.details.find(
      (entry) => entry.tableId === table.tableId,
    );
    expect(detail?.nextReservationId).toBe(booking.id);
  });

  it('takes one by time only: on the door’s list, with the taker named', async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH, bookingMode: 'timeOnly' });

    const booking = await staff.createStaffBooking({
      branchId: BRANCH,
      ...guest,
      date: TOMORROW,
      time: '19:00',
      tableId: null,
      clientCommandId: newCommandId(),
    });

    expect(booking).toMatchObject({ bookedWithoutTable: true, tableId: null, channel: 'staff' });
    // Tomorrow is beyond the door's three hours, but the list itself has it.
    const listed = await staff.listBookingsWithoutTable(BRANCH);
    expect(listed.find((row) => row.id === booking.id)).toMatchObject({
      channel: 'staff',
      takenByName: booking.takenByName,
      partySize: 4,
    });

    // The room takes twenty at once: a party that does not fit is refused with what is left.
    for (let index = 0; index < 4; index += 1) {
      await staff.createStaffBooking({
        branchId: BRANCH,
        ...guest,
        guestName: `Guest ${index}`,
        date: TOMORROW,
        time: '19:00',
        tableId: null,
        clientCommandId: newCommandId(),
      });
    }
    const full = await staff
      .createStaffBooking({
        branchId: BRANCH,
        ...guest,
        partySize: 2,
        date: TOMORROW,
        time: '19:30',
        tableId: null,
        clientCommandId: newCommandId(),
      })
      .catch((error: unknown) => error);
    expect(timeFullGuestsLeft(full)).toBe(0);
  });

  it("refuses what the room refuses: the past, closed, no table, a taken table, too small", async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH });
    const day = await staff.getStaffDaySlots({ branchId: BRANCH, date: TOMORROW, partySize: 4 });
    const table = day.slots.find((slot) => slot.time === '20:00')!.tables[0]!;
    const base = { branchId: BRANCH, ...guest, date: TOMORROW, time: '20:00', tableId: table.tableId };
    const refusal = (command: Parameters<typeof staff.createStaffBooking>[0]) =>
      staff.createStaffBooking(command).catch((error: unknown) => error);

    expect(
      await refusal({ ...base, date: TODAY, time: '12:00', clientCommandId: newCommandId() }),
    ).toBeInstanceOf(LeadTimeExceededError);
    const closed = await refusal({ ...base, time: '23:30', clientCommandId: newCommandId() });
    expect((closed as BookingRejectedError).reason).toBe('closed');
    expect(await refusal({ ...base, tableId: null, clientCommandId: newCommandId() })).toBeInstanceOf(
      ValidationError,
    );
    expect(
      await refusal({ ...base, guestPhone: '  ', clientCommandId: newCommandId() }),
    ).toBeInstanceOf(ValidationError);

    await staff.createStaffBooking({ ...base, clientCommandId: newCommandId() });
    const taken = await refusal({ ...base, time: '21:00', clientCommandId: newCommandId() });
    expect(taken).toBeInstanceOf(TableTakenError);
    expect((taken as TableTakenError).reason).toBe('alreadyBooked');

    const twoTop = day.slots[0]!.tables.find((candidate) => candidate.seats < 10);
    const small = await refusal({
      ...base,
      partySize: 10,
      tableId: twoTop!.tableId,
      time: '12:00',
      clientCommandId: newCommandId(),
    });
    expect((small as BookingRejectedError).reason).toBe('tooSmall');
  });
});

describe('whom to call, and the guest coming', () => {
  const seeds = [
    // Mine, in twenty minutes: on the list, first.
    { id: 'sb-mine', guestName: 'Armine', guestPhone: '+37491778899', partySize: 4, startsInMinutes: 20, tableId: 't3' },
    // The manager's, in ten: on the list, after mine.
    {
      id: 'sb-theirs',
      guestName: 'Hovhannes',
      guestPhone: '+37494112233',
      partySize: 2,
      startsInMinutes: 10,
      tableId: null,
      takenBy: { id: 'b1-manager', name: 'Nare Petrosyan' },
    },
    // Too far ahead for the list.
    { id: 'sb-later', guestName: 'Gor', guestPhone: '+37477000000', partySize: 2, startsInMinutes: 90, tableId: 't4' },
    // Already said coming: nothing to call about.
    { id: 'sb-coming', guestName: 'Lilit', guestPhone: '+37493000000', partySize: 2, startsInMinutes: 15, tableId: 't5', comingMinutesAgo: 2 },
  ];

  it('lists the staff bookings in their window, nobody has recorded as coming, mine first', async () => {
    const staff = createStaffMockGateway({
      now,
      branchId: BRANCH,
      staffName: 'Ani Hakobyan',
      staffBookingSeeds: seeds,
    });

    const rows = await staff.listBookingsToCall(BRANCH);

    expect(rows.map((row) => row.reservationId)).toEqual(['sb-mine', 'sb-theirs']);
    expect(rows[0]).toMatchObject({
      guestName: 'Armine',
      guestPhone: '+37491778899',
      partySize: 4,
      tableId: 't3',
      isMine: true,
      localStartTime: '15:20:00',
    });
    expect(rows[0]?.takenByName).toMatch(/^Ani Hakobyan/u);
    expect(rows[1]).toMatchObject({
      isMine: false,
      takenByName: 'Nare Petrosyan',
      tableId: null,
      tableLabel: null,
    });
  });

  it('records the guest coming, which takes the row off the list and shows on the floor; a replay says so', async () => {
    const staff = createStaffMockGateway({ now, branchId: BRANCH, staffBookingSeeds: seeds });
    const clientCommandId = newCommandId();

    const booking = await staff.markGuestComing({ reservationId: 'sb-mine', clientCommandId });

    expect(booking.guestConfirmedOnWayAtUtc).toBe(START.toISOString());
    expect(booking.wasReplay).toBe(false);
    expect((await staff.listBookingsToCall(BRANCH)).map((row) => row.reservationId)).toEqual([
      'sb-theirs',
    ]);
    const detail = (await staff.getFloor(BRANCH))!.details.find((entry) => entry.tableId === 't3');
    expect(detail?.nextReservationGuestConfirmedOnWayAtUtc).toBe(START.toISOString());
    expect(
      (await staff.markGuestComing({ reservationId: 'sb-mine', clientCommandId })).wasReplay,
    ).toBe(true);

    // Without a table too: the door's card says on the way.
    await staff.markGuestComing({ reservationId: 'sb-theirs', clientCommandId: newCommandId() });
    const door = await staff.listBookingsWithoutTable(BRANCH);
    expect(door.find((row) => row.id === 'sb-theirs')?.guestConfirmedOnWayAtUtc).toBe(
      START.toISOString(),
    );
  });

  it('refuses "coming" before the start less two hours, and once the booking was let go', async () => {
    const staff = createStaffMockGateway({
      now,
      branchId: BRANCH,
      staffBookingSeeds: [
        ...seeds,
        { id: 'sb-far', guestName: 'Far', guestPhone: '+37477111111', partySize: 2, startsInMinutes: 180, tableId: 't6' },
      ],
    });

    await expect(
      staff.markGuestComing({ reservationId: 'sb-far', clientCommandId: newCommandId() }),
    ).rejects.toBeInstanceOf(OnMyWayNotOpenError);

    // "Not coming" is the ordinary release, the guest having told us.
    const released = await staff.releaseReservation({
      reservationId: 'sb-theirs',
      outcome: 'guestCancelled',
      clientCommandId: newCommandId(),
    });
    expect(released.countsTowardNoShowThreshold).toBe(false);
    expect((await staff.listBookingsToCall(BRANCH)).map((row) => row.reservationId)).toEqual([
      'sb-mine',
    ]);
    await expect(
      staff.markGuestComing({ reservationId: 'sb-theirs', clientCommandId: newCommandId() }),
    ).rejects.toBeInstanceOf(OnMyWayNotOpenError);
  });
});
