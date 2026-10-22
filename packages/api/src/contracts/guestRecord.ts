import { instantFromZonedClock, zonedParts, type TimeZone } from '@yalla/format';

/**
 * A guest's booking record (2026-10-20): how they kept their bookings over the
 * last twelve months, at every venue — what a venue sees beside a booking
 * before it decides, and what the guest sees of themselves.
 *
 * Counts only: no venue names, no dates, no booking behind a number. Only
 * bookings the guest's own **proved** account made count — never a number
 * somebody typed — so nobody can spoil somebody else's record. A venue's own
 * cancellation or decline never counts against the guest; a cancellation in
 * good time does not count at all; a late one is counted apart.
 *
 * `Yalla.Application.Reservations.GuestRecord`. Absent on a staff read when
 * no proved account is behind the booking; never on a diner's or the public
 * page's read of a booking. The guest's own comes with their bookings list.
 */
export interface GuestRecord {
  /** Bookings whose time came: exactly came + no-shows + late cancellations + unmarked. */
  readonly booked: number;
  /**
   * A visit the venue vouched for: a waiter seated the party, or the sitting
   * had an order sent to the kitchen or a payment. Opening a tab from the
   * booking code alone never counts.
   */
  readonly came: number;
  /** Marked as not having come. */
  readonly noShows: number;
  /**
   * A confirmed booking, made before its cancellation deadline, that the guest
   * cancelled after it. A same-evening booking cancelled at once, or one still
   * waiting for the venue, never counts.
   */
  readonly lateCancellations: number;
  /**
   * Its time came and went with nobody on the floor settling it: confirmed and
   * past its end with nobody seated or marked, or opened from its code only,
   * with nothing sent to the kitchen and nothing paid. 0 from a server before it.
   */
  readonly unmarked: number;
  /** Nothing booked in the window: a neutral "new guest", never a warning. About bookings only. */
  readonly isNewGuest: boolean;
  /**
   * Takeaway orders the guest left at the counter — made ready, never
   * collected — whose promised time is in the twelve months (2026-10-23). Its
   * own count, in none of the booking counts; each counts toward the no-show
   * block as a missed booking does. 0 from a server before it.
   */
  readonly takeawayNoShows: number;
  /**
   * While the guest is blocked from booking for no-shows: when the block
   * ends, ISO-8601 UTC. `null` when not blocked.
   */
  readonly blockedUntilUtc: string | null;
}

/** A guest with nothing on record yet. */
export const NEW_GUEST_RECORD: GuestRecord = {
  booked: 0,
  came: 0,
  noShows: 0,
  lateCancellations: 0,
  unmarked: 0,
  isNewGuest: true,
  takeawayNoShows: 0,
  blockedUntilUtc: null,
};

/**
 * A good record, as the venue's "auto-confirm guests with a good record"
 * reads it (`GuestRecordRules.IsGood`): came at least this often in the twelve
 * months, with no no-show, no late cancellation and no takeaway order left
 * uncollected.
 */
export const GOOD_RECORD_MIN_CAME = 3;

export function hasGoodRecord(record: GuestRecord): boolean {
  return (
    record.came >= GOOD_RECORD_MIN_CAME &&
    record.noShows === 0 &&
    record.lateCancellations === 0 &&
    (record.takeawayNoShows ?? 0) === 0
  );
}

/** Whether the guest left a takeaway order uncollected in the twelve months. */
export function hasTakeawayNoShows(record: GuestRecord | null | undefined): boolean {
  return (record?.takeawayNoShows ?? 0) > 0;
}

