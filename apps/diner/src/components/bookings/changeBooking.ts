import type { Booking } from '@yalla/api';

/**
 * Changing a booking in place: the booking screen opened on an existing
 * booking, everything prefilled, and one press that moves it — same code,
 * same booking — instead of a cancellation and a stranger.
 */

const MINUTE_MS = 60_000;

/**
 * Whether to offer Change: a booking still waiting for the venue or
 * confirmed, not yet started, and not yet inside the branch's lead time.
 *
 * The server refuses a booking that has started (`reservation-not-changeable`).
 * Inside the lead time the booking's own time can no longer be chosen on the
 * booking screen, so Change closes at the same moment the time picker does:
 * `leadMinutes` is the branch's `minLeadMinutes`, or the booking screen's
 * stand-in while that is not known.
 */
export function canChangeBooking(
  booking: Pick<Booking, 'status' | 'slotUtc'>,
  now: Date,
  leadMinutes = 0,
): boolean {
  const start = Date.parse(booking.slotUtc);
  return (
    (booking.status === 'confirmed' || booking.status === 'pendingApproval') &&
    now.getTime() < start &&
    now.getTime() + Math.max(0, leadMinutes) * MINUTE_MS <= start
  );
}

/**
 * The route to change `booking`: `/book/[placeId]` with the booking and what
 * it holds now — its instant, its party and its table. The instant, not a
 * calendar date and a clock: a bar's 00:30 belongs to the evening before, and
 * only the instant says which half hour of which night it is.
 */
export function changeBookingRoute(booking: Booking) {
  return {
    pathname: '/book/[placeId]' as const,
    params: {
      placeId: booking.branchId,
      bookingId: booking.id,
      slotUtc: booking.slotUtc,
      party: String(booking.partySize),
      tableId: booking.tableId,
      tableLabel: booking.tableLabel,
    },
  };
}

/** The booking being changed and what it holds, as the route carried it. */
export interface BookingChange {
  readonly bookingId: string;
  /** The booking's start as an ISO instant, or `null` when the route did not say. */
  readonly slotUtc: string | null;
  readonly partySize: number | null;
  readonly tableId: string | null;
}

/** The route's change-mode params; strings, as every route param is. */
export interface ChangeParams {
  readonly bookingId?: string | undefined;
  readonly slotUtc?: string | undefined;
  readonly party?: string | undefined;
  readonly tableId?: string | undefined;
}

/** An ISO instant with its zone (`Z` or an offset): a bare date or clock is no instant. */
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/u;

function instantOf(value: string | undefined): string | null {
  if (!value || !INSTANT_RE.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Change mode, or `null` for a fresh booking (no `bookingId`). A param that
 * does not read as what it should be is left unknown rather than guessed: the
 * screen then starts from its usual default for that choice.
 */
export function parseChangeParams(params: ChangeParams): BookingChange | null {
  const bookingId = params.bookingId?.trim();
  if (!bookingId) return null;
  const party = Number(params.party);
  return {
    bookingId,
    slotUtc: instantOf(params.slotUtc),
    partySize: params.party !== undefined && Number.isInteger(party) && party > 0 ? party : null,
    tableId: params.tableId?.trim() || null,
  };
}

/** What the screen would send now. */
export interface ChangeChoice {
  /** The chosen time as an instant, `null` while none is chosen. */
  readonly slotUtc: string | null;
  readonly partySize: number;
  readonly tableId: string | null;
}

/**
 * Nothing to save: the same instant, party and table the booking already
 * has. "Save changes" stays off, so a tap cannot send a move to where the
 * booking already is. Instants are compared, never clock readings: 00:30
 * tonight and 00:30 last night read alike.
 */
export function isUnchanged(original: BookingChange, current: ChangeChoice): boolean {
  return (
    original.slotUtc !== null &&
    current.slotUtc !== null &&
    Date.parse(original.slotUtc) === Date.parse(current.slotUtc) &&
    original.partySize === current.partySize &&
    original.tableId === current.tableId
  );
}
