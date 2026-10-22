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
import type { SpecialDay } from '../contracts/branchSettings';
import { openStateFrom } from '../contracts/openState';
import { NotFoundError } from '../errors';
import { BookingLinkAccountUnavailableError, PhoneNotVerifiedError } from '../contracts/errors';
import {
  publicBranchFixtures,
  publicVenueFixtures,
  type PublicBranchFixture,
} from './publicVenues';
import { mockVenues, type Branch, type Venue } from './venues';
import { asksOnYourWay, type OnMyWayResult, type PreOrderResult } from '../contracts/preOrder';
import { venueIsAsking, type RunningLateResult } from '../contracts/onMyWay';
import type { MockGateway } from './mockGateway';

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
  /**
   * Northern Avenue closed for a day five days out and open late for a wine
   * night nine days out, so the hours' special days show in mock mode. Off
   * unless asked: the public fixtures keep to their week in tests, and the
   * console mock owns special days.
   */
  readonly showcaseSpecialDays?: boolean | undefined;
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

const URL_TAG = 'mock://yalla';

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

/** The branch the mock's showcase data sits on. */
const SHOWCASE_BRANCH = 'b-lumen-north';

/** Two special days ahead of `now`, as calendar dates in the branch's zone. */
function showcaseSpecialDays(now: Date, timeZoneId: string): SpecialDay[] {
  const dateIn = (days: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now.getTime() + days * 86_400_000));
  return [
    { date: dateIn(5), note: 'Staff training', blocks: [] },
    { date: dateIn(9), note: 'Wine night', blocks: [{ opensAt: '09:00', closesAt: '02:00' }] },
  ];
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
      reservationId: booking.id,
      code: booking.code,
      status: managedStatus(booking.status),
      venueName: booking.venueName ?? venue?.name ?? '',
      venueSlug: venue ? (publicVenueFixtures[venue.id]?.slug ?? venue.id) : '',
      branchName: booking.branchName,
      branchSlug: fixture?.slug ?? '',
      addressLine: fixture?.addressLine ?? '',
      timeZoneId: booking.timeZoneId,
      tableId: booking.tableId,
      tableLabel: booking.tableLabel,
      // The booking's own room, as `PublicBookingView.roomName` carries it; the
      // floor's for a booking made before bookings knew their room.
      floorAreaName:
        booking.roomName ??
        floor?.tables.find((table) => table.id === booking.tableId)?.floorAreaName ??
        null,
      partySize: booking.partySize,
      slotUtc: booking.slotUtc,
      endsAtUtc: booking.endUtc,
      freeCancellationUntilUtc: booking.freeCancellationUntilUtc,
      approvalExpiresAtUtc:
        booking.status === 'pendingApproval' ? (booking.approvalExpiresAtUtc ?? null) : null,
      declinedBecause: booking.declinedBecause ?? null,
      cancelledByVenue: booking.status === 'cancelledByVenue' && !booking.declinedBecause,
      // Booking times: why it waits, while it does, and the promise to free it.
      awaitingApprovalBecause:
        booking.status === 'pendingApproval' ? (booking.awaitingApprovalBecause ?? null) : null,
      promisedFreeByUtc: booking.promisedFreeByUtc ?? null,
      // Lateness is not a reason to refuse. Only a booking that is already over
      // or already cancelled has nothing left to cancel.
      canCancel: booking.status === 'confirmed' || booking.status === 'pendingApproval',
      // Legacy (2026-10-20): a booking made without a verified number.
      phoneUnverified: booking.phoneUnverified === true,
      // Never for a booking made without a verified number: cancel and book again.
      canChange:
        booking.phoneUnverified !== true &&
        (booking.status === 'confirmed' || booking.status === 'pendingApproval') &&
        Date.parse(booking.slotUtc) > now().getTime(),
      // Pre-orders (2026-10-21): the pre-order as the booking carries it, and
      // whether to ask "on your way". No branch id, as the link publishes none.
      preOrder: booking.preOrder ?? null,
      preOrderEditableUntilUtc: booking.preOrderEditableUntilUtc ?? null,
      guestConfirmedOnWayAtUtc: booking.guestConfirmedOnWayAtUtc ?? null,
      // "I'm coming" (2026-10-22): the guest's lateness, the venue's ask, the window.
      guestRunningLateMinutes: booking.guestRunningLateMinutes ?? null,
      staffAskedOnMyWayAtUtc: booking.staffAskedOnMyWayAtUtc ?? null,
      onMyWayOpensAtUtc: booking.onMyWayOpensAtUtc ?? null,
      // Asked automatically, or by the venue from its tablet and not answered yet.
      onYourWayAsked:
        asksOnYourWay({ ...booking, startUtc: booking.slotUtc }, now()) ||
        (booking.status === 'confirmed' && venueIsAsking(booking)),
    };
  }

  /**
   * The diner mock's own door for a link (`MockGateway`'s `…ByLink`), so the
   * link edits the very booking the page made, with no session — or, over a
   * gateway that has none, its own routes.
   */
  const door = gateway as Partial<
    Pick<
      MockGateway,
      | 'replacePreOrderByLink'
      | 'clearPreOrderByLink'
      | 'confirmOnMyWayByLink'
      | 'reportRunningLateByLink'
      | 'acceptsPreOrdersAsVenue'
    >
  >;

  /** The booking id behind a token, or the link's constant 404. */
  function linked(token: string, route: string): string {
    const bookingId = bookingIdFromToken(token);
    if (bookingId) return bookingId;
    throw new NotFoundError({
      url: `${URL_TAG}/api/public/bookings/${route}`,
      problem: {
        type: 'about:blank',
        title: 'Not found',
        status: 404,
        detail: 'This booking link is not valid.',
        code: 'not-found',
        traceId: 'mock',
      },
    });
  }

  /*
   * The diner gateway's own change, with its session's phone check read as
   * the server reads it on the link: the booking's account cannot take a
   * change (403), never "verify your phone", which this visitor cannot do.
   */
  async function moveByLink(
    command: Parameters<YallaGateway['rescheduleBooking']>[0],
  ): Promise<Booking> {
    try {
      return await gateway.rescheduleBooking(command);
    } catch (error) {
      if (error instanceof PhoneNotVerifiedError) {
        throw new BookingLinkAccountUnavailableError({ url: error.url });
      }
      throw error;
    }
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
        // The public fixtures keep to their week; the console mock owns special days.
        specialDays:
          options.showcaseSpecialDays && branch.id === SHOWCASE_BRANCH
            ? showcaseSpecialDays(now(), branch.timeZoneId)
            : [],
        freeTables: counts.free,
        totalTables: counts.total,
        asOfUtc: now().toISOString(),
        // The console mock's switch, so the page offers a pre-order exactly where the venue takes them.
        policy: {
          ...DEFAULT_POLICY,
          acceptsPreOrders: door.acceptsPreOrdersAsVenue?.(branch.id) ?? false,
        },
        bookingWindowDays: BOOKING_WINDOW_DAYS,
        acceptsWebBookings: fixture.acceptsWebBookings,
        rooms: branch.rooms
          .filter((room) => room.photos.length > 0)
          .map((room) => ({
            roomId: room.roomId,
            name: room.name,
            displayOrder: room.displayOrder,
            photos: room.photos,
          })),
        // What the chooser lists, as the server counts it: switched-on
        // branches only, this one included.
        venueBranchCount: Math.max(
          1,
          venue.branches.filter((entry) => publicBranchFixtures[entry.id]?.status === 'live')
            .length,
        ),
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

    /*
     * The link is the credential, as on the server: the move is the diner
     * gateway's own change of that booking, under the same rules, so the
     * status after it is decided there rather than guessed here.
     */
    async rescheduleManagedBooking(command): Promise<ManagedBooking> {
      await wait();
      const bookingId = bookingIdFromToken(command.token);
      const existing = bookingId ? await gateway.getBooking(bookingId) : null;
      // Made without a verified number: the link cancels it, never moves it.
      if (existing?.phoneUnverified) {
        throw new BookingLinkAccountUnavailableError({
          url: `${URL_TAG}/api/public/bookings/reschedule`,
        });
      }
      if (!bookingId || !existing) {
        // A real answer, with its code, as the server's constant 404 is.
        throw new NotFoundError({
          url: `${URL_TAG}/api/public/bookings/reschedule`,
          problem: {
            type: 'about:blank',
            title: 'Not found',
            status: 404,
            detail: 'This booking link is not valid.',
            code: 'not-found',
            traceId: 'mock',
          },
        });
      }
      return managedFrom(
        await moveByLink({
          bookingId,
          commandId: command.commandId,
          tableId: command.tableId,
          slotUtc: command.slotUtc,
          timeZoneId: command.timeZoneId,
          partySize: command.partySize,
          acceptsFreeByUtc: command.acceptsFreeByUtc,
        }),
      );
    },

    async replaceManagedPreOrder(command): Promise<PreOrderResult> {
      await wait();
      const bookingId = linked(command.token, 'pre-order');
      const draft = { lines: command.lines, note: command.note };
      return door.replacePreOrderByLink
        ? door.replacePreOrderByLink({
            ...draft,
            bookingId,
            clientCommandId: command.clientCommandId,
          })
        : gateway.replacePreOrder({
            ...draft,
            reservationId: bookingId,
            clientCommandId: command.clientCommandId,
          });
    },

    async clearManagedPreOrder({ token, clientCommandId }): Promise<PreOrderResult> {
      await wait();
      const bookingId = linked(token, 'pre-order/clear');
      return door.clearPreOrderByLink
        ? door.clearPreOrderByLink({ bookingId, clientCommandId })
        : gateway.clearPreOrder({ reservationId: bookingId, clientCommandId });
    },

    async confirmManagedOnMyWay({ token }): Promise<OnMyWayResult> {
      await wait();
      const bookingId = linked(token, 'on-my-way');
      return door.confirmOnMyWayByLink
        ? door.confirmOnMyWayByLink(bookingId)
        : gateway.confirmOnMyWay(bookingId);
    },

    async reportManagedRunningLate({ token, minutes }): Promise<RunningLateResult> {
      await wait();
      const bookingId = linked(token, 'running-late');
      return door.reportRunningLateByLink
        ? door.reportRunningLateByLink({ bookingId, minutes })
        : gateway.reportRunningLate({ reservationId: bookingId, minutes });
    },
  };
}
