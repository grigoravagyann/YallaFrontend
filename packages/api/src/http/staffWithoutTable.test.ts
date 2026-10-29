import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * Booking by time only on the floor, over HTTP (2026-10-29): the door's list
 * read off the branch's confirmed bookings, a waiter's refusal of that read
 * said as "may not list" rather than "none", and the seat at the table the
 * waiter chose.
 */

type Schemas = components['schemas'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';

/** A confirmed booking, as `ReservationView` writes it: one made by time only, nobody has seated. */
const TIME_ONLY: Schemas['Yalla.Application.Reservations.ReservationView'] = {
  id: '6f1d0a2e-0000-4000-8000-00000000000a',
  code: 'Y3150',
  status: 2,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  bookedWithoutTable: true,
  partySize: 4,
  startUtc: '2026-10-29T15:30:00Z',
  onMyWayOpensAtUtc: '2026-10-29T13:30:00Z',
  endUtc: '2026-10-29T17:30:00Z',
  localDate: '2026-10-29',
  localStartTime: '19:30:00',
  localEndTime: '21:30:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-29T13:30:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: '8b2e1b3c-0000-4000-8000-0000000000bb',
  guestName: 'Narek Grigoryan',
  guestPhone: '+37491223344',
  note: '  By the window, please ',
  guestConfirmedOnWayAtUtc: '2026-10-29T15:10:00Z',
  wasReplay: false,
  awaitsEarlierGuestAnswer: false,
  phoneUnverified: false,
};

/** A table booking on the same list: it is on its table's tile, not the door's. */
const AT_A_TABLE: Schemas['Yalla.Application.Reservations.ReservationView'] = {
  ...TIME_ONLY,
  id: '6f1d0a2e-0000-4000-8000-00000000000b',
  code: 'Y3151',
  bookedWithoutTable: false,
  tableId: '9c3d2e4f-0000-4000-8000-000000000007',
  tableLabel: '7',
  note: null,
  guestConfirmedOnWayAtUtc: null,
};

/** One made by time only and seated since: it has its table now. */
const SEATED_SINCE: Schemas['Yalla.Application.Reservations.ReservationView'] = {
  ...TIME_ONLY,
  id: '6f1d0a2e-0000-4000-8000-00000000000c',
  code: 'Y3152',
  tableId: '9c3d2e4f-0000-4000-8000-000000000004',
  tableLabel: '4',
};

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createStaffHttpGateway(backend.client()) };
}

describe('bookings without a table', () => {
  it("reads the branch's confirmed bookings and keeps those still on no table", async () => {
    const { gateway, backend } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations`]: {
        body: [TIME_ONLY, AT_A_TABLE, SEATED_SINCE],
      },
    });

    const listed = await gateway.listBookingsWithoutTable(BRANCH);

    expect(backend.requests[0]?.query.get('status')).toBe('2');
    expect(listed).toEqual([
      {
        id: TIME_ONLY.id,
        code: 'Y3150',
        guestName: 'Narek Grigoryan',
        guestPhone: '+37491223344',
        partySize: 4,
        startUtc: '2026-10-29T15:30:00Z',
        endUtc: '2026-10-29T17:30:00Z',
        localDate: '2026-10-29',
        localStartTime: '19:30:00',
        // The wish, trimmed: the one thing the guest could say about where they sit.
        note: 'By the window, please',
        phoneUnverified: false,
        guestRecord: null,
        guestConfirmedOnWayAtUtc: '2026-10-29T15:10:00Z',
        guestRunningLateMinutes: null,
      },
    ]);
  });

  it("answers null for a waiter's session, which may not read the list", async () => {
    const { gateway } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations`]: problemReply(403, 'forbidden'),
    });

    await expect(gateway.listBookingsWithoutTable(BRANCH)).resolves.toBeNull();
  });

  it('passes any other failure on: "could not read" is not "none"', async () => {
    const { gateway } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations`]: problemReply(500, 'internal-error'),
    });

    await expect(gateway.listBookingsWithoutTable(BRANCH)).rejects.toBeDefined();
  });

  it('seats one at the table the waiter chose, naming the booking', async () => {
    const table = '9c3d2e4f-0000-4000-8000-000000000009';
    const { gateway, backend } = gatewayOver({
      [`POST /api/branches/${BRANCH}/tables/${table}/seat-reservation`]: {
        body: {
          branchId: BRANCH,
          tableId: table,
          tableLabel: '9',
          fromStatus: 1,
          toStatus: 4,
          state: 4,
          reservationId: TIME_ONLY.id,
          atUtc: '2026-10-29T15:31:00Z',
          clientCommandId: '8b2e1b3c-0000-4000-8000-0000000000cc',
          wasReplay: false,
          warnings: [],
          affectedReservations: [],
        },
      },
    });

    const result = await gateway.applyTableAction({
      kind: 'seatReservation',
      branchId: BRANCH,
      tableId: table,
      clientCommandId: '8b2e1b3c-0000-4000-8000-0000000000cc',
      reservationId: TIME_ONLY.id,
      partySize: 4,
      precondition: { expectedFromStatus: 'free', rowVersion: null },
    });

    expect(backend.requests[0]?.body).toEqual({
      clientCommandId: '8b2e1b3c-0000-4000-8000-0000000000cc',
      queued: false,
      expectedFromStatus: 1,
      reservationId: TIME_ONLY.id,
      partySize: 4,
    });
    expect(result.tableLabel).toBe('9');
    expect(result.reservationId).toBe(TIME_ONLY.id);
  });
});

describe('a booking by time only waiting for the floor', () => {
  it('reads as one with no table, and says it was made without one', async () => {
    const { gateway } = gatewayOver({
      [`GET /api/branches/${BRANCH}/reservations/awaiting`]: {
        body: [
          {
            reservation: { ...TIME_ONLY, status: 1, approvalExpiresAtUtc: '2026-10-29T14:15:00Z' },
            approvalExpiresAtUtc: '2026-10-29T14:15:00Z',
            trigger: 4,
          },
        ],
      },
    });

    const [request] = await gateway.listAwaitingApproval(BRANCH);

    expect(request).toMatchObject({
      tableId: null,
      tableLabel: null,
      bookedWithoutTable: true,
      previousBooking: null,
      nextBooking: null,
      currentSitting: null,
    });
  });
});
