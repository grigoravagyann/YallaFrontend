import { NetworkError, ServerError, UnauthorizedError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { bookingCountdown, bookingsFailureCopy } from './bookingsList';

const url = 'https://api.test/api/reservations/mine';

describe('my bookings, failing', () => {
  it('sends a signed-out diner to confirm their number, not to check their signal', () => {
    expect(bookingsFailureCopy(new UnauthorizedError({ url }))).toEqual({
      titleKey: 'bookings.signedOut.title',
      bodyKey: 'bookings.signedOut.body',
      action: 'verify',
    });
  });

  it('calls a server failure a server failure', () => {
    expect(bookingsFailureCopy(new ServerError({ status: 500, url })).titleKey).toBe(
      'net.serverError',
    );
  });

  it('keeps offline for when the phone is actually offline', () => {
    expect(bookingsFailureCopy(new NetworkError({ url })).titleKey).toBe('net.offline');
    expect(bookingsFailureCopy(undefined, true).titleKey).toBe('net.offline');
  });
});

describe('the countdown on the next booking', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

  it('says hours and minutes within the day', () => {
    expect(bookingCountdown(at(135), now)).toEqual({
      kind: 'soon',
      key: 'bookings.countdown.hoursMinutes',
      params: { hours: 2, minutes: 15 },
    });
  });

  it('drops the empty half', () => {
    expect(bookingCountdown(at(120), now)).toMatchObject({
      key: 'bookings.countdown.hours',
      params: { hours: 2 },
    });
    expect(bookingCountdown(at(40), now)).toMatchObject({
      key: 'bookings.countdown.minutes',
      params: { minutes: 40 },
    });
  });

  it('rounds up, so the last seconds still read "in 1 min"', () => {
    expect(bookingCountdown(new Date(now.getTime() + 5_000).toISOString(), now)).toMatchObject({
      params: { minutes: 1 },
    });
  });

  it('shows the day once it is more than a day away', () => {
    expect(bookingCountdown(at(24 * 60), now)).toMatchObject({ params: { hours: 24 } });
    expect(bookingCountdown(at(24 * 60 + 1), now)).toEqual({ kind: 'date' });
  });

  it('says nothing once the time has come', () => {
    expect(bookingCountdown(at(0), now)).toBeNull();
    expect(bookingCountdown(at(-30), now)).toBeNull();
    expect(bookingCountdown('not a time', now)).toBeNull();
  });
});
