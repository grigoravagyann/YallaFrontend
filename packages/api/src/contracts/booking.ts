import type { FloorPlanData } from '@yalla/floorplan/types';
import type { OpenState } from './publicBranch';
import type { ReservationStatusCode } from './push';

/**
 * Domain contracts for the reservation flow.
 *
 * These are the shapes components are typed against. The mock gateway and the
 * real HTTP gateway both implement them, so swapping data sources is a change
 * of one module — never a change to a screen.
 */
export type VenueType = 'cafe' | 'restaurant';

/**
 * Booking policy for a branch. These four numbers drive most of the copy in the
 * reservation flow, so they come from the branch rather than being hardcoded:
 * a bakery turning tables in 45 minutes and a restaurant holding them for three
 * hours cannot share a constant.
 */
export interface BranchPolicy {
  /** Typical sitting duration. A window shorter than this is worth warning about. */
  readonly turnMinutes: number;
  /** A slot closer than this to now can no longer be booked. */
  readonly leadTimeMinutes: number;
  /** Parties larger than this need staff approval instead of instant confirmation. */
  readonly instantConfirmationMaxPartySize: number;
  /** Free cancellation up to this many minutes before the slot. */
  readonly freeCancellationMinutes: number;
}

/**
 * One branch as the browse list publishes it — `PublicBranchCard`, and nothing
 * the card does not carry.
 *
 * This used to promise a distance, today's opening and closing instants, a
 * table total and a booking policy. None of the four is on the one venue read
 * the backend publishes, and a screen that called `branch.distanceKm.toFixed(1)`
 * on a real card would have crashed. What a diner genuinely gets is below.
 */
export interface BranchSummary {
  /** The branch id — a guid on the wire, and what every branch route takes. */
  readonly id: string;
  readonly slug: string;
  /** The venue's slug, which is the venue's id on this surface. */
  readonly venueId: string;
  readonly venueName: string;
  readonly name: string;
  readonly addressLine: string;
  /** IANA zone. Every time rendered for this branch uses it, never the device's. */
  readonly timeZoneId: string;
  /**
   * Open or shut, as the server judged it against the branch's own clock.
   *
   * The public card sends only the boolean, so both instants are `null` against
   * the real backend; the mock, which derives them from a fixture week, fills
   * them. A screen shows "open until" only when it has a time to show.
   */
  readonly openState: OpenState;
  /**
   * Tables nobody is sitting at **right now**, among the bookable ones.
   *
   * Not "free tonight", and meaningless at a branch that is shut — every table
   * is free at 03:00. Read it through `branchAvailability`, which says so.
   */
  readonly freeTables: number;
}

/**
 * A venue as the browse list publishes it.
 *
 * `id` is the venue's slug: the public card carries no venue id, the slug is
 * unique, and nothing links a booking or a tab back to this route, so the slug
 * is the honest key. The web page already keys its chooser the same way.
 */
