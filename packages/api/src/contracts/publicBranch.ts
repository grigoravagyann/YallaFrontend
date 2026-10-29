import type { BranchFeature } from './branchFeatures';
import type { ApprovalTrigger, DeclineReason } from './approvals';
import { ApiError } from '../errors';
import { ProblemCodes } from '../generated/problemCodes';
import { problemContext } from '../problem';
import type { DaySlot, DaySlots, VenueType } from './booking';
import type { PolicyBookingMode, SpecialDay, WeeklyHours } from './branchSettings';
import type { CancellationCause } from './guestRecord';
import type { BookingPreOrderFields } from './preOrder';

/**
 * What a stranger with a link can see, and nothing more.
 *
 * These shapes are deliberately their own contract rather than a reuse of
 * `VenueSummary` and `ConsoleVenueDetail`, and the reason is a permission
 * boundary rather than tidiness. Everything here is served with **no token at
 * all**, so the safe way to reason about it is: if a field is in this file, it
 * is published to the internet. `distanceKm` is absent because there is no
 * location permission to ask for; every id is absent from the *card* shapes for
 * the same reason a slug exists in the first place.
 *
 * ## Slugs, not ids
 *
 * The page is addressed `/{venueSlug}/{branchSlug}` because that is what goes
 * in an Instagram bio and on a printed card, and because a guid in a URL is a
 * URL nobody types twice. Ids still travel in the body — the availability and
 * menu endpoints are keyed by branch id and there is no reason to resolve a
 * slug twice — but the *address* is the pair of slugs, and the pair has to
 * match: `/dolmama/northern-avenue` is a 404 even though both halves exist,
 * because it is a branch of a different venue and answering it would let
 * someone enumerate a chain's locations by trying slugs against each other.
 */

/** How a photo arrives: three variants and the id behind them. */
export interface PublicPhoto {
  readonly photoId: string;
  readonly thumbnailUrl: string;
  readonly cardUrl: string;
  readonly fullUrl: string;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * A room a visitor picks from — Hall, Terrace, VIP — with its photos in the
 * order a diner swipes them. Only rooms with a photo are listed: tables are
 * pins on the photos, so a room with none has nothing to show or book.
 *
 * The pins themselves come from availability, for the slot the visitor picked,
 * so their colours are the state at that slot rather than now.
 */
export interface PublicRoom {
  readonly roomId: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly photos: readonly PublicPhoto[];
}

/**
 * The reservation rules a diner needs in order to book, and nothing else.
 *
 * Deliberately **not** `BranchPolicy`. The backend publishes a hand-picked
 * subset on this route and withholds the rest — `docs/public-surface.md` is
 * explicit that it is "a hand-picked subset, not a projection of
 * `ReservationPolicy`" — so reusing the console's four-field shape would mean
 * inventing the two it does not send. Three numbers, all real.
 */
export interface PublicBranchPolicy {
  /** How long the table is held. The answer to "can we linger?". */
  readonly turnTimeMinutes: number;
  /** How far ahead a booking must be made; greys out the next slot. */
  readonly minLeadMinutes: number;
  /** Cancelling later than this is still allowed, but recorded as late. */
  readonly cancellationDeadlineMinutes: number;
  /**
   * Whether the branch takes pre-orders on a booking (2026-10-21): mention
   * pre-ordering before and after booking. The page's cached plan — it may lag
   * a settings change by its cache time; a booking's own
   * `preOrderEditableUntilUtc` is the answer for that booking. Absent: false.
   */
  readonly acceptsPreOrders?: boolean | undefined;
  /**
   * How a visitor books here (2026-10-29): a table on the room photos, or only
   * a time and how many, the venue choosing the table on arrival. Absent from
   * an older server: `'chooseTable'`. Read it through {@link booksByTimeOnly}.
   */
  readonly bookingMode?: PolicyBookingMode | undefined;
}

/** The branch takes bookings by time and party size alone: no room photos, no table. */
export function booksByTimeOnly(policy: Pick<PublicBranchPolicy, 'bookingMode'>): boolean {
  return policy.bookingMode === 'timeOnly';
}

/**
 * One time on a day at a branch that books by time only, as the public page
 * reads it (`GET /api/public/branches/{id}/availability/slots`): the app's
 * slot with how many more guests fit.
 */
export interface PublicTimeSlot extends DaySlot {
  /**
   * How many more guests fit at the busiest moment of this time's sitting.
   * `null` at a branch where diners choose a table, which answers in tables.
   */
  readonly guestsLeft: number | null;
}

/** A day of {@link PublicTimeSlot}s for one party size. */
export interface PublicTimeSlots extends Omit<DaySlots, 'slots'> {
  readonly slots: readonly PublicTimeSlot[];
}

/**
 * A booking refused as `409 time-full`: no room for that many then. How many
 * the time could still take (0 or more), or `null` for any other error.
 */
export function timeFullGuestsLeft(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== ProblemCodes.TimeFull) return null;
  const left = problemContext(error.problem, ProblemCodes.TimeFull).guestsLeft;
  return typeof left === 'number' && left >= 0 ? left : 0;
}

