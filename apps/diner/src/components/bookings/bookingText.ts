import type { Booking, CopyLine } from '@yalla/api';

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
