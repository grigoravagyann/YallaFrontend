import { promisedFreeByCopy, type Booking, type CopyLine } from '@yalla/api';
import { formatTime, type Locale } from '@yalla/format';

/**
 * "4 · Hall" — the table and the room it is in, which is how a diner finds it
 * once through the door. Just the table when the server named no room.
 */
export function tableWithRoom(booking: Pick<Booking, 'tableLabel' | 'roomName'>): string {
  const room = booking.roomName?.trim();
  return room ? `${booking.tableLabel} · ${room}` : booking.tableLabel;
}

/**
 * What "Share" sends: the table (and its room, when known), the place, the
 * time and the code — one sentence a friend can act on.
 */
export function bookingShareLine(
  booking: Pick<Booking, 'tableLabel' | 'roomName' | 'branchName' | 'code'>,
  venue: string,
  time: string,
): CopyLine {
  const room = booking.roomName?.trim();
  const params = {
    table: booking.tableLabel,
    venue,
    branch: booking.branchName,
    time,
    code: booking.code,
  };
  return room
    ? { key: 'success.shareMessageRoom', params: { ...params, room } }
    : { key: 'success.shareMessage', params };
}

/**
 * When the sitting ends, on the booking: "Until 19:30" — and the promise to
 * free the table beside it when that is a different time. A promise sooner
 * than the end cuts the end to it (the server's rule), so the end says it;
 * a later one never lengthens the sitting: the booking still ends at 19:30,
 * with "You will free the table by 19:40" beside it.
 */
export function sittingEndLines(
  booking: Pick<Booking, 'endUtc' | 'timeZoneId' | 'promisedFreeByUtc'>,
  locale: Locale,
): readonly CopyLine[] {
  const until: CopyLine = {
    key: 'bookings.detail.until',
    params: { time: formatTime(booking.endUtc, booking.timeZoneId, locale) },
  };
  const promised = booking.promisedFreeByUtc ?? null;
  if (!promised || Date.parse(promised) === Date.parse(booking.endUtc)) return [until];
  const promise = promisedFreeByCopy(promised, booking.timeZoneId, locale);
  return promise ? [until, promise] : [until];
}
