import { describe, expect, it } from 'vitest';
import {
  AskOnMyWayAskedRecentlyError,
  AskOnMyWayNotOpenError,
  AskOnMyWayTooEarlyError,
  GuestAlreadyAnsweredError,
  OnMyWayNotOpenError,
} from '../contracts/errors';
import { ValidationError } from '../errors';
import type { WireReservationWithApproval } from './approvalMapping';
import { consoleBookingFromWire } from './consoleMapping';
import { booking } from './dinerMapping';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import { createPublicHttpGateway } from './publicHttpGateway';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';
import { createStaffHttpGateway } from './staffHttpGateway';
import { staffFloorDetails } from './staffMapping';

/**
 * "I'm coming" over HTTP (2026-10-22): the guest's "running late" through
 * both doors, the venue's "Ask: are you coming?", the answer fields on every
 * booking read, and a typed error for each of the ask's refusals.
 */

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const RESERVATION = '6f1d0a2e-0000-4000-8000-00000000000a';

const VIEW: WireReservationWithApproval = {
  id: RESERVATION,
  code: 'Y3107',
  status: 2,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  tableId: 'tbl-7',
  tableLabel: '7',
  bookedWithoutTable: false,
  partySize: 2,
  startUtc: '2026-10-22T15:30:00Z',
  onMyWayOpensAtUtc: '2026-10-22T13:30:00Z',
  endUtc: '2026-10-22T17:00:00Z',
  localDate: '2026-10-22',
  localStartTime: '19:30:00',
  localEndTime: '21:00:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-22T13:30:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: 'cmd-1',
  guestName: 'Anna',
  guestPhone: '+37499111222',
  wasReplay: false,
  awaitsEarlierGuestAnswer: false,
  phoneUnverified: false,
  guestRunningLateMinutes: 15,
  guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
  staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
};

function dinerOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return {
    backend,
    gateway: createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
      audience: 'diner',
    }),
  };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the answer fields on every booking read', () => {
  it("reads the diner's booking: the lateness, the ask and the window", () => {
    expect(booking(VIEW, null)).toMatchObject({
      guestConfirmedOnWayAtUtc: null,
      guestRunningLateMinutes: 15,
      guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
      staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
      onMyWayOpensAtUtc: '2026-10-22T13:30:00Z',
    });
  });

  it('reads an older server, which says none of it, as nobody late and nobody asked', () => {
    const {
      guestRunningLateMinutes: _late,
      guestRunningLateAtUtc: _at,
      staffAskedOnMyWayAtUtc: _asked,
      ...older
    } = VIEW;
    expect(booking(older, null)).toMatchObject({
      guestRunningLateMinutes: null,
      guestRunningLateAtUtc: null,
      staffAskedOnMyWayAtUtc: null,
    });
  });

  it("reads the console's row", () => {
    expect(consoleBookingFromWire(VIEW)).toMatchObject({
      guestRunningLateMinutes: 15,
      guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
      staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
    });
  });

  it('reads the manage link, which says when the window opens', () => {
    const wire = {
      code: 'Y3107',
      status: 2,
      timeZoneId: 'Asia/Yerevan',
      localDate: '2026-10-22',
      localStartTime: '19:30:00',
      onYourWayAsked: true,
      guestRunningLateMinutes: 10,
      staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
      onMyWayOpensAtUtc: '2026-10-22T13:30:00Z',
    } as unknown as WirePublicBooking;
    expect(managedBookingFromWire(wire, { venueSlug: 'v', branchSlug: 'b' })).toMatchObject({
      onYourWayAsked: true,
      guestRunningLateMinutes: 10,
      staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
      onMyWayOpensAtUtc: '2026-10-22T13:30:00Z',
    });
  });

  it("reads the floor's next booking: late, and when the venue asked", () => {
    const [table, bare] = staffFloorDetails({
      tables: [
        {
          tableId: 't4',
          label: '4',
          seats: 4,
          physicalStatus: 1,
          rowVersion: 'AAA=',
          nextReservationGuestRunningLateMinutes: 30,
          nextReservationStaffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
        },
        { tableId: 't5', label: '5', seats: 2, physicalStatus: 1, rowVersion: 'AAA=' },
      ],
    } as never);
    expect(table).toMatchObject({
      nextReservationGuestRunningLateMinutes: 30,
      nextReservationStaffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
    });
    expect(bare).toMatchObject({
      nextReservationGuestRunningLateMinutes: null,
      nextReservationStaffAskedOnMyWayAtUtc: null,
    });
  });
});

