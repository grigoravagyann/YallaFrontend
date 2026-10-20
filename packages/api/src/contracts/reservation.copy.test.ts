import { describe, expect, it } from 'vitest';
import * as errorsBase from '../errors';
import { NetworkError, ServerError, TimeoutError } from '../errors';
import type { TableAvailability } from './booking';
import * as errors from './errors';
import { RateLimitedError, WrongCodeError } from './errors';
import {
  bookingFailure,
  declinedCopy,
  freeCancellationCopy,
  pendingReasonCopy,
  tableCopy,
  venueAnswerCopy,
  verificationFailureCopy,
} from './reservation';

/**
 * What the two booking surfaces say, pinned where the rule lives.
 */

const URL = 'https://api.test.yalla.am/api/reservations';
const YEREVAN = 'Asia/Yerevan';

describe('a booking refused for an unconfirmed number', () => {
  it('asks for verification rather than another tap on Confirm', () => {
    const failure = bookingFailure(new errors.PhoneNotVerifiedError({ url: URL }), YEREVAN, 'en');
    expect(failure).toEqual({
      kind: 'phoneNotVerified',
      line: { key: 'confirm.error.phoneNotVerified', params: {} },
    });
  });
});

describe('a refused code', () => {
  it('drops the count when the server sent none, rather than saying 0 attempts left', () => {
    const error = new WrongCodeError({ url: URL, attemptsRemaining: null });
    expect(verificationFailureCopy(error, 'en')).toEqual({
      key: 'verify.error.wrongCodeNoCount',
      params: {},
    });
  });

  it('tells the diner to ask for a new code when none are left', () => {
    const error = new WrongCodeError({ url: URL, attemptsRemaining: 0 });
    expect(verificationFailureCopy(error, 'en').key).toBe('verify.error.codeSpent');
  });

  it('keeps the count when there is one', () => {
    const error = new WrongCodeError({ url: URL, attemptsRemaining: 3 });
    expect(verificationFailureCopy(error, 'en')).toEqual({
      key: 'verify.error.wrongCode',
      params: { count: 3 },
    });
  });

  it('names no time for a limit the server gave no end to', () => {
    const error = new RateLimitedError({ url: URL, retryAtUtc: null });
    expect(verificationFailureCopy(error, 'en').key).toBe('verify.error.rateLimitedNoTime');
  });

  it('points to Telegram when the backend has no SMS to send the code with', () => {
    const error = new errors.SmsUnavailableError({ url: URL });
    expect(verificationFailureCopy(error, 'en').key).toBe('verify.smsUnavailable');
  });
});

describe('a failed confirm', () => {
  it('says the outcome is unknown after a timeout, because the booking may have committed', () => {
    const failure = bookingFailure(
      new TimeoutError({ url: URL, timeoutMs: 15_000 }),
      YEREVAN,
      'en',
    );
    expect(failure.kind).toBe('unknown');
    expect(failure.line.key).toBe('confirm.error.unknownOutcome');
  });

  it('says the same after a dropped connection, never that nothing was booked', () => {
    expect(bookingFailure(new NetworkError({ url: URL }), YEREVAN, 'en').kind).toBe('unknown');
  });

  it('says the same after a server error that may have come after the commit', () => {
    expect(bookingFailure(new ServerError({ status: 500, url: URL }), YEREVAN, 'en').kind).toBe(
      'unknown',
    );
  });

  it('asks for another tap when the table was merely busy', () => {
    const BusyError = (errors as Record<string, unknown>)['BookingBusyError'] as new (options: {
      url: string;
    }) => Error;
    const failure = bookingFailure(new BusyError({ url: URL }), YEREVAN, 'en');
    expect(failure.kind).toBe('busy');
  });

  it("gives a rule's refusal the table sheet's own sentence", () => {
    const RejectedError = (errors as Record<string, unknown>)[
      'BookingRejectedError'
    ] as new (options: { url: string; reason: string; partySize: number }) => Error;
    const failure = bookingFailure(
      new RejectedError({ url: URL, reason: 'closed', partySize: 2 }),
      YEREVAN,
      'en',
    );
    expect(failure.kind).toBe('rejected');
    expect(failure.line.key).toBe('table.unavailable.closed');
  });
});

