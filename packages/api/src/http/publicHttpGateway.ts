import type { ApiClient } from '../client';
import type {
  ManagedBooking,
  PublicBranch,
  PublicPageMeta,
  PublicVenue,
  UnverifiedBookingResult,
} from '../contracts/publicBranch';
import { booking } from './dinerMapping';
import type { components } from '../generated/schema';
import { rethrowBookingRefusal } from './bookingRefusal';
import { localDateTime } from './mapping';
import {
  managedBookingFromWire,
  publicBranchFromWire,
  publicPageMetaFromWire,
  publicVenueFromCards,
  type WirePublicBooking,
  type WirePublicBranch,
  type WirePublicBranchMeta,
  type WirePublicVenueCard,
} from './publicMapping';
import {
  BookingLinkAccountUnavailableError,
  BookingsNotAcceptedError,
  EndpointNotWiredError,
} from '../contracts/errors';
import { ApiError, NotFoundError } from '../errors';
import type { PublicGateway } from '../publicGateway';

/**
 * The public page, over HTTP.
 *
 * ## What exists today, and what does not
 *
 * The `/api/public` routes have landed, and three of the five methods below now
 * call them. This file was written before they existed, against a guessed
 * shape, and the guess was wrong in both path and body — `/api/public/venues/
 * {venueSlug}/branches/{branchSlug}` where the backend serves
 * `/api/public/branches/{venueSlug}/{branchSlug}`. Every public page 404'd for
 * as long as that stood, so the URLs here are now taken from the routes in
 * `generated/schema.ts` and the bodies go through {@link publicBranchFromWire}
 * rather than being cast.
 *
 * The managed-booking pair is real as well: `GET /api/public/bookings/{token}`
 * reads a booking from its signed link, and `POST /api/public/bookings/{token}/cancel`
 * cancels it with an optional `reason`. An unknown, expired or spent token is a
 * 404 with a problem code, read as `null` on the read and rethrown on the cancel,
 * and the two are indistinguishable on purpose. A 404 with no body means this
 * build is talking to a backend without the routes, and says so with
 * {@link EndpointNotWiredError}.
 *
 * Changing the booking from the link is `POST /api/public/bookings/{token}/reschedule`
 * (public page phase 5): the app's change body, the app's refusals — read by the
 * same {@link rethrowBookingRefusal} the diner's own routes use — and two of its
 * own: a 403 `phone-not-verified` is the booking's *account* being unable to take
 * a change, never a phone this visitor could verify, and overlaps-own arrives
 * with no context, naming nothing about the other booking.
 *
 * `resolveVenue` has no by-slug route either, so it filters the list route. That
 * is a real limitation rather than a guess, and it is written down where it
 * happens.
 *
 * The rest of the page never went through this gateway at all: the room, the
 * availability window, the menu, the verification and the booking all go to the
 * real backend through the shared `YallaGateway`.
 *
 * ## Why a bare 404 is not "no such venue"
 *
 * Both a missing route and a missing venue answer 404, and the page has to tell
 * them apart — one is "this venue does not exist", which is a page, and the
 * other is "this build is talking to a backend that predates the feature",
 * which is a different page and a different person's problem.
 *
 * The tell is the body. Every deliberate 404 the backend raises goes through
 * `UnifiedExceptionHandler` and carries a problem document with a `code`; an
 * unmatched route falls out of ASP.NET's router with no body at all. So a 404
 * *with* a code is a real answer and becomes `null`; a 404 without one is a
 * route that is not there.
 */
