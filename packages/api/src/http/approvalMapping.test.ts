import { describe, expect, it } from 'vitest';
import { isApprovalExpired } from '../contracts/approvals';
import type { WireReservationWithApproval } from './approvalMapping';
import type { WireAwaitingApproval } from './awaitingApprovalMapping';
import { awaitingApprovalFromWire } from './awaitingApprovalMapping';
import { consoleBookingFromWire } from './consoleMapping';
import { booking } from './dinerMapping';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';
import { createHttpGateway } from './httpGateway';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * The booking-approval wire, read the same way on every surface.
 *
 * The console's panel, the floor tablet, the diner's booking and the manage
 * link all read `ShortNotice`, the answer window and the decline reason off
 * the same fields. Each mapper is pinned here, and so is a server that sends
 * none of them yet: the fields are ahead of the generated schema, and an older
 * backend must read as "no window, not declined", never as a failure.
 */

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const EXPIRES = '2026-10-18T14:13:00Z';

const VIEW: WireReservationWithApproval = {
  id: '6f1d0a2e-0000-4000-8000-00000000000a',
  code: 'Y3107',
  status: 1,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  tableId: 'tbl-7',
  tableLabel: '7',
  roomName: 'Windows',
  partySize: 2,
  startUtc: '2026-10-18T15:45:00Z',
  endUtc: '2026-10-18T17:30:00Z',
  localDate: '2026-10-18',
  localStartTime: '19:45:00',
  localEndTime: '21:30:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-18T13:45:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: 'cmd-1',
  guestName: 'Lilit',
  guestPhone: '+37493217788',
  wasReplay: false,
  awaitingApprovalBecause: 4,
  approvalExpiresAtUtc: EXPIRES,
};

const DECLINED: WireReservationWithApproval = {
  ...VIEW,
  status: 7,
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: 2,
};

describe('the console row', () => {
  it('reads short notice and the window', () => {
    expect(consoleBookingFromWire(VIEW)).toMatchObject({
      awaitingApprovalBecause: 'shortNotice',
      approvalExpiresAtUtc: EXPIRES,
    });
  });

  it('reads an older server, which sends no window, as no window', () => {
    const { approvalExpiresAtUtc: _absent, ...older } = VIEW;
    expect(consoleBookingFromWire(older).approvalExpiresAtUtc).toBeNull();
  });
});

describe("the diner's booking", () => {
  it('carries why it waits and until when, while it waits', () => {
    expect(booking(VIEW, null)).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'shortNotice',
      approvalExpiresAtUtc: EXPIRES,
      declinedBecause: null,
    });
  });

  it('says nobody answered for a booking the window ran out on', () => {
    expect(booking(DECLINED, null)).toMatchObject({
      status: 'cancelledByVenue',
      approvalExpiresAtUtc: null,
      declinedBecause: 'noAnswer',
    });
    expect(booking({ ...DECLINED, declinedBecause: 1 }, null).declinedBecause).toBe(
      'staffDeclined',
    );
  });

  it('keeps a reason a newer server adds, as unknown rather than as one it knows', () => {
    expect(booking({ ...DECLINED, declinedBecause: 9 as unknown as 1 }, null).declinedBecause).toBe(
      'unknown',
    );
  });

  it('drops a window left on a booking that is no longer waiting', () => {
    expect(booking({ ...VIEW, status: 2 }, null).approvalExpiresAtUtc).toBeNull();
  });
});

describe('the manage link', () => {
  const PUBLIC = {
    code: 'Y3107',
    status: 1,
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    branchAddress: 'Northern Avenue 5',
    tableLabel: '7',
    partySize: 2,
    localDate: '2026-10-18',
    localStartTime: '19:45:00',
    timeZoneId: 'Asia/Yerevan',
    cancellationDeadlineUtc: '2026-10-18T13:45:00Z',
    cancelledAfterDeadline: false,
    canCancel: true,
    approvalExpiresAtUtc: EXPIRES,
  } as unknown as WirePublicBooking;
  const slugs = { venueSlug: 'lumen-coffee', branchSlug: 'northern-avenue' };

  it('counts down while the venue decides', () => {
    expect(managedBookingFromWire(PUBLIC, slugs)).toMatchObject({
      status: 'pendingApproval',
      approvalExpiresAtUtc: EXPIRES,
      declinedBecause: null,
    });
  });

  it('says why a declined one was declined', () => {
    const declined = managedBookingFromWire(
      { ...PUBLIC, status: 7, approvalExpiresAtUtc: null, declinedBecause: 2 },
      slugs,
    );
    expect(declined).toMatchObject({
      status: 'cancelled',
      approvalExpiresAtUtc: null,
      declinedBecause: 'noAnswer',
    });
  });
});

const AWAITING: WireAwaitingApproval = {
  reservation: VIEW,
  approvalExpiresAtUtc: EXPIRES,
  trigger: 4,
  previousBooking: {
    reservationId: '6f1d0a2e-0000-4000-8000-0000000000b1',
    startUtc: '2026-10-18T14:00:00Z',
    localStartTime: '18:00:00',
    partySize: 4,
    guestName: 'Anna',
    guestPhone: '+37477889900',
    status: 4,
  },
  nextBooking: {
    reservationId: '6f1d0a2e-0000-4000-8000-0000000000b2',
    startUtc: '2026-10-18T17:30:00Z',
    localStartTime: '21:30:00',
    partySize: 3,
  },
  currentSitting: { seatedAtUtc: '2026-10-18T14:05:00Z', partySize: 4 },
};