/**
 * Whether the page may be shown at all.
 *
 * `suspended` and `unlisted` are separate because they are different facts with
 * the same rendering: a venue whose subscription lapsed and a branch that has
 * been taken off the map are both "not available", and neither is an error. The
 * page must never render a suspended venue's free-table count — that is a
 * commercial decision the platform made, and honouring it is the point.
 */
export type PublicBranchStatus = 'live' | 'suspended' | 'unlisted';

/** Open, shut, and until when — the second thing anyone scanning wants. */
export interface OpenState {
  readonly isOpen: boolean;
  /** When the current sitting ends, ISO-8601 UTC. Null when shut. */
  readonly closesAtUtc: string | null;
  /** When it opens next, ISO-8601 UTC. Null when open, or when nothing is scheduled. */
  readonly opensAtUtc: string | null;
}

/** The venue, as the page's header renders it. */
export interface PublicVenueHeader {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly type: VenueType;
  /** One line. Longer than that and it pushes the free-table count below the fold. */
  readonly description: string | null;
  readonly coverPhoto: PublicPhoto | null;
}

/** One branch in the venue-level chooser. */
export interface PublicBranchCard {
  readonly slug: string;
  readonly name: string;
  readonly addressLine: string;
  readonly status: PublicBranchStatus;
  readonly openState: OpenState;
  readonly freeTables: number;
  /**
   * Null when the source does not carry a denominator — the public venue list
   * sends a free count per branch and no total. The chooser then says "7 tables
   * free" rather than "7 of 0".
   */
  readonly totalTables: number | null;
  readonly timeZoneId: string;
}

/** `/{venueSlug}` — the chooser, when a venue has more than one branch. */
export interface PublicVenue {
  readonly venue: PublicVenueHeader;
  readonly branches: readonly PublicBranchCard[];
}

/**
 * `/{venueSlug}/{branchSlug}` — everything above the menu, in one request.
 *
 * One request rather than four on purpose. This page is opened on mobile data,
 * often outside, and four serial round trips on a 3G connection is most of a
 * second of nothing before the name appears. The menu and the floor are
 * separate because both are deferred below the fold.
 */
export interface PublicBranch {
  readonly venue: PublicVenueHeader;

  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: PublicBranchStatus;

  readonly addressLine: string;
  /** For the map link. Null when the venue has not placed a pin. */
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly phoneE164: string | null;

  /** IANA zone. Every time on this page renders in it, never the device's. */
  readonly timeZoneId: string;
  readonly openState: OpenState;
  readonly weeklyHours: WeeklyHours;
  /**
   * The special days from the branch's today through the next sixty days,
   * earliest first: each replaces its date's weekly hours. Empty from a server
   * that does not send them yet.
   */
  readonly specialDays: readonly SpecialDay[];

  /**
   * The number the whole page is for.
   *
   * Server-computed, at `asOfUtc`, so the count under the venue name and the
   * green tables on the plan cannot disagree — and so a page left open on a
   * table can say honestly how old its number is.
   */
  readonly freeTables: number;
  readonly totalTables: number;
  readonly asOfUtc: string;

