import { describe, expect, it } from 'vitest';
import type { CreateBookingCommand } from '../contracts/booking';
import type { YallaGateway } from '../gateway';
import type { components } from '../generated/schema';
import { createMockGateway } from '../mocks/mockGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

type Schemas = components['schemas'];
type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];
type AvailabilityWire = Schemas['Yalla.Application.Reservations.BranchAvailability'];

/**
 * Booking against the real reservation routes.
 *
 * All four booking methods used to be answered by the in-memory mock even with
 * the real data source on: a real branch id reached `mockGateway.createBooking`,
 * which threw "Unknown branch", so every attempt said "Nothing was booked", and
 * "My bookings" read the mock's empty map. These fail against that code at the
 * first request, because no request was ever made.
 */

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';

const VIEW: ReservationViewWire = {
  id: '6f1d0a2e-0000-4000-8000-00000000000a',
  code: '482913',
  status: 2,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  tableId: 'tbl-7',
  tableLabel: '7',
  partySize: 2,
  startUtc: '2026-09-20T15:30:00Z',
  endUtc: '2026-09-20T17:00:00Z',
  localDate: '2026-09-20',
  localStartTime: '19:30:00',
  localEndTime: '21:00:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-09-20T13:30:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: 'cmd-1',
  guestName: 'Ani',
  guestPhone: '+37477123456',
  wasReplay: false,
  manageToken: 'mt-1',
};

const COMMAND: CreateBookingCommand = {
  commandId: 'cmd-1',
  branchId: BRANCH,
  tableId: 'tbl-7',
  slotUtc: '2026-09-20T15:30:00.000Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 2,
  guestName: 'Ani',
  guestPhone: '+37477123456',
  channel: 'app',
};

/** A fallback that fails loudly, so a method still served by it cannot pass. */
function failingFallback(): YallaGateway {
  const mock = createMockGateway();
  const refuse = (name: string) => () => {
    throw new Error(`${name} was answered by the mock fallback`);
  };
  return {
    ...mock,
    createBooking: refuse('createBooking'),
    listBookings: refuse('listBookings'),
    getBooking: refuse('getBooking'),
    cancelBooking: refuse('cancelBooking'),
  };
}

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const gateway = createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
    fallback: failingFallback(),
  });
  return { gateway, backend };
}

function availabilityFor(tableId: string): AvailabilityWire {
  return {
    asOfUtc: '2026-09-20T15:00:00Z',
    branchId: BRANCH,
    branchName: 'Northern Avenue',
    bufferMinutes: 15,
    cancellationDeadlineMinutes: 120,
    floorWidth: 800,
    floorHeight: 600,
    localDate: '2026-09-20',
    localTime: '19:30',
    partySize: 2,
    requestedStartUtc: '2026-09-20T15:30:00Z',
    requestedEndUtc: '2026-09-20T17:00:00Z',
    timeZoneId: 'Asia/Yerevan',
    turnTimeMinutes: 90,
    tables: [
      {
        tableId,
        label: '7',
        seats: 4,
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        rotationDegrees: 0,
        shape: 1,
        floorAreaDisplayOrder: 1,
        isBookable: true,
        isAvailable: false,
        requiresApproval: false,
        physicalStatus: 4,
        state: 4,
        unavailableReason: 10,
      },
    ],
  };
}

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

