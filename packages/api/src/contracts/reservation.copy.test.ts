import { describe, expect, it } from 'vitest';
import { NetworkError, ServerError, TimeoutError } from '../errors';
import type { TableAvailability } from './booking';
import * as errors from './errors';
import { RateLimitedError, WrongCodeError } from './errors';
import {
  bookingFailure,
  freeCancellationCopy,
  tableCopy,
  verificationFailureCopy,
} from './reservation';

/**
 * What the two booking surfaces say, pinned where the rule lives.
 */

const URL = 'https://api.test.yalla.am/api/reservations';
const YEREVAN = 'Asia/Yerevan';

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