describe('the free-cancellation promise', () => {
  const NOW = new Date('2026-09-11T08:00:00Z');

  it('names the day when the deadline is not today', () => {
    const line = freeCancellationCopy('2026-09-20T13:30:00Z', YEREVAN, 'en', NOW);
    expect(line.key).toBe('table.freeCancellationOn');
    expect(line.params['time']).toBe('17:30');
    expect(String(line.params['date'])).not.toBe('');
  });

  it('gives only the time when the deadline is later today', () => {
    const line = freeCancellationCopy('2026-09-11T13:30:00Z', YEREVAN, 'en', NOW);
    expect(line).toEqual({ key: 'table.freeCancellation', params: { time: '17:30' } });
  });

  it('promises nothing when the server stated no deadline', () => {
    const table: TableAvailability = {
      tableId: 't1',
      tableLabel: '7',
      floorAreaName: null,
      seats: 4,
      isBookable: true,
      unavailableReason: null,
      window: null,
      freeCancellationUntilUtc: null,
      requiresApproval: false,
    };
    expect(
      tableCopy(table, { partySize: 2, timeZoneId: YEREVAN, locale: 'en' }).freeCancellation,
    ).toBeNull();
  });
});

describe("the venue's answer, on the booking", () => {
  const waiting = {
    status: 'pendingApproval',
    approvalExpiresAtUtc: '2026-10-18T18:15:00Z',
    declinedBecause: null,
  } as const;

  it('counts down while the venue decides', () => {
    expect(venueAnswerCopy(waiting, new Date('2026-10-18T18:02:19Z'))).toEqual({
      key: 'booking.approval.waiting',
      params: { time: '12:41' },
    });
  });

  it('only says it is waiting once the clock here has run out', () => {
    expect(venueAnswerCopy(waiting, new Date('2026-10-18T18:16:00Z'))).toEqual({
      key: 'booking.approval.checking',
      params: {},
    });
  });

  it('adds nothing to a booking that waits without a clock, or was never in question', () => {
    const now = new Date('2026-10-18T18:00:00Z');
    expect(venueAnswerCopy({ ...waiting, approvalExpiresAtUtc: null }, now)).toBeNull();
    expect(
      venueAnswerCopy(
        { status: 'confirmed', approvalExpiresAtUtc: null, declinedBecause: null },
        now,
      ),
    ).toBeNull();
  });

  it('apologises when nobody answered, and says the venue could not when somebody said no', () => {
    const now = new Date('2026-10-18T18:20:00Z');
    const declined = { status: 'cancelledByVenue', approvalExpiresAtUtc: null } as const;
    expect(venueAnswerCopy({ ...declined, declinedBecause: 'noAnswer' }, now)?.key).toBe(
      'booking.declined.noAnswer',
    );
    expect(venueAnswerCopy({ ...declined, declinedBecause: 'staffDeclined' }, now)?.key).toBe(
      'booking.declined.byVenue',
    );
    // A reason a newer server adds reads as the plain "the venue could not".
    expect(declinedCopy('unknown', 'title')?.key).toBe('booking.declined.byVenueTitle');
    expect(declinedCopy('noAnswer', 'title')?.key).toBe('booking.declined.noAnswerTitle');
    expect(declinedCopy(null, 'title')).toBeNull();
  });
});

