import {
  MAX_ACTIVE_BOOKINGS_PER_NUMBER,
  type BookingBlock,
  type CancellationCause,
  type GuestRecord,
} from '../contracts/guestRecord';
import {
  BOOKING_BLOCKED_NO_SHOWS_CODE,
  BookingBlockedNoShowsError,
  NO_SHOW_UNDO_WINDOW_CLOSED_CODE,
  NoShowUndoWindowClosedError,
  RESERVATION_CANCELLED_BY_BLOCK_CODE,
  ReservationCancelledByBlockError,
  PHONE_HAS_ACTIVE_BOOKING_CODE,
  PhoneHasActiveBookingError,
  type HeldBooking,
} from '../contracts/errors';
import { ApiError } from '../errors';
import type { components } from '../generated/schema';

/**
 * The guest-record wire (2026-10-20), read once for every surface: the record
 * on staff reads and on the diner's own list, why a booking was cancelled, and
 * the two number-rule refusals the booking routes answer with.
 *
 * Kept in one file so a change to the wire is a change here. Every reader is
 * lenient in the same direction: a member a server does not send reads as the
 * state before the feature — no record, no cause, no block.
 */

type WireGuestRecord = components['schemas']['Yalla.Application.Reservations.GuestRecord'];

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** `guestRecord` on a booking read, or the diner's own; null when absent. */
export function guestRecordFromWire(wire: WireGuestRecord | null | undefined): GuestRecord | null {
  if (!wire) return null;
  const booked = count(wire.booked);
  return {
    booked,
    came: count(wire.came),
    noShows: count(wire.noShows),
    lateCancellations: count(wire.lateCancellations),
    unmarked: count(wire.unmarked),
    // The server's own word; nothing booked means new either way.
    isNewGuest: wire.isNewGuest === true || booked === 0,
    blockedUntilUtc: text(wire.blockedUntilUtc),
  };
}

/** `ReservationView.cancelledBecause`: 1 NoShowBlock. */
const CANCELLATION_CAUSE: Readonly<Record<number, CancellationCause>> = {
  1: 'noShowBlock',
};

export function cancellationCause(value: number | null | undefined): CancellationCause | null {
  if (value === null || value === undefined) return null;
  return CANCELLATION_CAUSE[value] ?? 'unknown';
}

/**
 * The caller's earliest active booking a 409 `phone-has-active-booking` names,
 * when it names one — only ever the caller's own. Null unless every member a
 * sentence needs is there.
 */
export function heldBookingFrom(context: Readonly<Record<string, unknown>>): HeldBooking | null {
  const reservationId = text(context['reservationId']);
  const code = text(context['code']);
  const startUtc = text(context['startUtc']);
  const localDate = text(context['localDate']);
  const localStartTime = text(context['localStartTime']);
  if (!reservationId || !code || !startUtc || !localDate || !localStartTime) return null;
  return {
    reservationId,
    code,
    startUtc,
    localDate,
    // "19:30:00" as the server writes a branch wall clock; said as "19:30".
    localStartTime: localStartTime.slice(0, 5),
    venueName: text(context['venueName']) ?? '',
    branchName: text(context['branchName']) ?? '',
  };
}

/** One row of `GET /api/platform/booking-blocks`, and a lift's answer. */
export type WireBookingBlock =
  components['schemas']['Yalla.Application.Reservations.BookingBlockView'];

export function bookingBlockFromWire(wire: WireBookingBlock): BookingBlock {
  return {
    blockId: wire.blockId,
    dinerUserId: wire.dinerUserId,
    dinerDisplayName: text(wire.dinerDisplayName),
    phoneE164: text(wire.phoneE164),
    blockedAtUtc: wire.blockedAtUtc,
    blockedUntilUtc: wire.blockedUntilUtc,
    liftedAtUtc: text(wire.liftedAtUtc),
  };
}

/** A decision on a booking a block already cancelled, as a typed error; null for anything else. */
export function cancelledByBlockRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || error.problem?.code !== RESERVATION_CANCELLED_BY_BLOCK_CODE) {
    return null;
  }
  const context = error.problem.context ?? {};
  return new ReservationCancelledByBlockError({
    url: error.url,
    requestId: error.requestId,
    reservationId: text(context['reservationId']),
    cancelledAtUtc: text(context['cancelledAtUtc']),
  });
}

/**
 * A request whose refusal `refusal` turns into a typed error; any other
 * failure passes as it was. Wrapping the call (rather than chaining `.catch`)
 * keeps `client.post(` whole for the gateway schema check.
 */
export async function withRefusal<T>(
  request: Promise<T>,
  refusal: (error: unknown) => ApiError | null,
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw refusal(error) ?? error;
  }
}

/** An undo past its window, as a typed error; null for anything else. */
export function undoNoShowRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || error.problem?.code !== NO_SHOW_UNDO_WINDOW_CLOSED_CODE) {
    return null;
  }
  return new NoShowUndoWindowClosedError({
    url: error.url,
    requestId: error.requestId,
    undoableUntilUtc: text(error.problem.context?.['undoableUntilUtc']),
  });
}

/**
 * The number rules' refusals, as typed errors; null for anything else, which
 * the caller maps as it always has. Shared by the diner's booking and change
 * routes and the manage link's change.
 *
 * - 409 `phone-has-active-booking`: the number holds `maxActiveBookings` (3)
 *   active bookings; the context names the caller's earliest, when it is theirs.
 * - 403 `booking-blocked-no-shows`: blocked until `context.blockedUntilUtc`.
 */
export function numberRuleRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const base = { url: error.url, requestId: error.requestId };
  switch (error.problem.code) {
    case PHONE_HAS_ACTIVE_BOOKING_CODE: {
      const max = Number(context['maxActiveBookings']);
      return new PhoneHasActiveBookingError({
        ...base,
        maxActiveBookings: Number.isInteger(max) && max > 0 ? max : MAX_ACTIVE_BOOKINGS_PER_NUMBER,
        held: heldBookingFrom(context),
      });
    }
    case BOOKING_BLOCKED_NO_SHOWS_CODE:
      return new BookingBlockedNoShowsError({
        ...base,
        blockedUntilUtc: text(context['blockedUntilUtc']),
      });
    default:
      return null;
  }
}
