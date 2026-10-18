import { describe, expect, it } from 'vitest';
import type { RescheduleBookingCommand } from '../contracts/booking';
import { BookingNotChangeableError, TableTakenError } from '../contracts/errors';
import { NotFoundError } from '../errors';
import type { components } from '../generated/schema';
import { BASE_URL, fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * The diner design gaps over HTTP: the day of slots, changing a booking, the
 * room on a booking, the bill request with a tip, the tips on the tab and the
 * faces on the roster.
 *
 * Written against the wire contract the backend branch is building, before
 * `generated/schema.ts` has it — so each test spells the wire it expects, and
 * the mapper is held to it the day the schema is regenerated.
 */

type Schemas = components['schemas'];
type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const BOOKING = '6f1d0a2e-0000-4000-8000-00000000000a';
const TAB = '7d0c0000-0000-4000-8000-000000000001';
const ME = '5a1e0000-0000-4000-8000-0000000000a1';
const GUEST = '5a1e0000-0000-4000-8000-0000000000b2';

const VIEW: ReservationViewWire = {
  id: BOOKING,
  code: 'K7QX2M',
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
};

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const gateway = createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
    // A participant token already issued for the tab, as a reload finds one.
    tabTokens: { read: async () => ({ [TAB]: 'participant-token' }), write: async () => {} },
  });
  return { gateway, backend };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

// --- The room on a booking -------------------------------------------------------------

