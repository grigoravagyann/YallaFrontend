import type { VenueType } from './booking';
import type { WeeklyHours } from './branchSettings';

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
   * False for a venue on the free tier or one that has switched web booking
   * off. The page still renders — the room, the menu and the hours are still
   * worth someone's time — but nothing on it offers an action it cannot honour.
   */
  readonly acceptsWebBookings: boolean;
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
 */
export interface ManagedBooking {
  readonly code: string;
  readonly status: 'confirmed' | 'pendingApproval' | 'cancelled' | 'completed' | 'noShow';

  readonly venueName: string;
  readonly venueSlug: string;
  readonly branchName: string;
  readonly branchSlug: string;
  readonly addressLine: string;
  readonly timeZoneId: string;

  readonly tableLabel: string;
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
   * False once the booking is over or already cancelled.
   *
   * Server-decided. Lateness is **not** a reason for this to be false:
   * cancelling ten minutes before is far better for the venue than a no-show,
   * so late cancellation is a sentence on the page, never a disabled button.
   */
  readonly canCancel: boolean;
}