export interface VenueSummary {
  readonly id: string;
  readonly name: string;
  readonly type: VenueType;
  readonly branches: readonly BranchSummary[];
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * How long a table is actually free for, resolved by the backend.
 *
 * The product does not ask people how long they intend to stay — self-reported
 * answers are unreliable and carry no consequence. Instead the limit is *told*
 * before confirming, so a diner who needs longer can pick a different table.
 */
export interface AvailabilityWindowDto {
  /** Start of the window (the requested slot), ISO-8601 UTC. */
  readonly fromUtc: string;
  /** End of the window, or `null` when nothing is booked after this. */
  readonly untilUtc: string | null;
  /** Start of the next booking, or `null`. Usually equals `untilUtc`. */
  readonly nextBookingStartUtc: string | null;
  /** Minutes between `fromUtc` and `untilUtc`; `null` when unbounded. */
  readonly minutes: number | null;
  /**
   * True when the window is shorter than the branch's turn time. Computed by
   * the backend so the client and the venue cannot disagree about it.
   */
  readonly isShorterThanTurnTime: boolean;
}

/**
 * Why a table cannot be reserved, as the *server* said it.
 *
 * One member per distinct thing the backend refuses for
 * (`Yalla.Domain.Occupancy.ReservationRejectionReason`), because each has a
 * different next step. Collapsing them is how a diner gets told a ten-seater
 * is "too small for 2", or that a closed venue is "too soon to book" — and
 * then tries again in five minutes.
 */
export type KnownTableUnavailableReason =
  /** Somebody is physically sitting there **now**. Only ever true of a slot now. */
  | 'occupied'
  | 'held'
  | 'outOfService'
  /**
   * The slot collides with another booking.
   *
   * Distinct from `occupied`, and the distinction is the whole point: a table
   * that is free this second and booked at 20:00 is not a table with people at
   * it, and telling a diner asking about 20:00 that "someone is sitting there"
   * sends them to look at an empty table. The backend reports both as
   * `TableAlreadyBooked` and separates them by the state it derived *for the
   * requested instant*; this is that separation, made once, in the mapper.
   */
  | 'alreadyBooked'
  /** The party is bigger than the table. */
  | 'tooSmall'
  /** The party is far smaller than the table: the venue will not seat 2 at a 10-top. */
  | 'tooLarge'
  | 'notBookable'
  /** The slot is sooner than the branch's lead time. */
  | 'pastLeadTime'
  /** Further ahead than the branch takes bookings. */
  | 'tooFarAhead'
  /** The branch is shut at that time. */
  | 'closed'
  /** That wall-clock time does not exist on that date — the clocks change. */
  | 'invalidTime';

/**
 * Deliberately open at the edges.
 *
 * The backend can add a refusal rule in a release this client has not been
 * rebuilt for, and the honest thing to do with a reason we have no word for is
 * to **carry it and show it**, not to look at the table's state and guess a
 * reason we do happen to have a word for. Guessing is how a diner asking about
 * Saturday is told somebody is sitting at the table right now.
 *
 * `KNOWN_UNAVAILABLE_REASONS` is what has copy; anything else renders through
 * the `other` key with the server's own word interpolated.
 */
export type TableUnavailableReason = KnownTableUnavailableReason | (string & {});

export const KNOWN_UNAVAILABLE_REASONS: readonly KnownTableUnavailableReason[] = [
  'occupied',
  'held',
  'outOfService',
  'alreadyBooked',
  'tooSmall',
  'tooLarge',
  'notBookable',
  'pastLeadTime',
  'tooFarAhead',
  'closed',
  'invalidTime',
];

export function isKnownUnavailableReason(
  reason: TableUnavailableReason,
): reason is KnownTableUnavailableReason {
  return (KNOWN_UNAVAILABLE_REASONS as readonly string[]).includes(reason);
}

export interface TableAvailability {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly floorAreaName: string | null;
  readonly seats: number;
  readonly isBookable: boolean;
  readonly unavailableReason: TableUnavailableReason | null;
  /** Present whenever the table is bookable. */
  readonly window: AvailabilityWindowDto | null;
  /**
   * Free cancellation deadline for a booking at this slot, ISO-8601 UTC — the
   * server's `cancellationDeadlineUtc`, computed by the same rule that marks a
   * cancellation late. `null` when the server could not compute one, and then
   * nothing is promised: this used to be the slot start, which told a diner
   * cancelling at 19:00 for a 19:30 table they were free to, and the server
   * recorded it as late.
   */
  readonly freeCancellationUntilUtc: string | null;
  /** True when this party size exceeds the instant-confirmation limit. */
  readonly requiresApproval: boolean;
}

/**
 * The room **and** its answer, for one slot, from one request.
 *
 * This type exists because the two were separate and the room came from the
 * wrong question. Both diner surfaces drew the plan from a floor-state call
 * meaning *now* and then overlaid availability meaning *the slot the diner
 * asked about*, so a table occupied by tonight's walk-ins rendered unavailable
 * for a booking three days away, and a table free this second rendered free at
 * 20:00 when it was already booked. Changing the time control moved the
 * overlay and left the room where it was.
 *
 * They are one shape now because they are one answer to one question, and
 * because `GET /api/branches/{id}/availability` has returned both since
 * Backend Prompt 7 — the geometry, the state derived *for the requested
 * instant*, the per-table refusal and the window — in a single anonymous round
 * trip. The client's job is to pass the slot and render what comes back.
 */
export interface SlotFloor {
  /** The room, with every table's state derived for {@link slotUtc}. */
  readonly plan: FloorPlanData;
  /** Per-table answer, in the same order as `plan.tables`. */
  readonly tables: readonly TableAvailability[];
  /**
   * A rule that refused the **whole request** before any table was considered:
   * the slot is in the past, beyond the booking window, or the branch is shut.
   *
   * Reported once rather than repeated on forty tables, so a surface can say
   * "we are closed at 03:00" instead of listing forty tables that are each
   * individually unavailable for the same reason. Null when the request was
   * fine — which is not the same as every table being free.
   */
  readonly rejection: TableUnavailableReason | null;
  /** The slot this answer is about, echoed back so a stale render is detectable. */
  readonly slotUtc: string;
  readonly partySize: number;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/**
 * The server's `ReservationStatus`, every member kept apart.
 *
 * `pendingApproval` is not a lesser `confirmed`: a large party has a request in
 * with the venue and no table yet. `seated` is not past. And the two
 * cancellations are separate, because whether the diner or the venue cancelled
 * is the one thing somebody reading the list wants to know.
 */
export type BookingStatus = ReservationStatusCode;

/**
 * A booking, as `ReservationView` describes one — and nothing it does not.
 *
 * This used to carry a venue id, a floor area, the availability window and a
 * created-at that no reservation read has, which is why the bookings screens
 * stayed on the mock. Now every field is one the server sends, except
 * `venueName`, which the view lacks and the gateway fills from the browse list
 * when it has read it.
 */
export interface Booking {
  readonly id: string;
  /** Short human code. Staff ask for it and it gets read aloud over the phone. */
  readonly code: string;
  readonly status: BookingStatus;

