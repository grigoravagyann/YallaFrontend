import { describe, expect, it } from 'vitest';
import { BookingRejectedError, OnMyWayNotOpenError, TableTakenError } from '../contracts/errors';
import { ValidationError } from '../errors';
import type { components } from '../generated/schema';
import { fakeBackend, offSchema, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import type { WireBookingToCall, WireStaffDaySlots } from './staffBookingsMapping';

/**
 * Bookings taken by hand, over HTTP (2026-10-31): the day's times with the
 * staff rules, taking one and its replay, the ordinary refusals as the sheet
 * reads them, the call list, and "the guest is coming".
 *
 * Every route is on the backend's `feat/staff-bookings` and ahead of
 * `generated/swagger.json`, so each stub is excused from the schema check
 * until `api:generate` has run against that branch.
 */

type Schemas = components['schemas'];

const AHEAD = 'the route is ahead of generated/swagger.json (Yalla feat/staff-bookings)';

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const TABLE = '9c3d2e4f-0000-4000-8000-000000000007';
const COMMAND = '8b2e1b3c-0000-4000-8000-0000000000aa';

/** The booking as `ReservationView` answers it, with the branch's three members. */
const TAKEN: Schemas['Yalla.Application.Reservations.ReservationView'] & {
  channel: number;
  takenByStaffId: string;
  takenByName: string;
} = {
  id: '6f1d0a2e-0000-4000-8000-00000000000a',
  code: 'Y4101',
  status: 2,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  bookedWithoutTable: false,
  tableId: TABLE,
  tableLabel: '7',
  partySize: 4,
  startUtc: '2026-10-31T16:00:00Z',
  onMyWayOpensAtUtc: '2026-10-31T14:00:00Z',
  endUtc: '2026-10-31T18:00:00Z',
  localDate: '2026-10-31',
  localStartTime: '20:00:00',
  localEndTime: '22:00:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-31T14:00:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: COMMAND,
  guestName: 'Armine Sargsyan',
  guestPhone: '+37491778899',
  note: '  Birthday cake ',
  wasReplay: false,
  awaitsEarlierGuestAnswer: false,
  phoneUnverified: false,
  channel: 3,
  takenByStaffId: 's-ani',
  takenByName: 'Ani Hakobyan',
};

const DAY: WireStaffDaySlots = {
  branchId: BRANCH,
  date: '2026-10-31',
  partySize: 4,
  bookingMode: 1,
  stepMinutes: 15,
  slots: [
    {
      time: '20:15:00',
      startUtc: '2026-10-31T16:15:00Z',
      isAvailable: false,
      unavailableReason: 8,
      tables: [],
    },
    {
      time: '20:00',
      startUtc: '2026-10-31T16:00:00Z',
      isAvailable: true,
      tables: [
        { tableId: TABLE, label: '7', seats: 4, roomName: 'Hall' },
        { tableId: '9c3d2e4f-0000-4000-8000-000000000009', label: '9', seats: 6 },
      ],
    },
  ],
};

const TO_CALL: WireBookingToCall = {
  reservationId: TAKEN.id,
  code: 'Y4101',
  guestName: 'Armine Sargsyan',
  guestPhone: '+37491778899',
  partySize: 4,
  startUtc: '2026-10-31T16:00:00Z',
  localDate: '2026-10-31',
  localStartTime: '20:00:00',
  tableId: TABLE,
  tableLabel: '7',
  note: null,
  takenByStaffId: 's-ani',
  takenByName: 'Ani Hakobyan',
  isMine: true,
};

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createStaffHttpGateway(backend.client()) };
}