describe('creating a booking', () => {
  it("posts the branch's wall-clock date and time, the guest and the channel, and maps the view", async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations': { status: 201, body: VIEW },
    });

    const booking = await gateway.createBooking(COMMAND);

    expect(backend.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/reservations',
    ]);
    expect(backend.requests[0]?.body).toEqual({
      branchId: BRANCH,
      tableId: 'tbl-7',
      // 15:30 UTC is 19:30 in Yerevan: the server takes branch-local time.
      date: '2026-09-20',
      time: '19:30',
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+37477123456',
      clientCommandId: 'cmd-1',
      channel: 1,
    });
    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer diner-token');

    expect(booking).toEqual({
      id: VIEW.id,
      code: '482913',
      status: 'confirmed',
      venueName: null,
      branchId: BRANCH,
      branchName: 'Northern Avenue',
      timeZoneId: 'Asia/Yerevan',
      tableId: 'tbl-7',
      tableLabel: '7',
      partySize: 2,
      slotUtc: '2026-09-20T15:30:00Z',
      endUtc: '2026-09-20T17:00:00Z',
      // The server's own deadline, not the slot start.
      freeCancellationUntilUtc: '2026-09-20T13:30:00Z',
      cancelledAtUtc: null,
      cancelledAfterDeadline: false,
      manageToken: 'mt-1',
    });
  });

  it('sends channel 2 from the public web page', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations': { status: 201, body: VIEW },
    });
    await gateway.createBooking({ ...COMMAND, channel: 'web' });
    expect((backend.requests[0]?.body as { channel: number }).channel).toBe(2);
  });

  it('names the venue when the browse list has been read', async () => {
    const { gateway } = gatewayOver({
      'GET /api/public/venues': {
        body: [
          {
            venueSlug: 'lumen-coffee',
            name: 'Lumen Coffee',
            type: 1,
            branches: [
              {
                branchId: BRANCH,
                branchSlug: 'northern-avenue',
                name: 'Northern Avenue',
                address: 'Northern Avenue 5',
                freeTableCount: 3,
                isOpenNow: true,
                timeZoneId: 'Asia/Yerevan',
              },
            ],
          },
        ],
      },
      'POST /api/reservations': { status: 201, body: VIEW },
    });
    await gateway.listVenues();
    await expect(gateway.createBooking(COMMAND)).resolves.toMatchObject({
      venueName: 'Lumen Coffee',
    });
  });

  it('reads somebody sitting there now as its own refusal, with the room from the 409', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations': problemReply(409, 'table-currently-occupied', {
        reason: 10,
        tableId: 'tbl-7',
        tableLabel: '7',
        availability: availabilityFor('tbl-7'),
      }),
    });

    const error = await caught(gateway.createBooking(COMMAND));

    expect(error.name).toBe('TableTakenError');
    expect(error['reason']).toBe('occupied');
    expect(error['tableLabel']).toBe('7');
    expect((error['floor'] as { tables: { id: string }[] }).tables.map((t) => t.id)).toEqual([
      'tbl-7',
    ]);
  });

  it('keeps "already booked for that slot" apart from "occupied now"', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations': problemReply(409, 'table-already-booked', {
        reason: 8,
        tableId: 'tbl-7',
        tableLabel: '7',
      }),
    });

    const error = await caught(gateway.createBooking(COMMAND));

    expect(error.name).toBe('TableTakenError');
    expect(error['reason']).toBe('alreadyBooked');
    expect(error['floor']).toBeNull();
  });

  it('turns a lead-time refusal into the earliest time that still works', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations': problemReply(422, 'reservation-lead-time-too-short', {
        requestedStartUtc: '2026-09-20T15:30:00Z',
        earliestStartUtc: '2026-09-20T16:00:00Z',
        minLeadMinutes: 30,
      }),
    });

    const error = await caught(gateway.createBooking(COMMAND));

    expect(error.name).toBe('LeadTimeExceededError');
    expect(error['earliestSlotUtc']).toBe('2026-09-20T16:00:00Z');
    expect(error['leadTimeMinutes']).toBe(30);
  });

  it('names every other reservation refusal by its own reason', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations': problemReply(422, 'reservation-outside-opening-hours', {}),
    });

    const error = await caught(gateway.createBooking(COMMAND));

    expect(error.name).toBe('BookingRejectedError');
    expect(error['reason']).toBe('closed');
  });

  it('says a lock timeout is busy and retryable, not that nothing was booked', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations': problemReply(503, 'reservation-lock-timeout', {
        retryable: true,
      }),
    });

    expect((await caught(gateway.createBooking(COMMAND))).name).toBe('BookingBusyError');
  });

  it('gives a taken command id and a shut branch their own errors', async () => {
    const taken = gatewayOver({
      'POST /api/reservations': problemReply(409, 'client-command-id-in-use'),
    });
    const shut = gatewayOver({
      'POST /api/reservations': problemReply(409, 'branch-unavailable', { branchId: BRANCH }),
    });

    expect((await caught(taken.gateway.createBooking(COMMAND))).name).toBe(
      'BookingCommandInUseError',
    );
    expect((await caught(shut.gateway.createBooking(COMMAND))).name).toBe('BranchUnavailableError');
  });
});

