import { describeFailure } from '@yalla/api';

/**
 * What "My bookings" says when the read fails — by what went wrong.
 *
 * It said "You are offline." for every error: a signed-out diner was told to
 * check their signal, and so was one looking at a server error.
 */
export interface BookingsFailureCopy {
  readonly titleKey: string;
  readonly bodyKey: string | null;
  /** Signed out needs a number confirmed, not a retry. */
  readonly action: 'retry' | 'verify';
}

export function bookingsFailureCopy(error: unknown, offline = false): BookingsFailureCopy {
  const kind = offline ? 'offline' : describeFailure(error);
  switch (kind) {
    case 'offline':
      return { titleKey: 'net.offline', bodyKey: 'net.offlineBody', action: 'retry' };
    case 'unauthorized':
      return {
        titleKey: 'bookings.signedOut.title',
        bodyKey: 'bookings.signedOut.body',
        action: 'verify',
      };
    default:
      return { titleKey: 'net.serverError', bodyKey: null, action: 'retry' };
  }
}