describe('the unverified-guests refusals (2026-10-20)', () => {
  const held = {
    reservationId: 'r-1',
    code: 'K7Q2LM',
    startUtc: '2026-10-22T15:30:00Z',
    localDate: '2026-10-22',
    localStartTime: '19:30',
    venueName: 'Café Aram',
    branchName: 'Main',
  };

  it('names the booking a number holds when it is the caller’s own', () => {
    const failure = bookingFailure(
      new errors.PhoneHasActiveBookingError({ url: URL, held }),
      YEREVAN,
      'en',
    );
    expect(failure.kind).toBe('phoneHasActiveBooking');
    expect(failure.line.key).toBe('confirm.error.phoneHasBookingHeld');
    expect(failure.line.params).toMatchObject({ venue: 'Café Aram', time: '19:30' });
    expect(String(failure.line.params['date'])).toMatch(/22/u);
  });

  it('names nothing when the number’s booking is not the caller’s', () => {
    const failure = bookingFailure(
      new errors.PhoneHasActiveBookingError({ url: URL }),
      YEREVAN,
      'en',
    );
    expect(failure).toMatchObject({
      kind: 'phoneHasActiveBooking',
      line: { key: 'confirm.error.phoneHasBooking', params: {} },
    });
  });

  it('says this browser already holds an unverified booking', () => {
    expect(
      bookingFailure(new errors.DeviceHasActiveBookingError({ url: URL }), YEREVAN, 'en'),
    ).toEqual({
      kind: 'deviceHasActiveBooking',
      line: { key: 'confirm.error.deviceHasBooking', params: {} },
    });
  });

  it('gives the cap for a party too large without a verified number', () => {
    expect(
      bookingFailure(
        new errors.UnverifiedPartyTooLargeError({ url: URL, partySize: 8, maxPartySize: 6 }),
        YEREVAN,
        'en',
      ),
    ).toEqual({
      kind: 'unverifiedPartyTooLarge',
      line: { key: 'confirm.error.unverifiedPartyTooLarge', params: { max: 6 } },
    });
  });

  it('says the venue has too many unconfirmed bookings waiting', () => {
    expect(
      bookingFailure(new errors.UnverifiedQueueFullError({ url: URL }), YEREVAN, 'en'),
    ).toEqual({
      kind: 'unverifiedQueueFull',
      line: { key: 'confirm.error.unverifiedQueueFull', params: {} },
    });
  });

  it('words the per-network limit rather than “something went wrong”', () => {
    const { TooManyRequestsError } = errorsBase;
    expect(
      bookingFailure(new TooManyRequestsError({ url: URL, retryAfterSeconds: 600 }), YEREVAN, 'en'),
    ).toEqual({ kind: 'rateLimited', line: { key: 'confirm.error.rateLimited', params: {} } });
  });
});

describe('why a booking waits for the venue', () => {
  const waiting = {
    status: 'pendingApproval',
    approvalExpiresAtUtc: '2026-10-21T10:00:00Z',
    declinedBecause: null,
  } as const;

  it('says the venue confirms bookings made without a verified number', () => {
    expect(pendingReasonCopy({ ...waiting, awaitingApprovalBecause: 'unverifiedPhone' })).toEqual({
      key: 'booking.approval.unverifiedWhy',
      params: {},
    });
  });

  it('keeps the short-notice, earlier-guest and plain sentences', () => {
    expect(pendingReasonCopy({ ...waiting, awaitingApprovalBecause: 'shortNotice' }).key).toBe(
      'booking.approval.why',
    );
    expect(
      pendingReasonCopy({
        ...waiting,
        awaitingApprovalBecause: 'earlierGuestConsent',
        awaitsEarlierGuestAnswer: false,
      }).key,
    ).toBe('booking.approval.venueAsksEarlierGuest');
    expect(
      pendingReasonCopy({ ...waiting, awaitingApprovalBecause: 'earlierGuestConsent' }).key,
    ).toBe('table.requestable.earlierGuest');
    expect(pendingReasonCopy({ ...waiting, approvalExpiresAtUtc: null }).key).toBe(
      'success.pendingBody',
    );
  });
});
