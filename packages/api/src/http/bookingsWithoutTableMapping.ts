import type { BookingWithoutTable } from '../contracts/bookingsWithoutTable';
import type { components } from '../generated/schema';
import { guestRecordFromWire } from './guestRecordMapping';

/**
 * One booking as every client sees it: the branch list's row — with the
 * members the staff-bookings branch adds (`channel`, `takenByName`), read
 * leniently until the schema is regenerated from it.
 */
export type WireReservationView =
  components['schemas']['Yalla.Application.Reservations.ReservationView'] & {
    readonly channel?: number | null | undefined;
    readonly takenByStaffId?: string | null | undefined;
    readonly takenByName?: string | null | undefined;
  };

/** `ReservationChannel`: 0 Unknown, 1 App, 2 Web, 3 Staff. */
const CHANNEL: Readonly<Record<number, NonNullable<BookingWithoutTable['channel']>>> = {
  1: 'app',
  2: 'web',
  3: 'staff',
};

function blank(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

/**
 * Whether a booking on the branch's list is one the floor seats by choosing a
 * table: made by time only, and with no table yet. Once seated it carries its
 * table and is on that table's tile like any other.
 */
export function waitsForTable(view: WireReservationView): boolean {
  return view.bookedWithoutTable === true && !view.tableId;
}

export function bookingWithoutTableFromWire(view: WireReservationView): BookingWithoutTable {
  return {
    id: view.id,
    code: view.code,
    guestName: view.guestName,
    guestPhone: view.guestPhone?.trim() ?? '',
    partySize: view.partySize,
    startUtc: view.startUtc,
    endUtc: view.endUtc,
    localDate: view.localDate,
    localStartTime: view.localStartTime,
    note: blank(view.note),
    phoneUnverified: view.phoneUnverified === true,
    guestRecord: guestRecordFromWire(view.guestRecord),
    guestConfirmedOnWayAtUtc: view.guestConfirmedOnWayAtUtc ?? null,
    guestRunningLateMinutes: view.guestRunningLateMinutes ?? null,
    // Staff-taken (2026-10-31): said only when the server says it.
    ...(typeof view.channel === 'number'
      ? { channel: CHANNEL[view.channel] ?? 'unknown', takenByName: blank(view.takenByName) }
      : {}),
  };
}