/** Whether the guest is blocked from booking at `now`. */
export function isBookingBlocked(record: GuestRecord | null | undefined, now: Date): boolean {
  const until = record?.blockedUntilUtc ? Date.parse(record.blockedUntilUtc) : NaN;
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * The no-show block (`NoShowBlockRules`): this many no-shows on bookings that
 * started within these hours of each other blocks booking for these days, and
 * cancels every booking of the guest's that has not started yet. A takeaway
 * order not collected counts as a no-show (over its promised time), and a
 * blocked guest cannot order takeaway either.
 */
export const NO_SHOW_BLOCK = { threshold: 3, windowHours: 72, blockDays: 7 } as const;

/**
 * Until when a no-show may be undone (`POST /api/reservations/{id}/undo-no-show`):
 * 05:00 the morning after the booking's day, on the branch's clock. Past it the
 * server answers 409 `no-show-undo-window-closed`. A start before 05:00 belongs
 * to the evening before, whose window closes that same morning.
 */
export const NO_SHOW_UNDO_UNTIL_HOUR = 5;

export function noShowUndoableUntil(startUtc: string, timeZoneId: string): Date {
  const local = zonedParts(new Date(startUtc), timeZoneId as TimeZone);
  // The service day: a sitting before 05:00 is the evening before's.
  const serviceDay = new Date(
    Date.UTC(
      local.year,
      local.month - 1,
      local.day - (local.hour < NO_SHOW_UNDO_UNTIL_HOUR ? 1 : 0),
    ),
  );
  const next = new Date(serviceDay.getTime() + 24 * 3_600_000);
  return instantFromZonedClock(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: NO_SHOW_UNDO_UNTIL_HOUR,
      minute: 0,
    },
    timeZoneId as TimeZone,
  );
}

/**
 * At most this many active bookings — pending or confirmed, not over, at any
 * venue — per proved phone number (`BookingLimits.MaxActiveBookingsPerNumber`).
 * The server says it on its refusal; this is the fallback when it does not.
 */
export const MAX_ACTIVE_BOOKINGS_PER_NUMBER = 3;

/**
 * At another venue or branch, two of one guest's sittings need this many
 * minutes between them (`BookingLimits.OtherVenueGapMinutes`) — the way there.
 * At the same branch they may touch.
 */
export const OTHER_VENUE_GAP_MINUTES = 30;

/**
 * Why a booking was cancelled, when the server says more than its status
 * (`Yalla.Domain.Occupancy.CancellationCause`): 1 NoShowBlock — cancelled
 * automatically because the guest was blocked for three no-shows in three
 * days. `unknown` for a value a newer server adds.
 */
export type CancellationCause = 'noShowBlock' | 'unknown';

/**
 * A no-show block, as the platform admin sees it — `GET /api/platform/booking-blocks`
 * lists the ones in force, newest first (guest record review round).
 */
export interface BookingBlock {
  readonly blockId: string;
  readonly dinerUserId: string;
  /** Absent once the account is gone (the block still holds through the number). */
  readonly dinerDisplayName: string | null;
  readonly phoneE164: string | null;
  readonly blockedAtUtc: string;
  readonly blockedUntilUtc: string;
  /** Set once lifted; the answer of a lift. */
  readonly liftedAtUtc: string | null;
}

/** Between 3 and 500 characters, as the server bounds a lift's reason. */
export const LIFT_REASON_MIN = 3;
export const LIFT_REASON_MAX = 500;

/**
 * `POST /api/platform/booking-blocks/{blockId}/lift`, audited as
 * `booking-block.lift`. The guest is told; the bookings the block cancelled are
 * not restored. Already lifted: answered as it stands. Expired: 409
 * `conflicting-state`.
 */
export interface LiftBookingBlockCommand {
  readonly blockId: string;
  readonly reason: string;
}

/**
 * How a record reads at a glance, for the screen's wording and icon — never
 * by colour alone:
 * - `blocked` — booking is blocked until `blockedUntilUtc`;
 * - `new` — nothing on record: neutral;
 * - `missed` — at least one no-show, or a takeaway order not collected;
 * - `good` — the venue setting's good record;
 * - `plain` — anything else.
 */
export type GuestRecordStanding = 'blocked' | 'new' | 'missed' | 'good' | 'plain';

export function guestRecordStanding(record: GuestRecord, now: Date): GuestRecordStanding {
  if (isBookingBlocked(record, now)) return 'blocked';
  // A guest who never booked but left an order at the counter is not neutral.
  if (record.isNewGuest && !hasTakeawayNoShows(record)) return 'new';
  if (record.noShows > 0 || hasTakeawayNoShows(record)) return 'missed';
  if (hasGoodRecord(record)) return 'good';
  return 'plain';
}
