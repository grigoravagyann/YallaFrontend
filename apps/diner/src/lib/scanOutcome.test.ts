import {
  BookingEndedError,
  BookingNotActiveError,
  BookingNotFoundError,
  BookingTooEarlyError,
  InviteExpiredError,
  NetworkError,
  TabsNotEnabledError,
  TimeoutError,
  type BookingStatus,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { gateFor, scanFailureFor, scanWasRefused } from './scanOutcome';

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

    // Pinned to the booking's own day: a bare clock time is only the whole
    // answer when "from 19:10" can only mean today. See the test below.
    const failure = scanFailureFor(early, {
      timeZoneId: 'Asia/Yerevan',
      locale: 'en',
      now: new Date('2026-09-20T10:00:00Z'),
    });

    expect(failure.key).toBe('scan.error.bookingTooEarly');
    // 15:10Z is 19:10 in Yerevan. Rendering it in the phone's zone would tell a
    // diner who flew in this morning the wrong time for their own table.
    expect(failure.params?.['time']).toMatch(/19[:.]10/u);
  });

  it('names the day too when the booking is not today', () => {
    // "I'm at my table" is offered on a booking any number of days out — it is
    // deliberately not narrowed to a window before the start, because only the
    // server knows when the branch starts holding the table. So a diner looking
    // at next Sunday's booking taps it and must not be told "from 19:10", which
    // reads as tonight.
    const early = new BookingTooEarlyError({ ...facts, earliestUtc: '2026-09-20T15:10:00Z' });

    const failure = scanFailureFor(early, {
      timeZoneId: 'Asia/Yerevan',
      locale: 'en',
      now: new Date('2026-09-17T12:00:00Z'),
    });

    expect(failure.key).toBe('scan.error.bookingTooEarlyOnDay');
    expect(failure.params?.['time']).toMatch(/19[:.]10/u);
    expect(failure.params?.['date']).toMatch(/20/u);
  });

  it('reads "today" on the branch’s calendar, not UTC’s', () => {
    // Just past midnight in Yerevan (21:00Z is 01:00 on the 21st), looking at a
    // booking that evening (15:10Z is 19:10 on the 21st). Both are the 21st
    // where the diner is standing, so it is today and the hour alone is the
    // whole answer — but they are two different days in UTC, so a comparison
    // made there would put a needless date in front of somebody in the venue.
    const early = new BookingTooEarlyError({ ...facts, earliestUtc: '2026-09-21T15:10:00Z' });

    const failure = scanFailureFor(early, {
      timeZoneId: 'Asia/Yerevan',
      locale: 'en',
      now: new Date('2026-09-20T21:00:00Z'),
    });

    expect(failure.key).toBe('scan.error.bookingTooEarly');
  });

  it('still says the booking is not open yet when it has no zone to say it in', () => {
    // The scan screen has no booking in hand, so it has no branch zone. It must
    // drop the time rather than render it in whatever zone the phone is on.
    const early = new BookingTooEarlyError({ ...facts, earliestUtc: '2026-09-20T15:10:00Z' });
    expect(scanFailureFor(early).key).toBe('scan.error.bookingTooEarlyNoTime');
  });

  it('tells an ended booking from one that was never going to work', () => {
    expect(scanFailureFor(new BookingEndedError(facts)).key).toBe('scan.error.bookingEnded');
  });

  it('says which kind of not-live the booking is, because they are different news', () => {
    // The state is carried all the way from the wire for this and only this.
    // Collapsing them tells a diner whose booking the venue has simply not
    // confirmed yet to go and find a member of staff, when the answer is that
    // there is nothing to find yet.
    const keyFor = (status: BookingStatus): string =>
      scanFailureFor(new BookingNotActiveError({ ...facts, status })).key;

    expect(keyFor('pendingApproval')).toBe('scan.error.bookingPending');
    expect(keyFor('cancelledByDiner')).toBe('scan.error.bookingCancelledByYou');
    expect(keyFor('cancelledByVenue')).toBe('scan.error.bookingCancelledByVenue');
    expect(keyFor('noShow')).toBe('scan.error.bookingNoShow');

    // "You cancelled this" and "the venue cancelled this" must not be one line.
    expect(keyFor('cancelledByDiner')).not.toBe(keyFor('cancelledByVenue'));
  });

  it('falls back to the general sentence for a state this build does not know', () => {
    // `unknown` exists so an old build does not break on a state added later.
    expect(scanFailureFor(new BookingNotActiveError({ ...facts, status: 'unknown' })).key).toBe(
      'scan.error.bookingNotActive',
    );
    // And for a refusal that arrived with no state at all.
    expect(scanFailureFor(new BookingNotActiveError(facts)).key).toBe(
      'scan.error.bookingNotActive',
    );
  });

  it('treats every one of them as a definite refusal, so the command id is dropped', () => {
    expect(scanWasRefused(new BookingNotFoundError({ url: bookingUrl }))).toBe(true);
    expect(scanWasRefused(new BookingEndedError(facts))).toBe(true);
  });
});

describe('a code that needs a session', () => {
  it('holds a booking code back until the diner confirms their number', () => {
    const gate = gateFor({ kind: 'booking', code: 'DFJFQY' }, false);

    expect(gate.kind).toBe('signIn');
    expect(gate.kind === 'signIn' && gate.failure.key).toBe('scan.error.signInNeeded');
  });

  it('never asks for a number for the codes that do not have an account behind them', () => {
    // The whole promise of the scan screen: "No sign-up and no phone number."
    // Six mistyped characters of the code alphabet must not turn that into an
    // SMS — and a table's printed token is 32 hex characters, so anything six
    // long that reaches here is a typo or a booking code.
    expect(gateFor({ kind: 'table', code: 'a3f09c1e' }, false).kind).toBe('send');
    expect(gateFor({ kind: 'invite', token: 'Zx9_Ab-12' }, false).kind).toBe('send');
  });

  it('lets a signed-in diner’s booking code straight through', () => {
    expect(gateFor({ kind: 'booking', code: 'DFJFQY' }, true).kind).toBe('send');
  });
});
