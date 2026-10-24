import type { StaffFloor } from '@yalla/api';

/** How far ahead "In the next hour" looks. */
export const NEXT_HOUR_MS = 60 * 60_000;
/**
 * And how far back: a party due a quarter of an hour ago and not seated is
 * still the one the waiter is watching the door for.
 */
export const NEXT_HOUR_BACK_MS = 30 * 60_000;

/** What the guest last said about coming, as the row words it. */
export type ArrivalState =
  | { readonly kind: 'late'; readonly minutes: number }
  | { readonly kind: 'coming' }
  | { readonly kind: 'asked' }
  | { readonly kind: 'overdue' }
  | { readonly kind: 'none' };

export interface UpcomingBooking {
  readonly reservationId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly startUtc: string;
  readonly partySize: number | null;
  readonly arrival: ArrivalState;
}

/**
 * The phone's "In the next hour" (the Now artboard): each table's next
 * booking that starts within the hour — or started in the last half hour and
 * nobody has sat down for it — earliest first, with whether the guest said
 * they are coming.
 *
 * Read off the floor the screen already holds, never a read of its own: the
 * floor is what is live, and a second list would disagree with the tiles.
 */
export function upcomingBookings(
  floor: StaffFloor | null | undefined,
  now: Date,
): readonly UpcomingBooking[] {
  if (!floor) return [];
  const at = now.getTime();
  const labels = new Map(floor.plan.tables.map((table) => [table.id, table.label]));
  const rows: UpcomingBooking[] = [];
  for (const detail of floor.details) {
    if (!detail.nextReservationId || !detail.nextReservationStartUtc) continue;
    const start = Date.parse(detail.nextReservationStartUtc);
    if (Number.isNaN(start)) continue;
    if (start > at + NEXT_HOUR_MS || start < at - NEXT_HOUR_BACK_MS) continue;
    rows.push({
      reservationId: detail.nextReservationId,
      tableId: detail.tableId,
      tableLabel: labels.get(detail.tableId) ?? detail.label,
      startUtc: detail.nextReservationStartUtc,
      partySize: detail.nextReservationPartySize,
      arrival: arrivalOf(detail, start, at),
    });
  }
  return rows.sort(
    (a, b) =>
      Date.parse(a.startUtc) - Date.parse(b.startUtc) ||
      a.tableLabel.localeCompare(b.tableLabel, undefined, { numeric: true }),
  );
}

function arrivalOf(detail: StaffFloor['details'][number], start: number, at: number): ArrivalState {
  const late = detail.nextReservationGuestRunningLateMinutes ?? null;
  if (late !== null && late > 0) return { kind: 'late', minutes: late };
  if (detail.nextReservationGuestConfirmedOnWayAtUtc) return { kind: 'coming' };
  if (start <= at) return { kind: 'overdue' };
  if (detail.nextReservationStaffAskedOnMyWayAtUtc) return { kind: 'asked' };
  return { kind: 'none' };
}
