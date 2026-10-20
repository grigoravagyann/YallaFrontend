import { describe, expect, it, vi } from 'vitest';
import { FreeByRequiredError, TableRequestClosedError } from '../contracts/errors';
import type { components } from '../generated/schema';
import { approvalTrigger, declineReason } from './approvalMapping';
import { awaitingApprovalFromWire, type WireAwaitingApproval } from './awaitingApprovalMapping';
import { booking } from './dinerMapping';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import { availabilityFromResponse, daySlotsFromWire, type WireDaySlots } from './mapping';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';
import { staffFloorDetails } from './staffMapping';

/**
 * The booking-times wire — must-free-by, requestable tables and times, the
 * promise on a booking, the earlier guest's request and its answer — read the
 * same way on every surface.
 *
 * Every field is ahead of `generated/schema.ts` (the backend writes it in the
 * same change), so each mapper is pinned twice: with the field, and from a
 * server that does not send it yet, which must read as "nothing cut short,
 * nothing to ask", never as a failure.
 */

type Schemas = components['schemas'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const RESERVATION = '6f1d0a2e-0000-4000-8000-00000000000a';
const REQUEST = '7a2e1b3c-0000-4000-8000-0000000000aa';

const VIEW: Schemas['Yalla.Application.Reservations.ReservationView'] = {
  id: RESERVATION,
  code: 'Y3107',
  status: 2,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  tableId: 'tbl-7',
  tableLabel: '7',
  partySize: 2,
  startUtc: '2026-10-20T14:00:00Z',
  endUtc: '2026-10-20T15:40:00Z',
  localDate: '2026-10-20',
  localStartTime: '18:00:00',
  localEndTime: '19:40:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-20T12:00:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: 'cmd-1',
  guestName: 'Lilit',
  guestPhone: '+37493217788',
  wasReplay: false,
  awaitsEarlierGuestAnswer: false,
  phoneUnverified: false,
};

describe('the enums', () => {
  it('reads EarlierGuestConsent, and the two earlier-guest declines', () => {
    expect(approvalTrigger(5)).toBe('earlierGuestConsent');
    expect(declineReason(3)).toBe('earlierGuestDeclined');
    expect(declineReason(4)).toBe('earlierGuestNoAnswer');
    // A value a newer server adds is still not a guess.
    expect(approvalTrigger(9)).toBe('unknown');
  });
});

describe('a day of slots', () => {
  const day = (slots: unknown[], stepMinutes?: number): WireDaySlots =>
    ({
      branchId: BRANCH,
      date: '2026-10-20',
      partySize: 2,
      ...(stepMinutes === undefined ? {} : { stepMinutes }),
      slots,
    }) as unknown as WireDaySlots;

  it('carries a requestable time and a must-free-by time', () => {
    const mapped = daySlotsFromWire(
      day(
        [
          {
            time: '21:30',
            startUtc: '2026-10-20T17:30:00Z',
            isAvailable: true,
            requiresApproval: true,
            freeTableCount: 0,
            isRequestable: true,
            requestableTableCount: 3,
            mustFreeByUtc: null,
          },
          {
            time: '19:00',
            startUtc: '2026-10-20T15:00:00Z',
            isAvailable: true,
            requiresApproval: false,
            freeTableCount: 1,
            isRequestable: false,
            requestableTableCount: 0,
            mustFreeByUtc: '2026-10-20T15:55:00Z',
            mustFreeByLocal: '19:55',
          },
        ],
        15,
      ),
    );

    expect(mapped.stepMinutes).toBe(15);
    expect(
      mapped.slots.map((slot) => [
        slot.time,
        slot.requestable,
        slot.requestableTableCount,
        slot.mustFreeByUtc,
      ]),
    ).toEqual([
      ['19:00', false, 0, '2026-10-20T15:55:00Z'],
      ['21:30', true, 3, null],
    ]);
  });

  it('reads an older answer as nothing requestable, nothing cut short, every 15 minutes', () => {
    const mapped = daySlotsFromWire(
      day([
        {
          time: '19:00',
          startUtc: '2026-10-20T15:00:00Z',
          isAvailable: true,
          requiresApproval: false,
          freeTableCount: 1,
        },
      ]),
    );
    expect(mapped.stepMinutes).toBe(15);
    expect(mapped.slots[0]).toMatchObject({ requestable: false, mustFreeByUtc: null });
  });

  it('keeps a requestable time a server marks unavailable on offer, as requestable', () => {
    const mapped = daySlotsFromWire(
      day([
        {
          time: '21:30',
          startUtc: '2026-10-20T17:30:00Z',
          isAvailable: false,
          requiresApproval: true,
          freeTableCount: 0,
          isRequestable: true,
          unavailableReason: 8,
        },
      ]),
    );
    expect(mapped.slots[0]).toMatchObject({ requestable: true, isAvailable: false });
  });
});

describe('a table at a slot', () => {
  const response = (extra: Record<string, unknown>) =>
    ({
      asOfUtc: '2026-10-19T10:00:00Z',
      branchId: BRANCH,
      branchName: 'Northern Avenue',
      bufferMinutes: 5,
      cancellationDeadlineMinutes: 120,
      localDate: '2026-10-20',
      localTime: '19:00',
      partySize: 2,
      requestedStartUtc: '2026-10-20T15:00:00Z',
      requestedEndUtc: '2026-10-20T16:30:00Z',
      timeZoneId: 'Asia/Yerevan',
      turnTimeMinutes: 90,
      tables: [
        {
          tableId: 'tbl-7',
          label: '7',
          seats: 4,
          photoId: 'p1',
          photoX: 0.5,
          photoY: 0.5,
          floorAreaDisplayOrder: 1,
          isBookable: true,
          isAvailable: true,
          requiresApproval: true,
          physicalStatus: 1,
          state: 1,
          ...extra,
        },
      ],
    }) as unknown as Schemas['Yalla.Application.Reservations.BranchAvailability'];

  it('carries whether the table is only requestable, and by when it must be free', () => {
    const [table] = availabilityFromResponse(
      response({
        isRequestable: true,
        mustFreeByUtc: '2026-10-20T16:25:00Z',
        mustFreeByLocal: '20:25:00',
      }),
    );
    expect(table).toMatchObject({ isRequestable: true, mustFreeByUtc: '2026-10-20T16:25:00Z' });
  });

  it('asks the guest before on another day, and leaves tonight to the floor', () => {
    // The slot is 2026-10-20 19:00 Yerevan: a day ahead of a clock on the 19th...
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
      expect(
        availabilityFromResponse(response({ isRequestable: true }))[0]!.requiresEarlierGuestConsent,
      ).toBe(true);
      // ...and short notice on the 20th itself.
      vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
      expect(
        availabilityFromResponse(response({ isRequestable: true }))[0]!.requiresEarlierGuestConsent,
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads an older answer as asking nobody and cutting nothing short', () => {
    const [table] = availabilityFromResponse(response({}));
    expect(table).toMatchObject({
      isRequestable: false,
      requiresEarlierGuestConsent: false,
      mustFreeByUtc: null,
    });
  });

  it('reads just booked, next too soon and the guest before already asked as booked then', () => {
    for (const code of [11, 12, 13]) {
      const [table] = availabilityFromResponse(
        response({ isAvailable: false, unavailableReason: code, state: 2 }),
      );
      expect(table!.unavailableReason, String(code)).toBe('alreadyBooked');
    }
  });
});

describe("the diner's booking", () => {
  it('carries the promise and the request from the guest after', () => {
    const mapped = booking(
      {
        ...VIEW,
        promisedFreeByUtc: '2026-10-20T15:40:00Z',
        incomingTableRequest: {
          requestId: REQUEST,
          requestedStartUtc: '2026-10-20T15:45:00Z',
          freeByUtc: '2026-10-20T15:40:00Z',
          expiresAtUtc: '2026-10-19T12:00:00Z',
          requestedLocalTime: '19:45:00',
          freeByLocalTime: '19:40:00',
        },
      } as typeof VIEW,
      null,
    );
    expect(mapped.promisedFreeByUtc).toBe('2026-10-20T15:40:00Z');
    expect(mapped.incomingTableRequest).toEqual({
      requestId: REQUEST,
      requestedStartUtc: '2026-10-20T15:45:00Z',
      freeByUtc: '2026-10-20T15:40:00Z',
      expiresAtUtc: '2026-10-19T12:00:00Z',
    });
  });

  it('reads an older server, and a half-sent request, as nothing promised and nobody asking', () => {
    expect(booking(VIEW, null)).toMatchObject({
      promisedFreeByUtc: null,
      incomingTableRequest: null,
    });
    const half = booking(
      { ...VIEW, incomingTableRequest: { requestId: '', freeByUtc: '' } } as typeof VIEW,
      null,
    );
    expect(half.incomingTableRequest).toBeNull();
  });
});

describe('the floor tablet', () => {
  it('reads the earlier-guest trigger, the promise on the request and on the booking before', () => {
    const wire = {
      reservation: { ...VIEW, status: 1, promisedFreeByUtc: '2026-10-20T17:25:00Z' },
      trigger: 5,
      approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
      earlierGuestFreeByUtc: '2026-10-20T13:55:00Z',
      nextBooking: {
        startUtc: '2026-10-20T17:30:00Z',
        partySize: 4,
        promisedFreeByUtc: '2026-10-20T19:25:00Z',
      },
      previousBooking: {
        startUtc: '2026-10-20T12:30:00Z',
        partySize: 4,
        guestName: 'Anna',
        guestPhone: '+37491000000',
        status: 2,
        promisedFreeByUtc: '2026-10-20T13:55:00Z',
      },
    } as unknown as WireAwaitingApproval;

    expect(awaitingApprovalFromWire(wire)).toMatchObject({
      because: 'earlierGuestConsent',
      promisedFreeByUtc: '2026-10-20T17:25:00Z',
      earlierGuestFreeByUtc: '2026-10-20T13:55:00Z',
      previousBooking: { promisedFreeByUtc: '2026-10-20T13:55:00Z' },
      nextBooking: { promisedFreeByUtc: '2026-10-20T19:25:00Z' },
    });
  });

  it("reads the floor's promise to free a table before its next booking", () => {
    const state = {
      branchId: BRANCH,
      branchName: 'Northern Avenue',
      timeZoneId: 'Asia/Yerevan',
      asOfUtc: '2026-10-20T15:00:00Z',
      tables: [
        {
          tableId: 'tbl-7',
          label: '7',
          seats: 4,
          physicalStatus: 3,
          state: 4,
          rowVersion: 'AAA=',
          nextReservationStartUtc: '2026-10-20T17:30:00Z',
          nextReservationPromisedFreeByUtc: '2026-10-20T19:25:00Z',
          sittingPromisedFreeByUtc: '2026-10-20T17:25:00Z',
        },
        { tableId: 'tbl-8', label: '8', seats: 2, physicalStatus: 1, state: 1, rowVersion: 'AAB=' },
      ],
    } as unknown as Schemas['Yalla.Application.Floor.BranchFloorState'];

    expect(
      staffFloorDetails(state).map((detail) => [
        detail.nextReservationPromisedFreeByUtc,
        detail.sittingPromisedFreeByUtc,
      ]),
    ).toEqual([
      ['2026-10-20T19:25:00Z', '2026-10-20T17:25:00Z'],
      [null, null],
    ]);
  });
});

describe('the manage link', () => {
  it('reads the promise and why the booking waits', () => {
    const wire = {
      code: 'Y3107',
      status: 1,
      timeZoneId: 'Asia/Yerevan',
      localDate: '2026-10-20',
      localStartTime: '19:45:00',
      approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
      awaitingApprovalBecause: 5,
      promisedFreeByUtc: '2026-10-20T17:25:00Z',
    } as unknown as WirePublicBooking;

    expect(managedBookingFromWire(wire, { venueSlug: 'v', branchSlug: 'b' })).toMatchObject({
      awaitingApprovalBecause: 'earlierGuestConsent',
      promisedFreeByUtc: '2026-10-20T17:25:00Z',
    });
  });
});

// --- The gateway --------------------------------------------------------------

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const gateway = createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
  });
  return { gateway, backend };
}