describe('the room a booking is in', () => {
  it('carries the room by id and name from the reservation view', async () => {
    const { gateway } = gatewayOver({
      'GET /api/reservations/mine': {
        body: {
          upcoming: [{ ...VIEW, roomId: 'room-1', roomName: ' Terrace ' }],
          past: [],
        },
      },
    });

    await expect(gateway.getBooking(BOOKING)).resolves.toMatchObject({
      roomId: 'room-1',
      roomName: 'Terrace',
    });
  });

  it('reads an absent or blank room as none, never as an empty name', async () => {
    const { gateway } = gatewayOver({
      'GET /api/reservations/mine': {
        body: { upcoming: [VIEW, { ...VIEW, id: 'other', roomName: '  ' }], past: [] },
      },
    });

    const { upcoming } = await gateway.listBookings();
    expect(upcoming.map((booking) => [booking.roomId, booking.roomName])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
});

// --- A day of slots ----------------------------------------------------------------------

const DAY = {
  branchId: BRANCH,
  date: '2026-09-20',
  partySize: 2,
  stepMinutes: 30,
  slots: [
    // Out of order on purpose: the screen's chips run earliest first.
    {
      time: '20:00:00',
      startUtc: '2026-09-20T16:00:00Z',
      isAvailable: false,
      requiresApproval: false,
      freeTableCount: 0,
      unavailableReason: 8,
    },
    {
      time: '19:30',
      startUtc: '2026-09-20T15:30:00Z',
      isAvailable: true,
      requiresApproval: true,
      freeTableCount: 3,
    },
    {
      time: '09:00',
      startUtc: '2026-09-20T05:00:00Z',
      isAvailable: false,
      requiresApproval: false,
      freeTableCount: 0,
      unavailableReason: 1,
    },
  ],
};

describe('a day of slots', () => {
  const route = `GET /api/branches/${BRANCH}/availability/slots`;

  it('asks the anonymous route for the day and party, and nothing it was not given', async () => {
    const { gateway, backend } = gatewayOver({ [route]: { body: DAY } });

    await gateway.getDaySlots({ branchId: BRANCH, date: '2026-09-20', partySize: 2 });

    const [request] = backend.requests;
    expect(`${request?.method} ${request?.path}`).toBe(route);
    expect(Object.fromEntries(request!.query)).toEqual({ date: '2026-09-20', partySize: '2' });
    // Anonymous: the browse screens ask before anybody signs in.
    expect(request?.headers.get('authorization')).toBeNull();
  });

  it('leaves the booking being changed out, by the id the server takes', async () => {
    const { gateway, backend } = gatewayOver({ [route]: { body: DAY } });

    await gateway.getDaySlots({
      branchId: BRANCH,
      date: '2026-09-20',
      partySize: 2,
      excludeBookingId: BOOKING,
    });

    expect(backend.requests[0]?.query.get('excludeReservationId')).toBe(BOOKING);
  });

  it('maps the slots earliest first, in the screen vocabulary, times as HH:mm', async () => {
    const { gateway } = gatewayOver({ [route]: { body: DAY } });

    const day = await gateway.getDaySlots({ branchId: BRANCH, date: '2026-09-20', partySize: 2 });

    expect(day).toEqual({
      branchId: BRANCH,
      date: '2026-09-20',
      partySize: 2,
      stepMinutes: 30,
      unavailableReason: null,
      slots: [
        {
          time: '09:00',
          slotUtc: '2026-09-20T05:00:00Z',
          isAvailable: false,
          requiresApproval: false,
          freeTableCount: 0,
          unavailableReason: 'pastLeadTime',
          // Booking times, from a server before them: nothing asked, nothing cut.
          requestable: false,
          requestableTableCount: 0,
          mustFreeByUtc: null,
        },
        {
          time: '19:30',
          slotUtc: '2026-09-20T15:30:00Z',
          isAvailable: true,
          requiresApproval: true,
          freeTableCount: 3,
          unavailableReason: null,
          requestable: false,
          requestableTableCount: 0,
          mustFreeByUtc: null,
        },
        {
          time: '20:00',
          slotUtc: '2026-09-20T16:00:00Z',
          isAvailable: false,
          requiresApproval: false,
          freeTableCount: 0,
          // Bookings took the tables; nobody is sitting there.
          unavailableReason: 'alreadyBooked',
          requestable: false,
          requestableTableCount: 0,
          mustFreeByUtc: null,
        },
      ],
    });
  });

  it('lets a whole-day refusal outrank every slot, and carries its reason to each', async () => {
    const { gateway } = gatewayOver({
      [route]: { body: { ...DAY, unavailableReason: 2 } },
    });

    const day = await gateway.getDaySlots({ branchId: BRANCH, date: '2026-09-20', partySize: 2 });

    expect(day?.unavailableReason).toBe('tooFarAhead');
    expect(day?.slots.every((slot) => !slot.isAvailable && slot.freeTableCount === 0)).toBe(true);
    // The available one had no reason of its own, so it takes the day's.
    expect(day?.slots.find((slot) => slot.time === '19:30')?.unavailableReason).toBe('tooFarAhead');
  });

  it('reads an empty day, and the 404 of a branch that does not exist as null', async () => {
    const shut = gatewayOver({
      [route]: {
        body: { branchId: BRANCH, date: '2026-09-20', partySize: 2, unavailableReason: 3 },
      },
    });
    await expect(
      shut.gateway.getDaySlots({ branchId: BRANCH, date: '2026-09-20', partySize: 2 }),
      // No step from the server: every quarter hour, the step since booking times.
    ).resolves.toMatchObject({ unavailableReason: 'closed', slots: [], stepMinutes: 15 });

    const { gateway } = gatewayOver({});
    await expect(
      gateway.getDaySlots({ branchId: BRANCH, date: '2026-09-20', partySize: 2 }),
    ).resolves.toBeNull();
  });
});

describe('the room at a slot, for a booking being changed', () => {
  it('sends excludeReservationId only when there is a booking to leave out', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET /api/branches/${BRANCH}/availability`]: { status: 404 },
    });
    const ask = { branchId: BRANCH, slotUtc: VIEW.startUtc, partySize: 2 };

    await gateway.getSlotFloor(ask);
    await gateway.getSlotFloor({ ...ask, excludeBookingId: BOOKING });

    expect(backend.requests[0]?.query.has('excludeReservationId')).toBe(false);
    expect(backend.requests[1]?.query.get('excludeReservationId')).toBe(BOOKING);
  });
});

// --- Changing a booking -------------------------------------------------------------------

describe('changing a booking', () => {
  const route = `POST /api/reservations/${BOOKING}/reschedule`;
  const COMMAND: RescheduleBookingCommand = {
    bookingId: BOOKING,
    commandId: 'cmd-2',
    tableId: 'tbl-9',
    slotUtc: '2026-09-20T16:00:00.000Z',
    timeZoneId: 'Asia/Yerevan',
    partySize: 8,
  };

  it("posts the branch's wall-clock time, the party and the table, and answers the same booking moved", async () => {
    const moved = {
      ...VIEW,
      status: 1,
      tableId: 'tbl-9',
      tableLabel: '9',
      roomId: 'room-2',
      roomName: 'Hall',
      partySize: 8,
      startUtc: '2026-09-20T16:00:00Z',
      endUtc: '2026-09-20T17:30:00Z',
    };
    const { gateway, backend } = gatewayOver({ [route]: { body: moved } });

    const booking = await gateway.rescheduleBooking(COMMAND);

    expect(backend.requests[0]?.body).toEqual({
      // 16:00 UTC is 20:00 in Yerevan: the server takes branch-local time.
      date: '2026-09-20',
      time: '20:00',
      partySize: 8,
      diningTableId: 'tbl-9',
      clientCommandId: 'cmd-2',
    });
    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer diner-token');
    expect(booking).toMatchObject({
      id: BOOKING,
      code: 'K7QX2M',
      // A party of eight may need the venue again: a normal answer.
      status: 'pendingApproval',
      tableId: 'tbl-9',
      roomName: 'Hall',
      slotUtc: '2026-09-20T16:00:00Z',
    });
  });

  it('names a booking that can no longer move', async () => {
    const { gateway } = gatewayOver({
      [route]: problemReply(409, 'reservation-not-changeable', { reservationId: BOOKING }),
    });

    const error = await caught(gateway.rescheduleBooking(COMMAND));

    expect(error).toBeInstanceOf(BookingNotChangeableError);
    expect((error as BookingNotChangeableError).reservationId).toBe(BOOKING);
  });

  it('reads the create refusals the same way: a taken table, a rule, somebody else’s booking', async () => {
    const taken = gatewayOver({
      [route]: problemReply(409, 'table-already-booked', { tableId: 'tbl-9', tableLabel: '9' }),
    });
    const shut = gatewayOver({
      [route]: problemReply(422, 'reservation-outside-opening-hours', {}),
    });
    const stranger = gatewayOver({});

    const takenError = await caught(taken.gateway.rescheduleBooking(COMMAND));
    expect(takenError).toBeInstanceOf(TableTakenError);
    expect((takenError as TableTakenError).tableLabel).toBe('9');
    expect(await caught(shut.gateway.rescheduleBooking(COMMAND))).toMatchObject({
      name: 'BookingRejectedError',
      reason: 'closed',
      partySize: 8,
    });
    expect(await caught(stranger.gateway.rescheduleBooking(COMMAND))).toBeInstanceOf(NotFoundError);
  });
});

// --- The tab: tips, photos and the bill request ---------------------------------------------

const WIRE_PHOTO = {
  photoId: 'ph1',
  thumbnailUrl: '/api/photos/ph1/thumbnail',
  cardUrl: '/api/photos/ph1/card',
  fullUrl: '/api/photos/ph1/full',
};

function tabView(over: Record<string, unknown> = {}) {
  return {
    tabId: TAB,
    branchId: BRANCH,
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    tableLabel: '7',
    status: 1,
    settlementMode: 3,
    settlementModeLocked: true,
    hostParticipantId: ME,
    hideTotalFromGuests: false,
    me: {
      participantId: ME,
      displayName: 'Ani',
      role: 1,
      status: 2,
      canOrder: true,
      canOrderNow: true,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-09-20T15:00:00Z',
      photo: WIRE_PHOTO,
    },
    participants: [
      { participantId: ME, displayName: 'Ani', role: 1, status: 2, photo: WIRE_PHOTO },
      { participantId: GUEST, displayName: 'Davit', role: 2, status: 2 },
    ],
    myLines: [],
    tableLines: [],
    tableTotalVisible: true,
    tableTotal: {
      subtotalAmd: 4500,
      serviceChargeAmd: 450,
      totalAmd: 4950,
      paidAmd: 2000,
      remainingAmd: 2950,
    },
    tipsAmd: 300,
    myItemsSubtotalAmd: 0,
    openedAtUtc: '2026-09-20T15:00:00Z',
    timeZoneId: 'Asia/Yerevan',
    serviceChargePercent: 10,
    maxSequence: 12,
    adjustments: [],
    ...over,
  };
}

describe('the tab, with tips and faces', () => {
  it('puts the tips beside the bill, never inside it', async () => {
    const { gateway } = gatewayOver({ [`GET /api/tabs/${TAB}`]: { body: tabView() } });

    const tab = await gateway.getDinerTab(TAB);

    expect(tab?.money).toEqual({
      kind: 'table',
      bill: {
        subtotalDram: 4500,
        serviceChargeDram: 450,
        totalDram: 4950,
        paidDram: 2000,
        remainingDram: 2950,
      },
      tipsDram: 300,
    });
  });

  it('reads tips a server does not send as unknown, and keeps them off a hidden total', async () => {
    const older = gatewayOver({
      [`GET /api/tabs/${TAB}`]: { body: tabView({ tipsAmd: undefined }) },
    });
    const hidden = gatewayOver({
      [`GET /api/tabs/${TAB}`]: {
        body: tabView({ tableTotalVisible: false, tableTotal: undefined, tipsAmd: undefined }),
      },
    });

    const olderTab = await older.gateway.getDinerTab(TAB);
    expect(olderTab?.money.kind === 'table' && olderTab.money.tipsDram).toBeNull();
    const hiddenTab = await hidden.gateway.getDinerTab(TAB);
    expect(hiddenTab?.money).toEqual({ kind: 'ownItemsOnly', yourItemsSubtotalDram: 0 });
  });

  it('draws the faces it was given, with absolute links, and nobody else’s', async () => {
    const { gateway } = gatewayOver({ [`GET /api/tabs/${TAB}`]: { body: tabView() } });

    const tab = await gateway.getDinerTab(TAB);

    expect(tab?.me.photo?.thumbnailUrl).toBe(`${BASE_URL}/api/photos/ph1/thumbnail`);
    expect(tab?.participants.map((entry) => entry.photo?.thumbnailUrl ?? null)).toEqual([
      `${BASE_URL}/api/photos/ph1/thumbnail`,
      // A walk-in with no account: no photo, initials on the screen.
      null,
    ]);
  });
});

describe('asking for the bill with a tip', () => {
  const route = `POST /api/tabs/${TAB}/service-requests`;
  const reply = (over: Record<string, unknown> = {}) => ({
    serviceRequestId: 'sr-1',
    tabId: TAB,
    tableLabel: '7',
    preset: 3,
    createdAtUtc: '2026-09-20T17:00:00Z',
    waitingMinutes: 0,
    tabEventSequence: 13,
    ...over,
  });

  it('sends the preset alone when there is no bill to describe', async () => {
    const { gateway, backend } = gatewayOver({ [route]: { body: reply({ preset: 2 }) } });

    const call = await gateway.callWaiter({ tabId: TAB, reason: 'water', commandId: 'c1' });

    expect(backend.requests[0]?.body).toEqual({ preset: 2 });
    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer participant-token');
    expect(call.bill).toBeNull();
  });

  it('sends the scope and the tip, and answers with the amounts the server worked out', async () => {
    const { gateway, backend } = gatewayOver({
      [route]: {
        body: reply({ billScope: 2, billAmountAmd: 1650, tipPercent: 10, tipAmd: 150 }),
      },
    });

    const call = await gateway.callWaiter({
      tabId: TAB,
      reason: 'bill',
      commandId: 'c2',
      bill: { scope: 'mine', tipPercent: 10 },
    });

    expect(backend.requests[0]?.body).toEqual({ preset: 3, billScope: 2, tipPercent: 10 });
    expect(call).toEqual({
      id: 'sr-1',
      tabId: TAB,
      reason: 'bill',
      requestedAtUtc: '2026-09-20T17:00:00Z',
      bill: { scope: 'mine', amountDram: 1650, tipPercent: 10, tipDram: 150 },
    });
  });

  it('sends the whole bill as 1, and reads a scope it does not know as no bill at all', async () => {
    const { gateway, backend } = gatewayOver({
      [route]: { body: reply({ billScope: 9, billAmountAmd: 2950, tipPercent: 5, tipAmd: 225 }) },
    });

    const call = await gateway.callWaiter({
      tabId: TAB,
      reason: 'bill',
      commandId: 'c3',
      bill: { scope: 'whole', tipPercent: 5 },
    });

    expect((backend.requests[0]?.body as { billScope: number }).billScope).toBe(1);
    expect(call.bill).toBeNull();
  });
});