describe("the day's times for the sheet", () => {
  it('asks by day and party, and reads the times earliest first with their tables', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations/slots`]: offSchema({ body: DAY }, AHEAD),
    });

    const day = await gateway.getStaffDaySlots({
      branchId: BRANCH,
      date: '2026-10-31',
      partySize: 4,
    });

    expect(backend.requests[0]?.query.get('date')).toBe('2026-10-31');
    expect(backend.requests[0]?.query.get('party')).toBe('4');
    expect(day).toMatchObject({
      branchId: BRANCH,
      date: '2026-10-31',
      partySize: 4,
      bookingMode: 'chooseTable',
      stepMinutes: 15,
      unavailableReason: null,
    });
    expect(day.slots.map((slot) => slot.time)).toEqual(['20:00', '20:15']);
    expect(day.slots[0]).toEqual({
      time: '20:00',
      slotUtc: '2026-10-31T16:00:00Z',
      isAvailable: true,
      unavailableReason: null,
      tables: [
        { tableId: TABLE, label: '7', seats: 4, roomName: 'Hall' },
        { tableId: '9c3d2e4f-0000-4000-8000-000000000009', label: '9', seats: 6, roomName: null },
      ],
      guestsLeft: null,
    });
    // Struck: booked out, in the room's words.
    expect(day.slots[1]).toMatchObject({ isAvailable: false, unavailableReason: 'alreadyBooked' });
  });

  it('reads a time-only branch in guests, and a refused day as nothing on offer', async () => {
    const { gateway } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations/slots`]: offSchema(
        {
          body: {
            ...DAY,
            bookingMode: 2,
            slots: [{ ...DAY.slots![1]!, tables: undefined, guestsLeft: 12 }],
          },
        },
        AHEAD,
      ),
    });
    const day = await gateway.getStaffDaySlots({
      branchId: BRANCH,
      date: '2026-10-31',
      partySize: 4,
    });
    expect(day.bookingMode).toBe('timeOnly');
    expect(day.slots[0]).toMatchObject({ isAvailable: true, tables: [], guestsLeft: 12 });

    const { gateway: shut } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations/slots`]: offSchema(
        { body: { ...DAY, unavailableReason: 3, slots: [] } },
        AHEAD,
      ),
    });
    const closed = await shut.getStaffDaySlots({
      branchId: BRANCH,
      date: '2026-10-31',
      partySize: 4,
    });
    expect(closed.unavailableReason).toBe('closed');
    expect(closed.slots).toEqual([]);
  });
});

describe('taking a booking by hand', () => {
  const command = {
    branchId: BRANCH,
    guestName: ' Armine Sargsyan ',
    guestPhone: '+374 91 77 88 99',
    partySize: 4,
    date: '2026-10-31',
    time: '20:00',
    tableId: TABLE,
    note: '  Birthday cake ',
    clientCommandId: COMMAND,
  };

  it('sends the request as the route takes it and reads the booking back, taker and all', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST /api/branches/${BRANCH}/reservations/staff`]: offSchema(
        { status: 201, body: TAKEN },
        AHEAD,
      ),
    });

    const booking = await gateway.createStaffBooking(command);

    expect(backend.requests[0]?.body).toEqual({
      guestName: 'Armine Sargsyan',
      guestPhone: '+37491778899',
      partySize: 4,
      date: '2026-10-31',
      time: '20:00',
      tableId: TABLE,
      note: 'Birthday cake',
      clientCommandId: COMMAND,
    });
    expect(booking).toEqual({
      id: TAKEN.id,
      code: 'Y4101',
      status: 'confirmed',
      guestName: 'Armine Sargsyan',
      guestPhone: '+37491778899',
      partySize: 4,
      startUtc: '2026-10-31T16:00:00Z',
      endUtc: '2026-10-31T18:00:00Z',
      localDate: '2026-10-31',
      localStartTime: '20:00:00',
      tableId: TABLE,
      tableLabel: '7',
      bookedWithoutTable: false,
      note: 'Birthday cake',
      channel: 'staff',
      takenByStaffId: 's-ani',
      takenByName: 'Ani Hakobyan',
      guestConfirmedOnWayAtUtc: null,
      wasReplay: false,
    });
  });

  it('sends a blank note as null and no table as null, and reads a replay as one', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST /api/branches/${BRANCH}/reservations/staff`]: offSchema(
        {
          status: 200,
          body: {
            ...TAKEN,
            tableId: undefined,
            tableLabel: undefined,
            bookedWithoutTable: true,
            note: null,
            wasReplay: true,
          },
        },
        AHEAD,
      ),
    });

    const booking = await gateway.createStaffBooking({ ...command, tableId: null, note: '   ' });

    expect(backend.requests[0]?.body).toMatchObject({ tableId: null, note: null });
    expect(booking).toMatchObject({
      tableId: null,
      tableLabel: null,
      bookedWithoutTable: true,
      note: null,
      wasReplay: true,
    });
  });

  it("reads the room's refusals as the sheet's errors: a taken table, closed, too small", async () => {
    const taken = gatewayOver({
      [`POST /api/branches/${BRANCH}/reservations/staff`]: offSchema(
        problemReply(409, 'table-already-booked', { tableId: TABLE, tableLabel: '7' }),
        AHEAD,
      ),
    });
    const refusal = await taken.gateway
      .createStaffBooking(command)
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(TableTakenError);
    expect((refusal as TableTakenError).reason).toBe('alreadyBooked');
    expect((refusal as TableTakenError).tableLabel).toBe('7');

    const closed = gatewayOver({
      [`POST /api/branches/${BRANCH}/reservations/staff`]: offSchema(
        problemReply(422, 'reservation-outside-opening-hours'),
        AHEAD,
      ),
    });
    const shut = await closed.gateway.createStaffBooking(command).catch((error: unknown) => error);
    expect(shut).toBeInstanceOf(BookingRejectedError);
    expect((shut as BookingRejectedError).reason).toBe('closed');

    const small = gatewayOver({
      [`POST /api/branches/${BRANCH}/reservations/staff`]: offSchema(
        problemReply(422, 'reservation-party-exceeds-capacity'),
        AHEAD,
      ),
    });
    const tooSmall = await small.gateway
      .createStaffBooking(command)
      .catch((error: unknown) => error);
    expect((tooSmall as BookingRejectedError).reason).toBe('tooSmall');

    const blank = gatewayOver({
      [`POST /api/branches/${BRANCH}/reservations/staff`]: offSchema(
        problemReply(422, 'validation-failed', { field: 'guestPhone' }),
        AHEAD,
      ),
    });
    const missing = await blank.gateway
      .createStaffBooking(command)
      .catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(ValidationError);
    expect((missing as ValidationError).field).toBe('guestPhone');
  });
});

describe('whom to call, and the guest coming', () => {
  it("reads the call list as the floor's own route answers it", async () => {
    const { gateway, backend } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations/to-call`]: offSchema(
        {
          body: [
            TO_CALL,
            {
              ...TO_CALL,
              reservationId: 'other',
              isMine: false,
              takenByName: 'Nare Petrosyan',
              note: ' quiet corner ',
            },
          ],
        },
        AHEAD,
      ),
    });

    const rows = await gateway.listBookingsToCall(BRANCH);

    expect(backend.requests[0]?.path).toBe(`/api/branches/${BRANCH}/reservations/to-call`);
    expect(rows[0]).toEqual({
      reservationId: TAKEN.id,
      code: 'Y4101',
      guestName: 'Armine Sargsyan',
      guestPhone: '+37491778899',
      partySize: 4,
      startUtc: '2026-10-31T16:00:00Z',
      localDate: '2026-10-31',
      localStartTime: '20:00:00',
      tableId: TABLE,
      tableLabel: '7',
      note: null,
      takenByStaffId: 's-ani',
      takenByName: 'Ani Hakobyan',
      isMine: true,
    });
    expect(rows[1]).toMatchObject({
      isMine: false,
      takenByName: 'Nare Petrosyan',
      note: 'quiet corner',
    });
  });

  it('records the guest coming under the command id and reads the booking back with the time', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST /api/reservations/${TAKEN.id}/guest-coming`]: offSchema(
        { body: { ...TAKEN, guestConfirmedOnWayAtUtc: '2026-10-31T15:35:00Z' } },
        AHEAD,
      ),
    });

    const booking = await gateway.markGuestComing({
      reservationId: TAKEN.id,
      clientCommandId: '8b2e1b3c-0000-4000-8000-0000000000cc',
    });

    expect(backend.requests[0]?.body).toEqual({
      clientCommandId: '8b2e1b3c-0000-4000-8000-0000000000cc',
    });
    expect(booking.guestConfirmedOnWayAtUtc).toBe('2026-10-31T15:35:00Z');
    expect(booking.channel).toBe('staff');
  });

  it("reads 'not open' as the guest's own refusal: too early, or over", async () => {
    const { gateway } = gatewayOver({
      [`POST /api/reservations/${TAKEN.id}/guest-coming`]: offSchema(
        problemReply(409, 'on-my-way-not-open', {
          reservationId: TAKEN.id,
          status: 2,
          opensAtUtc: '2026-10-31T14:00:00Z',
        }),
        AHEAD,
      ),
    });

    const refusal = await gateway
      .markGuestComing({ reservationId: TAKEN.id, clientCommandId: COMMAND })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(OnMyWayNotOpenError);
    expect((refusal as OnMyWayNotOpenError).opensAtUtc).toBe('2026-10-31T14:00:00Z');
  });
});