  /** `null` when this device has not read the venue list; the branch name is always there. */
  readonly venueName: string | null;
  readonly branchId: string;
  readonly branchName: string;
  /** IANA zone of the branch. Every time on this booking renders in it. */
  readonly timeZoneId: string;

  readonly tableId: string;
  readonly tableLabel: string;

  readonly partySize: number;
  /** When the table is theirs from — the server's `startUtc`. */
  readonly slotUtc: string;
  /** When the sitting is booked to end. */
  readonly endUtc: string;
  /** The server's `cancellationDeadlineUtc`: after this, a cancellation counts as late. */
  readonly freeCancellationUntilUtc: string;

  readonly cancelledAtUtc: string | null;
  readonly cancelledAfterDeadline: boolean;

  /**
   * An opaque token granting sight of, and the power to cancel, **this booking
   * alone** — with no account and no session.
   *
   * Issued for a booking made from the public web page, which has no push
   * channel: the reminder, the "still coming?" nudge and one-tap cancel all
   * reach the app and none of them reach a stranger who booked from a link.
   * Without this the only way out of such a booking is not turning up, which
   * makes the page a no-show generator for the venue that printed it on a card.
   *
   * `null` for a booking made in the app, which has an account and needs no
   * bearer link — and null against a backend that does not issue them yet, in
   * which case the confirmation offers the venue's phone number instead rather
   * than a link that goes nowhere.
   */
  readonly manageToken: string | null;
}

/**
 * Upcoming and past, **as the server split them**.
 *
 * The server's rule is "the sitting has not ended and the status still holds a
 * table". A client re-splitting on `slotUtc < now` put a diner five minutes late
 * — the very moment the nudge offers to keep the table — and a seated party
 * into Past.
 */
export interface MyBookings {
  readonly upcoming: readonly Booking[];
  readonly past: readonly Booking[];
}

/**
 * How far ahead and how soon a branch takes bookings, from its public page.
 *
 * `BranchAvailability` carries neither, so the date and time pickers read them
 * here and offer only what the branch will take, instead of offering a day the
 * server then refuses.
 */
export interface BookingRules {
  readonly bookingWindowDays: number;
  readonly minLeadMinutes: number;
}

/** Where a booking was made. The server pushes reminders only to the app. */
export type BookingChannel = 'app' | 'web';

export interface CreateBookingCommand {
  /**
   * Client-generated, stable across retries. This is what makes a flaky
   * connection unable to create two bookings: the backend treats a repeat of
   * the same id as the same command, not a new one.
   */
  readonly commandId: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly slotUtc: string;
  /**
   * The branch's zone. The server takes the booking in **wall-clock** date and
   * time, so the instant is converted in this zone — never the device's.
   */
  readonly timeZoneId: string;
  readonly partySize: number;
  /** Who the venue asks for at the door. Required by the server. */
  readonly guestName: string;
  /** The verified number, so the venue can reach them. Required by the server. */
  readonly guestPhone: string;
  readonly channel: BookingChannel;
}

// ---------------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------------

export interface PhoneChallenge {
  readonly challengeId: string;
  readonly phoneE164: string;
  readonly expiresAtUtc: string;
  readonly resendAvailableAtUtc: string;
  /** How many tries this code allows, from the server. */
  readonly maxAttempts: number;
  /**
   * Development only. The real backend returns this only outside production so
   * the flow is testable without an SMS provider. The UI must additionally gate
   * rendering on `__DEV__`, so a production bundle cannot show it even if a
   * misconfigured server sent one.
   */
  readonly devCode?: string | undefined;
}

export interface VerifiedPhone {
  readonly verificationToken: string;
  readonly phoneE164: string;
}
