import type { YallaGateway } from '../gateway';
import type { PublicGateway } from '../publicGateway';
import type {
  ManagedBooking,
  PublicBranch,
  PublicBranchCard,
  PublicBranchPolicy,
  PublicPageMeta,
  PublicVenue,
  PublicVenueHeader,
} from '../contracts/publicBranch';
import type { Booking } from '../contracts/booking';
import { openStateFrom } from './openState';
import {
  publicBranchFixtures,
  publicVenueFixtures,
  type PublicBranchFixture,
} from './publicVenues';
import { mockVenues, type Branch, type Venue } from './venues';

/**
 * The public page's data, without a backend.
 *
 * Composed over the *live* `YallaGateway` rather than reading the fixture's
 * floors directly, which is the one decision in this file worth defending. The
 * free-table count is the largest thing on the page; if it came from the frozen
 * fixture it would sit there unchanged while a booking made two taps ago turned
 * table 7 green-to-amber on the plan right below it. Asking the same gateway
 * the plan asks means the number and the room cannot disagree — and it means
 * the manage-booking link operates on the very booking the confirmation screen
 * created, which is the only way that flow is walkable end to end without a
 * server.
 */
export interface PublicMockOptions {
  /** The diner gateway this instance shares a world with. Required, see above. */
  readonly gateway: YallaGateway;
  readonly now?: (() => Date) | undefined;
  readonly latencyMs?: number | undefined;
}

/**
 * The mock's stand-in for a signed token.
 *
 * The real one is a server signature over the reservation id with an expiry.
 * Here it is the id with a prefix — enough to exercise every path the page has
 * (open, cancel, already-cancelled, unknown token) while being obviously not a
 * credential, so nobody mistakes the mock for a security model.
 */
const TOKEN_PREFIX = 'mbk_';

export function manageTokenFor(bookingId: string): string {
  return `${TOKEN_PREFIX}${bookingId}`;
}

function bookingIdFromToken(token: string): string | null {
  return token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : null;
}

/** `ReservationPolicy.bookingWindowDays`'s own default. */
/**
 * Exported so the diner mock refuses the same slots this page offers. Two
 * copies of "how far ahead can I book" is how the picker offers a day the
 * answer then rejects.
 */
export const BOOKING_WINDOW_DAYS = 14;

/**
 * The three numbers the public page publishes.
 *
 * Matches `PublicReservationPolicy`, not the console's four-field `BranchPolicy`
 * — the backend publishes a hand-picked subset on this route and withholds the
 * rest, so a fixture carrying more than the real API sends would let a screen
 * read a field that does not exist in production.
 */
const DEFAULT_POLICY: PublicBranchPolicy = {
  turnTimeMinutes: 105,
  minLeadMinutes: 30,
  cancellationDeadlineMinutes: 120,
};

function venueHeader(venue: Venue): PublicVenueHeader {
  const fixture = publicVenueFixtures[venue.id];
  return {
    id: venue.id,
    slug: fixture?.slug ?? venue.id,
    name: venue.name,
    type: venue.type,
    description: fixture?.description ?? null,
    coverPhoto: fixture?.coverPhoto ?? null,
  };
}

function findVenueBySlug(venueSlug: string): Venue | null {
  return mockVenues.find((venue) => publicVenueFixtures[venue.id]?.slug === venueSlug) ?? null;
}

function findBranchBySlug(
  venue: Venue,
  branchSlug: string,
): { branch: Branch; fixture: PublicBranchFixture } | null {
  for (const branch of venue.branches) {
    const fixture = publicBranchFixtures[branch.id];
    if (fixture && fixture.slug === branchSlug) return { branch, fixture };
  }
  return null;
}

