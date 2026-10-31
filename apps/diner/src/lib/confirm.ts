import type { TableAvailability } from '@yalla/api';

/**
 * What the confirm screen can honestly show, and when Confirm may be pressed.
 */

export type ConfirmState = 'offline' | 'loading' | 'error' | 'missing' | 'unavailable' | 'ready';

/**
 * The table's answer for this slot, as a state.
 *
 * Confirm used to render an empty window and an enabled button while the table
 * was still loading, after the read failed, and when the table had become
 * unbookable — so the diner could press it on a table that could not be had.
 *
 * A booking by time only (`byTime`, 2026-10-29) has no table to wait for: it
 * is ready once the branch's zone is known, and the server judges the time.
 */
export function confirmState(input: {
  readonly offline: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly table: TableAvailability | null;
  readonly byTime?: boolean;
}): ConfirmState {
  if (input.byTime) {
    if (input.offline) return 'offline';
    if (input.isLoading) return 'loading';
    return input.isError ? 'error' : 'ready';
  }
  if (input.table) return input.table.isBookable ? 'ready' : 'unavailable';
  if (input.offline) return 'offline';
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return 'missing';
}

/** Confirm is pressable for a bookable table, with a name, and nothing in flight. */
export function canSubmit(input: {
  readonly state: ConfirmState;
  readonly guestName: string;
  readonly pending: boolean;
}): boolean {
  return input.state === 'ready' && input.guestName.trim().length > 0 && !input.pending;
}

/** The server's limit on `CreateReservationRequest.guestName`. */
export const GUEST_NAME_MAX_LENGTH = 200;

/**
 * The time the diner must agree to free the table by, when a booking follows:
 * the server's, once a refusal named it — it is newer than any room on screen,
 * and the room re-read after it may still lag — else the room's. Keyed by the
 * caller to the time, table and party it was said for.
 *
 * Without the server's word winning, a yes to its time was checked against
 * the room's older one, asked again, sent, and refused again: a ping-pong.
 */
export function freeByNeeded(input: {
  readonly server: string | null;
  readonly table: string | null;
}): string | null {
  return input.server ?? input.table;
}

/**
 * Whether the agreed time answers the one needed: the same instant to the
 * minute, as the server compares it — never the same string. The server
 * writes `…:00Z`, the room's mapping `…:00.000Z`; compared as strings the
 * agreed time never matched and the diner was asked again.
 */
export function freeByAnswered(agreed: string | null, needed: string | null): boolean {
  if (needed === null) return true;
  if (agreed === null) return false;
  const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);
  return minute(agreed) === minute(needed);
}