describe('a request on the floor tablet', () => {
  it('reads the booking, the window and the table around it', () => {
    expect(awaitingApprovalFromWire(AWAITING)).toEqual({
      id: VIEW.id,
      code: 'Y3107',
      branchId: BRANCH,
      guestName: 'Lilit',
      guestPhone: '+37493217788',
      partySize: 2,
      tableId: 'tbl-7',
      tableLabel: '7',
      roomName: 'Windows',
      startUtc: '2026-10-18T15:45:00Z',
      localDate: '2026-10-18',
      localStartTime: '19:45:00',
      timeZoneId: 'Asia/Yerevan',
      note: null,
      approvalExpiresAtUtc: EXPIRES,
      because: 'shortNotice',
      awaitsEarlierGuestAnswer: false,
      // Booking times: nobody promised to be gone by anything, nobody to ask.
      promisedFreeByUtc: null,
      earlierGuestFreeByUtc: null,
      previousBooking: {
        startUtc: '2026-10-18T14:00:00Z',
        partySize: 4,
        guestName: 'Anna',
        guestPhone: '+37477889900',
        status: 'seated',
        promisedFreeByUtc: null,
      },
      nextBooking: { startUtc: '2026-10-18T17:30:00Z', partySize: 3, promisedFreeByUtc: null },
      currentSitting: { sinceUtc: '2026-10-18T14:05:00Z', partySize: 4 },
    });
  });

  it("falls back to the reservation's own window and trigger, and to no context", () => {
    const bare = awaitingApprovalFromWire({ reservation: VIEW } as WireAwaitingApproval);
    expect(bare).toMatchObject({
      approvalExpiresAtUtc: EXPIRES,
      because: 'shortNotice',
      previousBooking: null,
      nextBooking: null,
      currentSitting: null,
    });
  });

  it('carries no number for an earlier guest who left none, and no size for an unknown party', () => {
    const quiet = awaitingApprovalFromWire({
      ...AWAITING,
      previousBooking: { ...AWAITING.previousBooking!, guestPhone: ' ' },
      currentSitting: { seatedAtUtc: '2026-10-18T14:05:00Z' },
    });
    expect(quiet.previousBooking?.guestPhone).toBeNull();
    expect(quiet.currentSitting?.partySize).toBeNull();
  });
});

function staffOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { gateway: createStaffHttpGateway(backend.client()), backend };
}

describe('the staff gateway', () => {
  it('reads the awaiting list from the branch route', async () => {
    const { gateway, backend } = staffOver({
      [`GET /api/branches/${BRANCH}/reservations/awaiting`]: { body: [AWAITING] },
    });

    const [request] = await gateway.listAwaitingApproval(BRANCH);

    expect(backend.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /api/branches/${BRANCH}/reservations/awaiting`,
    ]);
    expect(request?.because).toBe('shortNotice');
  });

  it('approves with the empty decision and declines with the reason typed', async () => {
    const { gateway, backend } = staffOver({
      [`POST /api/reservations/${VIEW.id}/approve`]: {
        body: { ...VIEW, status: 2, awaitingApprovalBecause: null, approvalExpiresAtUtc: null },
      },
      [`POST /api/reservations/${VIEW.id}/reject`]: { body: { ...DECLINED, declinedBecause: 1 } },
    });

    const approved = await gateway.approveReservation({ reservationId: VIEW.id });
    const declined = await gateway.rejectReservation({
      reservationId: VIEW.id,
      reason: 'Table 7 is staying late',
    });

    expect(backend.requests.map((r) => r.body)).toEqual([
      {},
      { reason: 'Table 7 is staying late' },
    ]);
    expect(approved).toMatchObject({ status: 'confirmed', approvalExpiresAtUtc: null });
    expect(declined.status).toBe('cancelledByVenue');
  });

  it('declines with no reason as an explicit null', async () => {
    const { gateway, backend } = staffOver({
      [`POST /api/reservations/${VIEW.id}/reject`]: { body: DECLINED },
    });
    await gateway.rejectReservation({ reservationId: VIEW.id });
    expect(backend.requests[0]?.body).toEqual({ reason: null });
  });

  it('passes the too-late refusal through with its code', async () => {
    const { gateway } = staffOver({
      [`POST /api/reservations/${VIEW.id}/approve`]: problemReply(
        409,
        'reservation-approval-expired',
        { reservationId: VIEW.id },
        'The answer window for Y3107 closed at 18:13.',
      ),
    });

    const refusal = await gateway
      .approveReservation({ reservationId: VIEW.id })
      .catch((error: unknown) => error);
    expect(isApprovalExpired(refusal)).toBe(true);
    expect((refusal as Error).message).toBe('The answer window for Y3107 closed at 18:13.');
  });
});

describe("the diner's change of a request that waited too long", () => {
  it('passes the too-late refusal through with its code, not as a table rule', async () => {
    const backend = fakeBackend({
      [`POST /api/reservations/${VIEW.id}/reschedule`]: problemReply(
        409,
        'reservation-approval-expired',
        { reservationId: VIEW.id, status: 1 },
        'Too late to answer this booking.',
      ),
    });
    const gateway = createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
      audience: 'diner',
    });

    const refusal = await gateway
      .rescheduleBooking({
        bookingId: VIEW.id,
        commandId: 'cmd-2',
        tableId: 'tbl-7',
        slotUtc: '2026-10-18T17:00:00.000Z',
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      })
      .catch((error: unknown) => error);

    expect(isApprovalExpired(refusal)).toBe(true);
  });
});