export function createPublicHttpGateway(client: ApiClient): PublicGateway {
  /** Anonymous, always. Nothing on this page may attach a token. */
  const anonymous = { skipAuth: true } as const;

  /**
   * `null` for a genuine miss, {@link EndpointNotWiredError} for a missing
   * route, and anything else rethrown untouched.
   */
  function readMiss(endpoint: string, error: unknown): null {
    if (error instanceof NotFoundError) {
      if (error.code) return null;
      throw new EndpointNotWiredError({ url: error.url, endpoint });
    }
    throw error;
  }

  return {
    async resolveVenue(venueSlug): Promise<PublicVenue | null> {
      try {
        /*
         * The list route, filtered client-side. There is no by-slug venue route
         * — `/api/public/venues` is the only venue read the backend publishes —
         * and asking for one that does not exist is what used to 404 this page.
         */
        const { data } = await client.get<WirePublicVenueCard[]>('/api/public/venues', anonymous);
        return publicVenueFromCards(data ?? [], venueSlug);
      } catch (error) {
        return readMiss('resolveVenue', error);
      }
    },

    async resolveBranch({ venueSlug, branchSlug }): Promise<PublicBranch | null> {
      try {
        const { data } = await client.get<WirePublicBranch>(
          `/api/public/branches/${encodeURIComponent(venueSlug)}/${encodeURIComponent(branchSlug)}`,
          anonymous,
        );
        return publicBranchFromWire(data, client.baseUrl);
      } catch (error) {
        return readMiss('resolveBranch', error);
      }
    },

    async getBranchMeta({ branchId, canonicalUrl, locale }): Promise<PublicPageMeta | null> {
      try {
        // Keyed by branch id, not by the slug pair. The caller already resolved
        // the branch, so this costs no extra round trip.
        const { data } = await client.get<WirePublicBranchMeta>(
          `/api/public/branches/${encodeURIComponent(branchId)}/meta`,
          { ...anonymous, query: { locale } },
        );
        return publicPageMetaFromWire(data, canonicalUrl, client.baseUrl);
      } catch (error) {
        return readMiss('getBranchMeta', error);
      }
    },

    async getManagedBooking({ token, venueSlug, branchSlug }): Promise<ManagedBooking | null> {
      try {
        const { data } = await client.get<WirePublicBooking>(
          `/api/public/bookings/${encodeURIComponent(token)}`,
          anonymous,
        );
        return managedBookingFromWire(data, { venueSlug, branchSlug });
      } catch (error) {
        /*
         * A 404 here is the *only* answer for an unknown token, an expired one
         * and a booking that no longer exists — deliberately indistinguishable,
         * so the link cannot be used to find out which tokens are real. It is
         * `null`, which the route renders as "this link is not valid".
         *
         * A cancelled, missed or finished booking is not a 404: it answers 200
         * with its state, so somebody opening a three-week-old link learns what
         * happened to their table.
         */
        return readMiss('getManagedBooking', error);
      }
    },

    async cancelManagedBooking({ token, venueSlug, branchSlug, reason }): Promise<ManagedBooking> {
      try {
        // `reason` is the only field this route accepts; there is no command id.
        const { data } = await client.post<WirePublicBooking>(
          `/api/public/bookings/${encodeURIComponent(token)}/cancel`,
          reason === undefined ? {} : { reason },
          anonymous,
        );
        return managedBookingFromWire(data, { venueSlug, branchSlug });
      } catch (error) {
        if (error instanceof NotFoundError && !error.code) {
          throw new EndpointNotWiredError({ url: error.url, endpoint: 'cancelManagedBooking' });
        }
        throw error;
      }
    },

    async rescheduleManagedBooking(command): Promise<ManagedBooking> {
      const { date, time } = localDateTime(command.slotUtc, command.timeZoneId);
      // The whole new slot, as the app's change sends it — never only what moved.
      const body: Schemas['Yalla.Api.Endpoints.RescheduleReservationRequest'] = {
        date,
        time,
        partySize: command.partySize,
        diningTableId: command.tableId,
        clientCommandId: command.commandId,
        ...(command.acceptsFreeByUtc ? { acceptsFreeByUtc: command.acceptsFreeByUtc } : {}),
      };
      try {
        const { data } = await client.post<WirePublicBooking>(
          `/api/public/bookings/${encodeURIComponent(command.token)}/reschedule`,
          body,
          anonymous,
        );
        return managedBookingFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError && !error.code) {
          throw new EndpointNotWiredError({
            url: error.url,
            endpoint: 'rescheduleManagedBooking',
          });
        }
        if (error instanceof ApiError) {
          const base = { url: error.url, requestId: error.requestId };
          // Not this visitor's number: the booking's account can no longer
          // take a change. There is no session here to send to a code flow.
          if (error.status === 403 && error.code === 'phone-not-verified') {
            throw new BookingLinkAccountUnavailableError(base);
          }
          // The web channel switched off, said like any branch not taking bookings.
          if (error.code === 'web-bookings-not-accepted') {
            throw new BookingsNotAcceptedError(base);
          }
        }
        rethrowBookingRefusal(error, {
          branchId: null,
          tableId: command.tableId,
          partySize: command.partySize,
        });
      }
    },

    /*
     * The anonymous door (2026-10-20): no token, no proof. The token in the
     * first answer is the only copy there will ever be — a replay carries none —
     * so it is handed back beside the booking rather than read off it later.
     */
    async createUnverifiedBooking(command): Promise<UnverifiedBookingResult> {
      const { date, time } = localDateTime(command.slotUtc, command.timeZoneId);
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >(
          `/api/public/branches/${encodeURIComponent(command.branchId)}/bookings`,
          {
            tableId: command.tableId,
            date,
            time,
            partySize: command.partySize,
            guestName: command.guestName,
            guestPhone: command.guestPhone,
            deviceId: command.deviceId,
            clientCommandId: command.commandId,
            note: command.note?.trim() ? command.note.trim() : null,
            ...(command.acceptsFreeByUtc ? { acceptsFreeByUtc: command.acceptsFreeByUtc } : {}),
          },
          anonymous,
        );
        return {
          booking: booking(data, null),
          manageToken: data.manageToken?.trim() ? data.manageToken : null,
          wasReplay: data.wasReplay,
        };
      } catch (error) {
        if (error instanceof ApiError && error.code === 'web-bookings-not-accepted') {
          throw new BookingsNotAcceptedError({
            url: error.url,
            requestId: error.requestId,
            branchId: command.branchId,
          });
        }
        rethrowBookingRefusal(error, {
          branchId: command.branchId,
          tableId: command.tableId,
          partySize: command.partySize,
        });
      }
    },
  };
}

type Schemas = components['schemas'];
