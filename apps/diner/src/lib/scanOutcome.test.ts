import {
  BookingEndedError,
  BookingNotActiveError,
  BookingNotFoundError,
  BookingTooEarlyError,
  InviteExpiredError,
  NetworkError,
  TabsNotEnabledError,
  TimeoutError,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { scanFailureFor, scanWasRefused } from './scanOutcome';

const url = 'https://api.test/api/tabs/open';

describe('a scan that did not work', () => {
  it('says ordering is not switched on here, rather than "try again"', () => {
    expect(scanFailureFor(new TabsNotEnabledError({ url })).key).toBe('scan.error.notEnabled');
  });

  it('says an invitation has expired, so the host makes a new one', () => {
    expect(scanFailureFor(new InviteExpiredError({ url })).key).toBe('join.error.expired');
  });

  it('does not claim nothing was opened after a timeout', () => {
    expect(scanFailureFor(new TimeoutError({ url, timeoutMs: 15_000 })).key).toBe(
      'scan.error.uncertain',
    );
    // And keeps the command, so scanning again replays rather than opens twice.
    expect(scanWasRefused(new TimeoutError({ url, timeoutMs: 15_000 }))).toBe(false);
    expect(scanWasRefused(new NetworkError({ url }))).toBe(true);
  });
});

describe('a booking code that did not open a tab', () => {
  const bookingUrl = 'https://api.test/api/tabs/open-by-booking';
  const facts = {
    url: bookingUrl,
    reservationId: 'r1',
    startUtc: '2026-09-20T15:30:00Z',
    endUtc: '2026-09-20T17:00:00Z',
  };

  it('never says "that is not a table" about a booking code', () => {
    // The whole bug: a booking code answered as though it were a bad sticker.
    const failure = scanFailureFor(new BookingNotFoundError({ url: bookingUrl }));
    expect(failure.key).toBe('scan.error.bookingNotFound');
    expect(failure.key).not.toBe('scan.error.unknownCode');
  });

  it('says when the table opens, in the branch’s own zone', () => {
    const early = new BookingTooEarlyError({ ...facts, earliestUtc: '2026-09-20T15:10:00Z' });

    const failure = scanFailureFor(early, { timeZoneId: 'Asia/Yerevan', locale: 'en' });

    expect(failure.key).toBe('scan.error.bookingTooEarly');
    // 15:10Z is 19:10 in Yerevan. Rendering it in the phone's zone would tell a
    // diner who flew in this morning the wrong time for their own table.
    expect(failure.params?.['time']).toMatch(/19[:.]10/u);
  });

  it('still says the booking is not open yet when it has no zone to say it in', () => {
    // The scan screen has no booking in hand, so it has no branch zone. It must
    // drop the time rather than render it in whatever zone the phone is on.
    const early = new BookingTooEarlyError({ ...facts, earliestUtc: '2026-09-20T15:10:00Z' });
    expect(scanFailureFor(early).key).toBe('scan.error.bookingTooEarlyNoTime');
  });

  it('tells an ended booking from one that was never going to work', () => {
    expect(scanFailureFor(new BookingEndedError(facts)).key).toBe('scan.error.bookingEnded');
    expect(
      scanFailureFor(new BookingNotActiveError({ ...facts, status: 'cancelledByVenue' })).key,
    ).toBe('scan.error.bookingNotActive');
  });

  it('treats every one of them as a definite refusal, so the command id is dropped', () => {
    expect(scanWasRefused(new BookingNotFoundError({ url: bookingUrl }))).toBe(true);
    expect(scanWasRefused(new BookingEndedError(facts))).toBe(true);
  });
});