const COMMAND = {
  commandId: 'cmd-1',
  branchId: BRANCH,
  tableId: 'tbl-7',
  slotUtc: '2026-10-20T14:00:00.000Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 2,
  guestName: 'Lilit',
  guestPhone: '+37493217788',
  channel: 'app' as const,
};

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('sending a booking a later one cuts short', () => {
  it('sends the agreed time with a new booking, and with a change', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations': { status: 201, body: VIEW },
      [`POST /api/reservations/${RESERVATION}/reschedule`]: { status: 200, body: VIEW },
    });

    await gateway.createBooking({ ...COMMAND, acceptsFreeByUtc: '2026-10-20T15:40:00Z' });
    await gateway.rescheduleBooking({
      bookingId: RESERVATION,
      commandId: 'cmd-2',
      tableId: 'tbl-7',
      slotUtc: COMMAND.slotUtc,
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
      acceptsFreeByUtc: '2026-10-20T15:40:00Z',
    });

    expect(backend.requests.map((request) => request.body)).toEqual([
      expect.objectContaining({ acceptsFreeByUtc: '2026-10-20T15:40:00Z' }),
      expect.objectContaining({ acceptsFreeByUtc: '2026-10-20T15:40:00Z' }),
    ]);
  });

  it('leaves the field off when nothing was agreed, so an older server sees the old body', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations': { status: 201, body: VIEW },
    });
    await gateway.createBooking(COMMAND);
    expect(backend.requests[0]!.body).not.toHaveProperty('acceptsFreeByUtc');
  });

  it('reads reservation-free-by-required as the time needed, and the booking after', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations': problemReply(422, 'reservation-free-by-required', {
        field: 'acceptsFreeByUtc',
        requiredFreeByUtc: '2026-10-20T15:40:00Z',
        requiredFreeByLocal: '19:40',
        nextBookingStartUtc: '2026-10-20T15:45:00Z',
        tableId: 'tbl-7',
        tableLabel: '7',
      }),
    });

    const error = await caught(gateway.createBooking(COMMAND));
    expect(error).toBeInstanceOf(FreeByRequiredError);
    expect(error).toMatchObject({
      requiredFreeByUtc: '2026-10-20T15:40:00Z',
      nextBookingStartUtc: '2026-10-20T15:45:00Z',
    });
  });

  it('reads the same refusal on a change', async () => {
    const { gateway } = gatewayOver({
      [`POST /api/reservations/${RESERVATION}/reschedule`]: problemReply(
        422,
        'reservation-free-by-required',
        { field: 'acceptsFreeByUtc', requiredFreeByUtc: '2026-10-20T15:40:00Z' },
      ),
    });
    const error = await caught(
      gateway.rescheduleBooking({
        bookingId: RESERVATION,
        commandId: 'cmd-2',
        tableId: 'tbl-7',
        slotUtc: COMMAND.slotUtc,
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    );
    expect(error).toBeInstanceOf(FreeByRequiredError);
  });
});

