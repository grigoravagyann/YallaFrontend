import type { TableUnavailableReason } from './booking';
import type { ReservationStatusCode } from './push';

/**
 * Bookings taken by hand on the floor (2026-10-31, "Ձեռքով ամրագրում").
 *
 * A member of staff — waiter, manager, general manager, owner — adds a booking
 * from the tablet or their phone: a guest's name and number, how many, when,
 * a table or none. It is confirmed at once (`channel: 'staff'`), linked to the
 * person who took it (`takenByStaffId`), and that person follows up: thirty
 * minutes before the start the floor reminds them to call the guest and asks
 * whether the guest is coming. "Coming" is recorded on the booking; "not
 * coming" lets it go the ordinary way (`releaseReservation`, the guest told
 * us). Nothing here reaches the guest's phone — there is no app behind a
 * booking taken over the counter — so the floor's own "ask: are you coming?"
 * is never offered for one.
 *
 * Every shape is the wire's (Yalla `docs/reservations.md`, staff-taken
 * bookings), camelCase.
 */

/** How the branch books: a table on the room's photos, or a time and a party only. */
export type StaffBookingMode = 'chooseTable' | 'timeOnly';

/** One free table at one time, as the sheet offers it. */
export interface StaffDaySlotTable {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  readonly roomName: string | null;
}

/** One start time on the day, for the party asked about. */
export interface StaffDaySlot {
  /** `HH:mm`, the branch's wall clock. */
  readonly time: string;
  /** The same moment as an instant. */
  readonly slotUtc: string;
  /** The time can be booked for this party: a free table, or room enough at a time-only branch. */
  readonly isAvailable: boolean;
  /** Why not, when not; `null` when available. */
  readonly unavailableReason: TableUnavailableReason | null;
  /**
   * The in-service tables free for the whole sitting that seat the party —
   * staff may book any of them, pinned or not. Empty at a branch that books
   * by time only, which answers in {@link guestsLeft}.
   */
  readonly tables: readonly StaffDaySlotTable[];
  /** At a time-only branch: how many more guests fit then. `null` where tables are chosen. */
  readonly guestsLeft: number | null;
}

/**
 * The day's times for one party size, with the staff rules —
 * `GET /api/branches/{branchId}/reservations/slots?date&party`: every
 * in-service table, no lead time, no visibility gate. The venue's own
 * opening hours, booking window and the tables' evenings still hold.
 */
export interface StaffDaySlots {
  readonly branchId: string;
  /** `YYYY-MM-DD`, the branch's calendar. */
  readonly date: string;
  readonly partySize: number;
  readonly bookingMode: StaffBookingMode;
  /** Minutes between listed times: fifteen. */
  readonly stepMinutes: number;
  /** The whole day refused — shut, past, or further out than the branch books. */
  readonly unavailableReason: TableUnavailableReason | null;
  /** Earliest first. A time the branch is shut for is left out. */
  readonly slots: readonly StaffDaySlot[];
}

export interface StaffDaySlotsQuery {
  readonly branchId: string;
  /** `YYYY-MM-DD`, the branch's calendar. */
  readonly date: string;
  readonly partySize: number;
}

/** The server's bound on a party, as on every booking request. */
export const STAFF_BOOKING_MAX_PARTY = 100;

/** `POST /api/branches/{branchId}/reservations/staff`. */
export interface CreateStaffBookingCommand {
  readonly branchId: string;
  /** Required, at most 200 characters. */
  readonly guestName: string;
  /** Required, at most 32 characters: the number the taker calls. */
  readonly guestPhone: string;
  /** 1 to {@link STAFF_BOOKING_MAX_PARTY}. */
  readonly partySize: number;
  /** `YYYY-MM-DD`, the branch's calendar. */
  readonly date: string;
  /** `HH:mm`, the branch's clock. */
  readonly time: string;
  /** Required where the branch books tables; `null` at a time-only branch. */
  readonly tableId: string | null;
  readonly note?: string | null | undefined;
  /** One per tap, reused on a retry: a second send answers the same booking. */
  readonly clientCommandId: string;
}

