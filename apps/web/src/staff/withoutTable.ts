import { stillToSeat, type BookingWithoutTable, type FloorTable } from '@yalla/api';
import type { CommandState } from './commands/types';

/**
 * Booking by time only at the door (2026-10-29): which bookings the rail
 * lists, which tables the waiter is offered to seat one at, and in what order.
 *
 * Pure, so the rules are tested without a tablet. The floor shows a booking
 * with no table until somebody seats it; the waiter chooses the table, and
 * the server gives the booking that table from then on.
 */

/**
 * How far ahead the rail lists them: the rail is "Now", and a party due in
 * three hours is not at the door. A later one joins the list as it nears.
 */
export const ARRIVING_AHEAD_MS = 3 * 60 * 60_000;

/** Due now, for the Now tab's count: started, or starting within a quarter of an hour. */
export const DUE_NOW_MS = 15 * 60_000;

/**
 * The bookings for the rail: still to seat, starting within
 * {@link ARRIVING_AHEAD_MS} (or already started), and not being seated from
 * this tablet right now — soonest first.
 */
export function arrivingBookings(
  bookings: readonly BookingWithoutTable[] | null | undefined,
  now: Date,
  seating: ReadonlySet<string>,
): readonly BookingWithoutTable[] {
  if (!bookings) return [];
  const until = now.getTime() + ARRIVING_AHEAD_MS;
  return bookings
    .filter(
      (booking) =>
        !seating.has(booking.id) &&
        stillToSeat(booking, now) &&
        Date.parse(booking.startUtc) <= until,
    )
    .slice()
    .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
}

/** How many of them are due now: what the Now tab counts. */
export function dueNowCount(bookings: readonly BookingWithoutTable[], now: Date): number {
  const by = now.getTime() + DUE_NOW_MS;
  return bookings.filter((booking) => Date.parse(booking.startUtc) <= by).length;
}

/**
 * The bookings this tablet has sent (or still holds) a seat for: off the
 * list at once, rather than offered to seat a second time while the command
 * is on its way. A seat the server refused sits in the conflicts list, and
 * the booking comes back once that is dropped.
 */
export function seatingReservationIds(state: CommandState): ReadonlySet<string> {
  const ids = new Set<string>();
  const commands = [...state.queue, ...state.conflicts.map((entry) => entry.command)];
  for (const command of commands) {
    if (command.body.kind !== 'seatReservation') continue;
    const reservationId = command.body.command.reservationId;
    if (reservationId) ids.add(reservationId);
  }
  return ids;
}

/** One table the waiter may seat the party at. */
export interface TableChoice {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  readonly roomName: string | null;
  /**
   * Its own booking later on — free now, booked at 21:00 — or `null`. Still
   * offered: the waiter knows whether this party will be gone by then.
   */
  readonly bookedAtUtc: string | null;
}

/** The tables to offer, split by whether the party fits. */
export interface TableChoices {
  /** Enough seats, closest fit first, a table with no booking later before one with. */
  readonly fit: readonly TableChoice[];
  /** Too few seats — offered after, for a waiter who pushes two together. */
  readonly smaller: readonly TableChoice[];
}

/**
 * The free tables, from the floor as this tablet draws it (its unsent
 * commands applied): free now, or free with a booking later. Held, occupied
 * and out-of-service tables are not offered.
 */
export function tableChoices(tables: readonly FloorTable[], partySize: number): TableChoices {
  const free = tables
    .filter((table) => table.state === 'free' || table.state === 'reservedSoon')
    .map((table): TableChoice => ({
      tableId: table.id,
      label: table.label,
      seats: table.seats,
      roomName: table.floorAreaName,
      bookedAtUtc: table.state === 'reservedSoon' ? table.nextReservationStartUtc : null,
    }));
  const byLabel = (a: TableChoice, b: TableChoice) =>
    a.label.localeCompare(b.label, undefined, { numeric: true });
  const fit = free
    .filter((choice) => choice.seats >= partySize)
    .sort(
      (a, b) =>
        Number(a.bookedAtUtc !== null) - Number(b.bookedAtUtc !== null) ||
        a.seats - b.seats ||
        byLabel(a, b),
    );
  const smaller = free
    .filter((choice) => choice.seats < partySize)
    .sort((a, b) => b.seats - a.seats || byLabel(a, b));
  return { fit, smaller };
}