describe('my bookings', () => {
  const seatedLate: ReservationViewWire = { ...VIEW, id: 'r-seated', status: 4 };
  const cancelled: ReservationViewWire = {
    ...VIEW,
    id: 'r-cancelled',
    status: 7,
    cancelledAtUtc: '2026-09-19T10:00:00Z',
  };

  it("uses the server's upcoming and past exactly as returned", async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/reservations/mine': { body: { upcoming: [VIEW, seatedLate], past: [cancelled] } },
    });

    const mine = await gateway.listBookings();

    expect(backend.requests.map((r) => r.path)).toEqual(['/api/reservations/mine']);
    // A seated booking is still upcoming until it ends: the server's rule.
    expect(mine.upcoming.map((b) => [b.id, b.status])).toEqual([
      [VIEW.id, 'confirmed'],
      ['r-seated', 'seated'],
    ]);
    // The two cancellations stay apart: the diner cares which side it was.
    expect(mine.past.map((b) => [b.id, b.status])).toEqual([['r-cancelled', 'cancelledByVenue']]);
  });

  it('finds one booking in /mine, and null for one that is not there', async () => {
    const { gateway } = gatewayOver({
      'GET /api/reservations/mine': { body: { upcoming: [VIEW], past: [] } },
    });

    await expect(gateway.getBooking(VIEW.id)).resolves.toMatchObject({ code: '482913' });
    await expect(gateway.getBooking('nobody')).resolves.toBeNull();
  });

  it('cancels through the real route', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST /api/reservations/${VIEW.id}/cancel`]: {
        body: { ...VIEW, status: 6, cancelledAtUtc: '2026-09-20T12:00:00Z' },
      },
    });

    const booking = await gateway.cancelBooking(VIEW.id);

    expect(backend.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /api/reservations/${VIEW.id}/cancel`,
    ]);
    expect(booking.status).toBe('cancelledByDiner');
  });
});

describe('keep my table', () => {
  const route = `POST /api/reservations/${VIEW.id}/extend-hold`;

  it('gives each refusal its own error instead of inferring one from the status', async () => {
    for (const [code, name] of [
      ['hold-not-active', 'HoldNotActiveError'],
      ['extensions-not-offered', 'ExtensionsNotOfferedError'],
      ['hold-already-extended', 'HoldAlreadyExtendedError'],
    ] as const) {
      const { gateway } = gatewayOver({
        [route]: problemReply(409, code, { reservationId: VIEW.id, startUtc: VIEW.startUtc }),
      });
      const error = await caught(
        gateway.extendReservationHold({ reservationId: VIEW.id, clientCommandId: 'c' }),
      );
      expect(error.name, code).toBe(name);
    }
  });

  it('does not tell a diner they already extended when the conflict was something else', async () => {
    const { gateway } = gatewayOver({
      [route]: problemReply(409, 'conflicting-state'),
    });
    const error = await caught(
      gateway.extendReservationHold({ reservationId: VIEW.id, clientCommandId: 'c' }),
    );
    expect(error.name).not.toBe('HoldAlreadyExtendedError');
  });
});
