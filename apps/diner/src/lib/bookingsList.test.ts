import { NetworkError, ServerError, UnauthorizedError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { bookingsFailureCopy } from './bookingsList';

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
