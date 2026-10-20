import { describe, expect, it } from 'vitest';
import {
  BookingBusyError,
  BookingCommandInUseError,
  BookingLinkAccountUnavailableError,
  BookingOverlapsOwnError,
  BookingsNotAcceptedError,
  FreeByRequiredError,
  TableTakenError,
} from '../contracts/errors';
import { NotFoundError, TooManyRequestsError } from '../errors';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createPublicHttpGateway } from './publicHttpGateway';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';

/**
 * Public page phase 5: the manage link learns its branch and its booking.
 *
 * The reminders carry `/booking/{token}` — no slugs — so the page knows the
 * branch only from the answer (`venueSlug`, `branchSlug`), and it changes the
 * booking with the new `POST /api/public/bookings/{token}/reschedule`, reading
 * the room with `excludeReservationId` = the view's `reservationId` and sending
 * the view's `tableId` back when only the time or the party moves.
 */

const TOKEN = 'tok_abc-123';
const RESERVATION = '6f1d0a2e-0000-4000-8000-0000000000c1';
const TABLE = '0b5f3c1e-0000-4000-8000-0000000000d7';

const VIEW = {
  code: 'Y3107',
  status: 2,
  venueName: 'Lumen Coffee',
  venueSlug: 'lumen-coffee',
  branchName: 'Northern Avenue',
  branchSlug: 'northern-avenue',
  branchAddress: 'Northern Avenue 5',
  reservationId: RESERVATION,
  tableId: TABLE,
  tableLabel: '7',
  roomName: 'Hall',
  partySize: 2,
  localDate: '2026-10-24',
  localStartTime: '19:45:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-24T13:45:00Z',
  cancelledAfterDeadline: false,
  canCancel: true,
} as unknown as WirePublicBooking;

const CHANGE = {
  token: TOKEN,
  commandId: '9c4e5a7b-0000-4000-8000-000000000001',
  tableId: TABLE,
  // 20:00 in Yerevan (UTC+4).
  slotUtc: '2026-10-24T16:00:00.000Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 3,
};

const ROUTE = `POST /api/public/bookings/${encodeURIComponent(TOKEN)}/reschedule`;

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createPublicHttpGateway(backend.client()) };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('the manage link as the server now sends it', () => {
  it('carries the booking and table ids, and the branch from the answer', () => {
    expect(managedBookingFromWire(VIEW)).toMatchObject({
      reservationId: RESERVATION,
      tableId: TABLE,
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    });
  });

  it('keeps a booking the venue cancelled apart from one the guest cancelled', () => {
    expect(managedBookingFromWire({ ...VIEW, status: 7 })).toMatchObject({
      status: 'cancelled',
      cancelledByVenue: true,
    });
    expect(managedBookingFromWire({ ...VIEW, status: 6 })).toMatchObject({
      status: 'cancelled',
      cancelledByVenue: false,
    });
    // A decline is said as a decline, not as the venue cancelling.
    expect(
      managedBookingFromWire({ ...VIEW, status: 7, declinedBecause: 1 } as WirePublicBooking),
    ).toMatchObject({ cancelledByVenue: false });
  });

  it('reads the link with no slugs at all, the way /booking/{token} opens it', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET /api/public/bookings/${encodeURIComponent(TOKEN)}`]: { body: VIEW },
    });
    const booking = await gateway.getManagedBooking({ token: TOKEN });
    expect(booking).toMatchObject({ venueSlug: 'lumen-coffee', branchSlug: 'northern-avenue' });
    // Anonymous: nothing on this page may attach a token.
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();
  });
});

describe('changing a booking from its link', () => {
  it('sends the whole new slot in the branch clock, with the command id, anonymously', async () => {
    const { gateway, backend } = gatewayOver({
      [ROUTE]: { body: { ...VIEW, status: 1, partySize: 3, localStartTime: '20:00:00' } },
    });

    const moved = await gateway.rescheduleManagedBooking(CHANGE);

    const sent = backend.requests[0];
    expect(sent?.method).toBe('POST');
    expect(sent?.headers.get('authorization')).toBeNull();
    expect(sent?.body).toEqual({
      date: '2026-10-24',
      time: '20:00',
      partySize: 3,
      diningTableId: TABLE,
      clientCommandId: CHANGE.commandId,
    });
    // The status the answer carries, never a prediction.
    expect(moved).toMatchObject({ status: 'pendingApproval', partySize: 3, code: 'Y3107' });
  });

  it('sends the free-by promise only when one was agreed', async () => {
    const { gateway, backend } = gatewayOver({ [ROUTE]: { body: VIEW } });
    await gateway.rescheduleManagedBooking({
      ...CHANGE,
      acceptsFreeByUtc: '2026-10-24T17:30:00.000Z',
    });
    expect(backend.requests[0]?.body).toMatchObject({
      acceptsFreeByUtc: '2026-10-24T17:30:00.000Z',
    });
  });

  it('reads a 403 as the account behind the link, not as a phone to verify', async () => {
    const { gateway } = gatewayOver({ [ROUTE]: problemReply(403, 'phone-not-verified') });
    expect(await caught(gateway.rescheduleManagedBooking(CHANGE))).toBeInstanceOf(
      BookingLinkAccountUnavailableError,
    );
  });

  it('reads the refusals the booking sheet already knows', async () => {
    const cases: readonly [FakeRoute, new (...args: never[]) => unknown][] = [
      [problemReply(409, 'table-already-booked', { tableLabel: '7' }), TableTakenError],
      [problemReply(409, 'client-command-id-in-use'), BookingCommandInUseError],
      [problemReply(409, 'web-bookings-not-accepted'), BookingsNotAcceptedError],
      [problemReply(409, 'bookings-not-accepted'), BookingsNotAcceptedError],
      [problemReply(503, 'reservation-lock-timeout', { retryable: true }), BookingBusyError],
      [
        problemReply(422, 'reservation-free-by-required', {
          requiredFreeByUtc: '2026-10-24T17:30:00Z',
        }),
        FreeByRequiredError,
      ],
      [problemReply(404, 'not-found'), NotFoundError],
      [problemReply(429, 'rate-limited'), TooManyRequestsError],
    ];
    for (const [reply, type] of cases) {
      const { gateway } = gatewayOver({ [ROUTE]: reply });
      expect(await caught(gateway.rescheduleManagedBooking(CHANGE))).toBeInstanceOf(type);
    }
  });

  it('reads overlaps-own with no context as a booking held, naming nothing', async () => {
    const { gateway } = gatewayOver({ [ROUTE]: problemReply(409, 'reservation-overlaps-own') });
    const error = await caught(gateway.rescheduleManagedBooking(CHANGE));
    expect(error).toBeInstanceOf(BookingOverlapsOwnError);
    expect(error).toMatchObject({ localStartTime: null, tableLabel: null, existingCode: null });
  });
});
