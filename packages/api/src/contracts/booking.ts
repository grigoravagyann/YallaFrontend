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

export interface BranchSummary {
  readonly id: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly name: string;
  readonly distanceKm: number;
  readonly timeZoneId: string;
  readonly opensAtUtc: string;
  readonly closesAtUtc: string;
  readonly totalTables: number;
  readonly freeTables: number;
  readonly policy: BranchPolicy;
}

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
 * Why a table cannot be reserved. `null` means it can.
 *
 * One member per distinct thing the backend refuses for
 * (`Yalla.Domain.Occupancy.ReservationRejectionReason`), because each has a
 * different next step. Collapsing them is how a diner gets told a ten-seater
 * is "too small for 2", or that a closed venue is "too soon to book" — and
 * then tries again in five minutes.
 */
export type TableUnavailableReason =
  | 'occupied'
  | 'held'
  | 'outOfService'
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

export interface TableAvailability {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly floorAreaName: string | null;
  readonly seats: number;
  readonly isBookable: boolean;
  readonly unavailableReason: TableUnavailableReason | null;
  /** Present whenever the table is bookable. */
  readonly window: AvailabilityWindowDto | null;
  /** Free cancellation deadline for a booking made now, ISO-8601 UTC. */
  readonly freeCancellationUntilUtc: string;
  /** True when this party size exceeds the instant-confirmation limit. */
  readonly requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/**
 * `pendingApproval` is not a lesser `confirmed`. A large party has a request in
 * with the venue and no table yet; it must look visibly different everywhere it
 * appears or someone turns up to a table that was never theirs.
 */
export type BookingStatus = 'confirmed' | 'pendingApproval' | 'cancelled' | 'completed' | 'noShow';

export interface Booking {
  readonly id: string;
  /** Short human code. Staff ask for it and it gets read aloud over the phone. */
  readonly code: string;
  readonly status: BookingStatus;

  readonly venueId: string;
  readonly venueName: string;
  readonly branchId: string;
  readonly branchName: string;
  /** IANA zone of the branch. Every time on this booking renders in it. */
  readonly timeZoneId: string;

  readonly tableId: string;
  readonly tableLabel: string;
  readonly floorAreaName: string | null;

  readonly partySize: number;
  readonly slotUtc: string;
  readonly window: AvailabilityWindowDto;
  readonly freeCancellationUntilUtc: string;

  readonly createdAtUtc: string;
  readonly cancelledAtUtc: string | null;

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
  readonly partySize: number;
  readonly verificationToken: string;
}

// ---------------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------------

export interface PhoneChallenge {
  readonly challengeId: string;
  readonly phoneE164: string;
  readonly expiresAtUtc: string;
  readonly resendAvailableAtUtc: string;
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
