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
 */
export function confirmState(input: {
  readonly offline: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly table: TableAvailability | null;
}): ConfirmState {
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
