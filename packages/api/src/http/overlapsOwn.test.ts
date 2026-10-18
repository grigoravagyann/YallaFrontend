import { describe, expect, it } from 'vitest';
import { BookingOverlapsOwnError, isBookingOverlapsOwn } from '../contracts/errors';
import { bookingFailure } from '../contracts/reservation';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * One diner, two bookings at once at the same branch: refused.
 *
 * A signed-in diner whose new sitting — or a change of one — overlaps one of
 * their own live bookings at the branch is answered 409
 * `reservation-overlaps-own`, with the booking they already have in `context`
 * (`reservationId`, `code`, `localStartTime`, `tableLabel`), so the screen can
 * say "You already have a booking at 19:30 (table 2)" rather than a generic no.
 */

const RESERVATION = '6f1d0a2e-0000-4000-8000-00000000000a';

const COMMAND = {
  commandId: 'cmd-1',
  branchId: '0b5f3c1e-0000-4000-8000-000000000001',
  tableId: 'tbl-1',
  slotUtc: '2026-10-20T15:45:00.000Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 2,
  guestName: 'Bella',
  guestPhone: '+37493217788',
  channel: 'app' as const,
};

const OVERLAP = problemReply(409, 'reservation-overlaps-own', {
  reservationId: 'r-existing',
  code: 'Y3200',
  localDate: '2026-10-20',
  localStartTime: '19:30:00',
  tableLabel: '2',
});

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  return createHttpGateway(fakeBackend(routes).client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
  });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('a booking that overlaps one of the diner’s own', () => {
  it('is its own error on a new booking, naming the booking already held', async () => {
    const error = await caught(
      gatewayOver({ 'POST /api/reservations': OVERLAP }).createBooking(COMMAND),
    );
    expect(error).toBeInstanceOf(BookingOverlapsOwnError);
    expect(isBookingOverlapsOwn(error)).toBe(true);
    expect(error).toMatchObject({
      status: 409,
      existingReservationId: 'r-existing',
      existingCode: 'Y3200',
      localDate: '2026-10-20',
      localStartTime: '19:30',
      tableLabel: '2',
    });
  });

  it('is the same error on a change', async () => {
    const error = await caught(
      gatewayOver({
        [`POST /api/reservations/${RESERVATION}/reschedule`]: OVERLAP,
      }).rescheduleBooking({
        bookingId: RESERVATION,
        commandId: 'cmd-2',
        tableId: 'tbl-1',
        slotUtc: COMMAND.slotUtc,
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    );
    expect(error).toBeInstanceOf(BookingOverlapsOwnError);
  });

  it('reads a context with parts missing as unknown, not as a guess', async () => {
    const error = await caught(
      gatewayOver({
        'POST /api/reservations': problemReply(409, 'reservation-overlaps-own', {}),
      }).createBooking(COMMAND),
    );
    expect(error).toMatchObject({
      existingReservationId: null,
      existingCode: null,
      localDate: null,
      localStartTime: null,
      tableLabel: null,
    });
  });

  it('says which booking, at what time and table', () => {
    const at = (localStartTime: string | null, tableLabel: string | null) =>
      new BookingOverlapsOwnError({
        url: '/api/reservations',
        existingReservationId: 'r-existing',
        existingCode: 'Y3200',
        localDate: '2026-10-20',
        localStartTime,
        tableLabel,
      });

    expect(bookingFailure(at('19:30', '2'), 'Asia/Yerevan', 'en')).toMatchObject({
      kind: 'overlapsOwn',
      line: { key: 'confirm.error.overlapsOwn', params: { time: '19:30', table: '2' } },
    });
    expect(bookingFailure(at('19:30', null), 'Asia/Yerevan', 'en')).toMatchObject({
      kind: 'overlapsOwn',
      line: { key: 'confirm.error.overlapsOwnPlain', params: { time: '19:30' } },
    });
    // No time to quote: the plain refusal, never "at null".
    expect(bookingFailure(at(null, '2'), 'Asia/Yerevan', 'en')).toMatchObject({
      kind: 'overlapsOwn',
      line: { key: 'confirm.error.generic' },
    });
  });
});