export function createPublicMockGateway(options: PublicMockOptions): PublicGateway {
  const { gateway } = options;
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 0;
  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

  /**
   * How many tables are free, read from the room the plan will draw.
   *
   * A suspended branch is never counted. That is not an optimisation: a page
   * that says "8 tables free" above a "not available" notice is the platform
   * advertising a venue it has switched off.
   */
  async function freeTablesFor(
    branchId: string,
    fixture: PublicBranchFixture,
  ): Promise<{ free: number; total: number }> {
    if (fixture.status !== 'live') return { free: 0, total: 0 };
    const floor = await gateway.getFloorPlan(branchId);
    if (!floor) return { free: 0, total: 0 };
    return {
      free: floor.tables.filter((table) => table.state === 'free').length,
      total: floor.tables.length,
    };
  }

  async function cardFor(branch: Branch): Promise<PublicBranchCard | null> {
    const fixture = publicBranchFixtures[branch.id];
    if (!fixture) return null;
    const counts = await freeTablesFor(branch.id, fixture);
    return {
      slug: fixture.slug,
      name: branch.name,
      addressLine: fixture.addressLine,
      status: fixture.status,
      openState: openStateFrom(fixture.weeklyHours, now(), branch.timeZoneId),
      freeTables: counts.free,
      totalTables: counts.total,
      timeZoneId: branch.timeZoneId,
    };
  }

  /** The manage page's narrower status: one "cancelled", and seated reads as confirmed. */
  function managedStatus(status: Booking['status']): ManagedBooking['status'] {
    switch (status) {
      case 'cancelledByDiner':
      case 'cancelledByVenue':
        return 'cancelled';
      case 'completed':
        return 'completed';
      case 'noShow':
        return 'noShow';
      case 'pendingApproval':
        return 'pendingApproval';
      default:
        return 'confirmed';
    }
  }

  async function managedFrom(booking: Booking): Promise<ManagedBooking> {
    const venue = mockVenues.find((v) => v.branches.some((b) => b.id === booking.branchId));
    const fixture = publicBranchFixtures[booking.branchId];
    const floor = await gateway.getFloorPlan(booking.branchId);

    return {
      code: booking.code,
      status: managedStatus(booking.status),
      venueName: booking.venueName ?? venue?.name ?? '',
      venueSlug: venue ? (publicVenueFixtures[venue.id]?.slug ?? venue.id) : '',
      branchName: booking.branchName,
      branchSlug: fixture?.slug ?? '',
      addressLine: fixture?.addressLine ?? '',
      timeZoneId: booking.timeZoneId,
      tableLabel: booking.tableLabel,
      floorAreaName:
        floor?.tables.find((table) => table.id === booking.tableId)?.floorAreaName ?? null,
      partySize: booking.partySize,
      slotUtc: booking.slotUtc,
      endsAtUtc: booking.endUtc,
      freeCancellationUntilUtc: booking.freeCancellationUntilUtc,
      // Lateness is not a reason to refuse. Only a booking that is already over
      // or already cancelled has nothing left to cancel.
      canCancel: booking.status === 'confirmed' || booking.status === 'pendingApproval',
    };
  }

  return {
    async resolveVenue(venueSlug): Promise<PublicVenue | null> {
      await wait();
      const venue = findVenueBySlug(venueSlug);
      if (!venue) return null;

      const cards = await Promise.all(venue.branches.map(cardFor));
      return {
        venue: venueHeader(venue),
        branches: cards.filter((card): card is PublicBranchCard => card !== null),
      };
    },

    async resolveBranch({ venueSlug, branchSlug }): Promise<PublicBranch | null> {
      await wait();
      const venue = findVenueBySlug(venueSlug);
      if (!venue) return null;

      // The pair has to match. A branch slug that exists under a *different*
      // venue is a 404 here, not a redirect — see `PublicGateway`.
      const found = findBranchBySlug(venue, branchSlug);
      if (!found) return null;

      const { branch, fixture } = found;
      const counts = await freeTablesFor(branch.id, fixture);

      return {
        venue: venueHeader(venue),
        id: branch.id,
        slug: fixture.slug,
        name: branch.name,
        status: fixture.status,
        addressLine: fixture.addressLine,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        phoneE164: fixture.phoneE164,
        timeZoneId: branch.timeZoneId,
        openState: openStateFrom(fixture.weeklyHours, now(), branch.timeZoneId),
        weeklyHours: fixture.weeklyHours,
        freeTables: counts.free,
        totalTables: counts.total,
        asOfUtc: now().toISOString(),
        policy: DEFAULT_POLICY,
        bookingWindowDays: BOOKING_WINDOW_DAYS,
        acceptsWebBookings: fixture.acceptsWebBookings,
      };
    },

    async getBranchMeta({
      venueSlug,
      branchSlug,
      canonicalUrl,
      locale,
    }): Promise<PublicPageMeta | null> {
      await wait();
      const venue = findVenueBySlug(venueSlug);
      if (!venue) return null;
      const found = findBranchBySlug(venue, branchSlug);
      if (!found) return null;

      const { branch, fixture } = found;
      const counts = await freeTablesFor(branch.id, fixture);
      const header = venueHeader(venue);

      return {
        title: `${venue.name} — ${branch.name}`,
        // The count is in the description on purpose: it is the one thing in a
        // WhatsApp preview that makes somebody tap rather than scroll past.
        description:
          fixture.status === 'live'
            ? `${counts.free} of ${counts.total} tables free right now. ${fixture.addressLine}.`
            : fixture.addressLine,
        imageUrl: header.coverPhoto?.cardUrl ?? null,
        canonicalUrl,
        siteName: 'Yalla',
        locale,
      };
    },

    async getManagedBooking({ token }): Promise<ManagedBooking | null> {
      await wait();
      const bookingId = bookingIdFromToken(token);
      if (!bookingId) return null;
      const booking = await gateway.getBooking(bookingId);
      return booking ? managedFrom(booking) : null;
    },

    async cancelManagedBooking({ token }): Promise<ManagedBooking> {
      await wait();
      const bookingId = bookingIdFromToken(token);
      if (!bookingId) throw new Error('Unknown manage-booking token.');

      const existing = await gateway.getBooking(bookingId);
      if (!existing) throw new Error('Unknown manage-booking token.');
      // Already cancelled is a success, not a conflict: the person expressed
      // their intention twice on a bad connection, they did not make a mistake.
      if (existing.status === 'cancelledByDiner' || existing.status === 'cancelledByVenue') {
        return managedFrom(existing);
      }

      return managedFrom(await gateway.cancelBooking(bookingId));
    },
  };
}
