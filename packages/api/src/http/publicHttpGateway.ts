import type { ApiClient } from '../client';
import type {
  ManagedBooking,
  PublicBranch,
  PublicPageMeta,
  PublicVenue,
} from '../contracts/publicBranch';
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
import { EndpointNotWiredError } from '../contracts/errors';
import { NotFoundError } from '../errors';
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
 * Still genuinely absent server-side: the managed-booking pair. A signed link
 * that lets a person with no account cancel has no route yet, so those two keep
 * throwing {@link EndpointNotWiredError} rather than inventing an answer.
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
  };
}
