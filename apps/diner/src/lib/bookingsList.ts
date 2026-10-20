import { awaitsVenueAnswer, describeFailure, type Booking } from '@yalla/api';

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

/**
 * The account's own bookings, and the ones somebody else made with its number
 * and no proof (2026-10-20) — listed apart, "made with your number, not by
 * you", each with Cancel. They never hold the account back from booking.
 */
export function madeWithYourNumber<B extends Pick<Booking, 'madeWithYourNumber'>>(
  bookings: readonly B[],
): { readonly own: readonly B[]; readonly strangers: readonly B[] } {
  return {
    own: bookings.filter((booking) => booking.madeWithYourNumber !== true),
    strangers: bookings.filter((booking) => booking.madeWithYourNumber === true),
  };
}

/**
 * Whether the list should be read again at the venue's-answer cadence: one of
 * the account's *own* bookings waits on the venue with a clock. Somebody
 * else's made with its number may wait a day, and is not worth the reads.
 */
export function waitsOnOwnVenueAnswer(bookings: readonly Booking[]): boolean {
  return bookings.some(
    (booking) => booking.madeWithYourNumber !== true && awaitsVenueAnswer(booking),
  );
}

/** Past this, a countdown in hours stops meaning much: the chip shows the day instead. */
export const COUNTDOWN_HORIZON_MS = 24 * 3_600_000;

/**
 * The chip on the next booking's photo — "in 2 h 15 min" — as a key and its
 * values, or `date` when it is more than a day away, or `null` once the time
 * has come (the status badge beside it says the rest).
 *
 * Minutes round up, so the chip says "in 1 min" until the table is theirs,
 * never "in 0 min".
 */
export type BookingCountdown =
  | {
      readonly kind: 'soon';
      readonly key:
        | 'bookings.countdown.hoursMinutes'
        | 'bookings.countdown.hours'
        | 'bookings.countdown.minutes';
      readonly params: { readonly hours?: number; readonly minutes?: number };
    }
  | { readonly kind: 'date' };

export function bookingCountdown(slotUtc: string, now: Date): BookingCountdown | null {
  const left = Date.parse(slotUtc) - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return null;
  if (left > COUNTDOWN_HORIZON_MS) return { kind: 'date' };
  const total = Math.ceil(left / 60_000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return { kind: 'soon', key: 'bookings.countdown.minutes', params: { minutes } };
  if (minutes === 0) return { kind: 'soon', key: 'bookings.countdown.hours', params: { hours } };
  return { kind: 'soon', key: 'bookings.countdown.hoursMinutes', params: { hours, minutes } };
}