describe("the guest's running late", () => {
  const ANSWER = {
    reservationId: RESERVATION,
    guestRunningLateMinutes: 15,
    guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
    expectedArrivalUtc: '2026-10-22T15:45:00Z',
  };

  it('posts the minutes from the app and reads the answer', async () => {
    const { gateway, backend } = dinerOver({
      [`POST /api/reservations/${RESERVATION}/running-late`]: { body: ANSWER },
    });
    expect(await gateway.reportRunningLate({ reservationId: RESERVATION, minutes: 15 })).toEqual(
      ANSWER,
    );
    expect(backend.requests[0]?.body).toEqual({ minutes: 15 });
  });

  it('posts it from the link, with no session', async () => {
    const backend = fakeBackend({
      'POST /api/public/bookings/tok%2F1/running-late': { body: ANSWER },
    });
    const gateway = createPublicHttpGateway(backend.client({ getToken: () => 'never-sent' }));
    expect(await gateway.reportManagedRunningLate({ token: 'tok/1', minutes: 15 })).toEqual(ANSWER);
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();
    expect(backend.requests[0]?.body).toEqual({ minutes: 15 });
  });

  it('reads outside the window as on-my-way-not-open, and odd minutes as a 422', async () => {
    const { gateway } = dinerOver({
      [`POST /api/reservations/${RESERVATION}/running-late`]: problemReply(
        409,
        'on-my-way-not-open',
        { reservationId: RESERVATION, status: 2, opensAtUtc: '2026-10-22T13:30:00Z' },
      ),
      [`POST /api/reservations/other/running-late`]: problemReply(422, 'validation-failed', {
        fields: [{ field: 'minutes', message: '10, 15 or 30.' }],
      }),
    });
    const closed = await caught(
      gateway.reportRunningLate({ reservationId: RESERVATION, minutes: 10 }),
    );
    expect(closed).toBeInstanceOf(OnMyWayNotOpenError);
    expect(closed).toMatchObject({ opensAtUtc: '2026-10-22T13:30:00Z' });
    const odd = await caught(gateway.reportRunningLate({ reservationId: 'other', minutes: 30 }));
    expect(odd).toBeInstanceOf(ValidationError);
  });
});

describe("the venue's ask", () => {
  it('posts with no body and reads the answer', async () => {
    const backend = fakeBackend({
      [`POST /api/reservations/${RESERVATION}/ask-on-my-way`]: {
        body: {
          reservationId: RESERVATION,
          staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
          nextAskAllowedAtUtc: '2026-10-22T15:05:00Z',
          notified: false,
        },
      },
    });
    const answer = await createStaffHttpGateway(backend.client()).askOnMyWay(RESERVATION);
    expect(answer).toEqual({
      reservationId: RESERVATION,
      staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
      nextAskAllowedAtUtc: '2026-10-22T15:05:00Z',
      notified: false,
    });
    expect(backend.requests[0]?.body).toBeUndefined();
  });

  it.each([
    [
      problemReply(409, 'ask-on-my-way-too-early', {
        reservationId: RESERVATION,
        opensAtUtc: '2026-10-22T13:30:00Z',
      }),
      AskOnMyWayTooEarlyError,
      { reservationId: RESERVATION, opensAtUtc: '2026-10-22T13:30:00Z' },
    ],
    [
      problemReply(409, 'ask-on-my-way-not-open', {
        reservationId: RESERVATION,
        status: 4,
        startUtc: '2026-10-22T15:30:00Z',
      }),
      AskOnMyWayNotOpenError,
      { bookingStatus: 'seated', startUtc: '2026-10-22T15:30:00Z' },
    ],
    [
      problemReply(409, 'guest-already-answered', {
        reservationId: RESERVATION,
        answeredAtUtc: '2026-10-22T15:05:00Z',
        runningLateMinutes: 15,
      }),
      GuestAlreadyAnsweredError,
      { answeredAtUtc: '2026-10-22T15:05:00Z', runningLateMinutes: 15 },
    ],
    [
      problemReply(409, 'guest-already-answered', {
        reservationId: RESERVATION,
        answeredAtUtc: '2026-10-22T15:05:00Z',
      }),
      GuestAlreadyAnsweredError,
      { runningLateMinutes: null },
    ],
    [
      problemReply(409, 'ask-on-my-way-asked-recently', {
        reservationId: RESERVATION,
        askedAtUtc: '2026-10-22T14:50:00Z',
        nextAllowedAtUtc: '2026-10-22T15:05:00Z',
      }),
      AskOnMyWayAskedRecentlyError,
      { askedAtUtc: '2026-10-22T14:50:00Z', nextAllowedAtUtc: '2026-10-22T15:05:00Z' },
    ],
  ])('reads each refusal as its typed error (%#)', async (reply, type, fields) => {
    const backend = fakeBackend({
      [`POST /api/reservations/${RESERVATION}/ask-on-my-way`]: reply,
    });
    const error = await caught(createStaffHttpGateway(backend.client()).askOnMyWay(RESERVATION));
    expect(error).toBeInstanceOf(type);
    expect(error).toMatchObject(fields);
  });
});