  /** The three published rules. Served on this route since Backend Prompt 13. */
  readonly policy: PublicBranchPolicy;

  /**
   * How far ahead this branch takes bookings.
   *
   * On `PublicBranch` rather than inside {@link PublicBranchPolicy}, which is
   * the rules for booking rather than the horizon they apply within.
   * The web page needs this one for a different job: it is the `max` on a
   * native date input, and without it a visitor can open their phone's calendar
   * and pick a day in March that the server will refuse after they have chosen
   * a table.
   */
  readonly bookingWindowDays: number;

  /**
   * Whether this branch takes bookings from the web at all.
   *
   * False where the platform has not allowed web bookings, or the venue has
   * switched them off. The page still renders — the room, the menu and the hours are still
   * worth someone's time — but nothing on it offers an action it cannot honour.
   */
  readonly acceptsWebBookings: boolean;

  /**
   * The features **on** here as a guest sees them (2026-10-27): allowed by the
   * platform and switched on by the venue. What is not in it is not offered —
   * reviews and the rating, pre-orders, takeaway.
   */
  readonly features: readonly BranchFeature[];

  /** The rooms with photos, lowest `displayOrder` first. */
  readonly rooms: readonly PublicRoom[];

  /**
   * How many branches the venue's chooser lists, this one included (at least
   * 1): the switched-on ones, read live with the page. "All N branches" shows
   * only above one — without reading the whole public venue list for a number.
   */
  readonly venueBranchCount: number;
}

/**
 * What a link-unfurler is supposed to be given.
 *
 * Server-owned rather than assembled in the browser, because the only consumer
 * that matters — WhatsApp's fetcher, Telegram's, Slack's — does not run
 * JavaScript. See `apps/web/src/public/meta.ts` for what actually happens today
 * and why this type exists ahead of a server that can use it.
 */
export interface PublicPageMeta {
  readonly title: string;
  readonly description: string;
  /** Absolute URL. A relative one is dropped by every unfurler. */
  readonly imageUrl: string | null;
  readonly canonicalUrl: string;
  readonly siteName: string;
  /** BCP-47, for `og:locale`. */
  readonly locale: string;
}

// ---------------------------------------------------------------------------
// Managing a booking without an account
// ---------------------------------------------------------------------------

/**
 * A booking as its own signed link shows it.
 *
 * Narrower than `Booking` and that is the point: the link is a bearer
 * credential that lives forever in somebody's WhatsApp history, so it grants
 * exactly two things — seeing this one booking, and cancelling it. No phone
 * number, no other bookings, no account.
 *
 * This is not optional politeness. A web visitor gets no push reminder and no
 * one-tap cancel, so without this link the only way out of a booking is not
 * turning up, and the page becomes a no-show generator for the venue that
 * printed it on a card.
 *
 * And, since pre-orders (2026-10-21), its pre-order: editable from the link
 * like the app's, with the "on my way" question when `onYourWayAsked`. The
 * link publishes **no branch id**: the picker's menu is found from
 * `venueSlug`/`branchSlug` (the branch page names its id) — see
 * `useManagedPreOrderMenu`.
 */
export interface ManagedBooking extends BookingPreOrderFields {
  /**
   * The booking's id. It opens nothing anonymously; the change screen passes it
   * as `excludeReservationId` on the day-of-slots and room reads, so the table
   * this booking holds reads as free to the person holding the link.
   */
  readonly reservationId: string;
  readonly code: string;
  readonly status: 'confirmed' | 'pendingApproval' | 'cancelled' | 'completed' | 'noShow';

  readonly venueName: string;
  readonly venueSlug: string;
  readonly branchName: string;
  readonly branchSlug: string;
  readonly addressLine: string;
  readonly timeZoneId: string;