describe("the earlier guest's answer", () => {
  const route = `POST /api/reservations/${RESERVATION}/table-requests/${REQUEST}/answer`;

  it('posts yes or no with a command id, and reads the booking as it now stands', async () => {
    const { gateway, backend } = gatewayOver({
      [route]: {
        status: 200,
        body: { ...VIEW, promisedFreeByUtc: '2026-10-20T15:40:00Z', incomingTableRequest: null },
      },
    });

    const answered = await gateway.answerTableRequest({
      bookingId: RESERVATION,
      requestId: REQUEST,
      accept: true,
      commandId: 'cmd-answer',
    });

    expect(backend.requests[0]!.body).toEqual({ accept: true, clientCommandId: 'cmd-answer' });
    expect(answered).toMatchObject({
      id: RESERVATION,
      promisedFreeByUtc: '2026-10-20T15:40:00Z',
      incomingTableRequest: null,
    });
  });

  it('reads the booking back when the answer carries no body', async () => {
    const { gateway, backend } = gatewayOver({
      [route]: { status: 204 },
      'GET /api/reservations/mine': { status: 200, body: { upcoming: [VIEW], past: [] } },
    });

    const answered = await gateway.answerTableRequest({
      bookingId: RESERVATION,
      requestId: REQUEST,
      accept: false,
      commandId: 'cmd-answer',
    });

    expect(backend.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      route,
      'GET /api/reservations/mine',
    ]);
    expect(answered?.id).toBe(RESERVATION);
  });

  it('says a request that lapsed or was answered elsewhere can no longer be answered', async () => {
    const { gateway } = gatewayOver({
      [route]: problemReply(409, 'table-request-not-pending', {
        reservationId: RESERVATION,
        requestId: REQUEST,
        status: 3,
        expiresAtUtc: '2026-10-19T12:00:00Z',
      }),
    });
    const error = await caught(
      gateway.answerTableRequest({
        bookingId: RESERVATION,
        requestId: REQUEST,
        accept: true,
        commandId: 'cmd-answer',
      }),
    );
    expect(error).toBeInstanceOf(TableRequestClosedError);
  });
});