/**
 * A booking as the staff routes answer it (`ReservationView`, the parts the
 * floor reads): the one just taken, and the one whose guest said they are
 * coming.
 */
export interface StaffBooking {
  readonly id: string;
  /** The short code the guest quotes at the door. */
  readonly code: string;
  readonly status: ReservationStatusCode;
  readonly guestName: string;
  /** E.164 as stored, for a `tel:` link; empty when the server sends none. */
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  readonly endUtc: string;
  /** `YYYY-MM-DD`, the branch's day. */
  readonly localDate: string;
  /** `HH:mm:ss`, the branch's clock. */
  readonly localStartTime: string;
  /** `null`, with the label, for one made without a table (time-only branch). */
  readonly tableId: string | null;
  readonly tableLabel: string | null;
  readonly bookedWithoutTable: boolean;
  readonly note: string | null;
  /** Where it came from: `staff` for one taken here. */
  readonly channel: 'app' | 'web' | 'staff' | 'unknown';
  /** Who took it, when staff did; `null` for a guest's own booking. */
  readonly takenByStaffId: string | null;
  readonly takenByName: string | null;
  /** When "coming" was recorded — by the guest in the app, or by staff here. */
  readonly guestConfirmedOnWayAtUtc: string | null;
  /** True when the command had been applied already and the booking came back as it stands. */
  readonly wasReplay: boolean;
}

/**
 * One row of `GET /api/branches/{branchId}/reservations/to-call`: a confirmed
 * staff-taken booking in its call window — from thirty minutes before the
 * start until the branch's grace after it — whose guest has not been recorded
 * as coming, and that nobody let go.
 */
export interface BookingToCall {
  readonly reservationId: string;
  readonly code: string;
  readonly guestName: string;
  /** E.164, for the `tel:` link; empty when the server sends none. */
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  /** `YYYY-MM-DD`, the branch's day. */
  readonly localDate: string;
  /** `HH:mm:ss`, the branch's clock. */
  readonly localStartTime: string;
  /** `null`, with the label, for one made without a table. */
  readonly tableId: string | null;
  readonly tableLabel: string | null;
  readonly note: string | null;
  readonly takenByStaffId: string | null;
  readonly takenByName: string | null;
  /** The signed-in person took it: listed first, badged. */
  readonly isMine: boolean;
}

/** `POST /api/reservations/{id}/guest-coming`. */
export interface MarkGuestComingCommand {
  readonly reservationId: string;
  /** One per tap, reused on a retry. */
  readonly clientCommandId: string;
}

// ---------------------------------------------------------------------------
// The rules, as the screens and the mocks read them
// ---------------------------------------------------------------------------

/** The taker is reminded this many minutes before the start, and the row joins the list then. */
export const TO_CALL_MINUTES_BEFORE = 30;

/** How often the floor reads the list while nothing on the change stream says so. */
export const TO_CALL_POLL_MS = 30_000;

/**
 * Whether a staff-taken booking is in its call window now: from thirty
 * minutes before the start until `graceMinutes` after it (the branch's hold
 * when that is later — the server decides; this is the screen's mirror).
 */
export function inToCallWindow(startUtc: string, now: Date, graceMinutes: number): boolean {
  const start = Date.parse(startUtc);
  if (Number.isNaN(start)) return false;
  const t = now.getTime();
  return t >= start - TO_CALL_MINUTES_BEFORE * 60_000 && t < start + graceMinutes * 60_000;
}

/** The list's order: the signed-in person's own bookings first, then soonest first. */
export function toCallOrder(rows: readonly BookingToCall[]): readonly BookingToCall[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.isMine) - Number(a.isMine) || Date.parse(a.startUtc) - Date.parse(b.startUtc),
  );
}

/** A booking the floor shows as staff-taken: its channel says so. */
export function isStaffTaken(booking: { readonly channel?: string | undefined }): boolean {
  return booking.channel === 'staff';
}