  /**
   * The booked table: the change screen starts on it, and sends it back when
   * only the time or party moves. `null` for a booking made by time only that
   * nobody has seated: the venue chooses the table on arrival.
   */
  readonly tableId: string | null;
  readonly tableLabel: string | null;
  /**
   * Made at a branch that books by time only, with no table yet: the page
   * says the venue chooses it on arrival, and offers no change — such a
   * booking is moved by cancelling it and booking again. Absent: false.
   */
  readonly bookedWithoutTable?: boolean | undefined;
  readonly floorAreaName: string | null;
  readonly partySize: number;
  readonly slotUtc: string;
  /**
   * End of the sitting.
   *
   * Null from the manage link: `PublicBookingView` carries the start and the
   * cancellation deadline but not the turn time, and a sitting length guessed
   * on the client would be written into somebody's calendar as fact.
   */
  readonly endsAtUtc: string | null;
  readonly freeCancellationUntilUtc: string;

  /**
   * When the venue's answer window closes, for a short-notice request still
   * waiting. The page counts down to it and re-reads until the venue answers.
   * `null` otherwise — and from a server that does not send it yet.
   */
  readonly approvalExpiresAtUtc: string | null;
  /**
   * Why the venue declined it, when it did: a person said no, or nobody
   * answered in time. `null` for every other booking, a cancelled one
   * included. The manage page says sorry for the second.
   */
  readonly declinedBecause: DeclineReason | null;
  /**
   * Cancelled by the venue, not by the guest and not as a decline: the page
   * then does not thank the guest for telling the venue. False for every
   * other booking.
   */
  readonly cancelledByVenue: boolean;
  /**
   * `noShowBlock`: cancelled automatically, the guest blocked after three
   * missed bookings in three days (wire §0a). Absent for any other booking.
   */
  readonly cancelledBecause?: CancellationCause | null | undefined;
  /**
   * Why it waits, while it does: the guest before is being asked
   * (`earlierGuestConsent`) or the venue decides. Absent from an older server.
   */
  readonly awaitingApprovalBecause?: ApprovalTrigger | null | undefined;
  /**
   * Waiting for the guest before: they answer it themselves in the app
   * (true), or the venue rings them (false). Absent when the server does not
   * say — the page then says what is true of both.
   */
  readonly awaitsEarlierGuestAnswer?: boolean | undefined;
  /**
   * "You will free the table by 21:25": promised when the booking was made,
   * because another follows it. Absent or `null` when nothing was promised.
   */
  readonly promisedFreeByUtc?: string | null | undefined;

  /**
   * False once the booking is over or already cancelled.
   *
   * Server-decided. Lateness is **not** a reason for this to be false:
   * cancelling ten minutes before is far better for the venue than a no-show,
   * so late cancellation is a sentence on the page, never a disabled button.
   */
  readonly canCancel: boolean;
  /**
   * Made without a verified phone number — legacy rows from the few hours of
   * 2026-10-20 when such bookings were taken. Absent reads as verified.
   */
  readonly phoneUnverified?: boolean | undefined;
  /**
   * Whether "Change" is offered: the booking is still to come, pending or
   * confirmed, and its account is live with a proved number. False for every
   * booking made without a verified number — cancel it and book again. Absent
   * from an older server, which reads as true (the change itself then says no).
   */
  readonly canChange?: boolean | undefined;
  /**
   * Ask "Are you on your way? [Yes, on my way] [Can't come]": true from 45
   * minutes before the start while the booking is confirmed, has a pre-order
   * that is not sent or cancelled, and the guest has not answered. The
   * server's answer; absent reads as false.
   */
  readonly onYourWayAsked?: boolean | undefined;
}

/**
 * Move a booking from its manage link (`POST /api/public/bookings/{token}/reschedule`):
 * the whole new slot, as the app's change sends it — never only what changed.
 */
export interface RescheduleManagedBookingCommand {
  readonly token: string;
  /**
   * One per change attempt, reused on every retry of it: a retry answers the
   * booking as it stands, and the same id with a different change is a 409.
   */
  readonly commandId: string;
  /** The current table or another one at the branch. */
  readonly tableId: string;
  readonly slotUtc: string;
  /** The branch's zone: the server takes wall-clock date and time. */
  readonly timeZoneId: string;
  readonly partySize: number;
  /** The new table's must-free-by time, agreed to — only when the slot asks for it. */
  readonly acceptsFreeByUtc?: string | null | undefined;
}
