import type { ApiClient } from '../client';
import type {
  ManagedBooking,
  PublicBranch,
  PublicPageMeta,
  PublicVenue,
} from '../contracts/publicBranch';
import { EndpointNotWiredError } from '../contracts/errors';
import { NotFoundError } from '../errors';
import type { PublicGateway } from '../publicGateway';

/**
 * The public page, over HTTP.
 *
 * ## What exists today, and what does not
 *
 * As of this task the backend has **no `/api/public` routes at all**. What it
 * does have, and what this page already uses through `YallaGateway`, is every
 * *live* read keyed by branch id: `GET /api/branches/{id}/availability` is
 * anonymous and carries the floor, the derived table states, the branch's zone
 * and its turn time; `GET /api/branches/{id}/menu` is anonymous and already
 * excludes unfinished items; `GET /api/photos/{id}/{variant}` is anonymous; and
 * the diner sign-in pair is anonymous by definition.
 *
 * What is missing is precisely the part that turns a guid into a link somebody
 * can put in an Instagram bio: resolving a slug pair, the venue's published
 * profile, its opening hours, the unfurl metadata, and a signed link that lets
 * a person with no account cancel. Those are the five methods below, and each
 * one throws {@link EndpointNotWiredError} rather than inventing an answer.
 *
 * The split matters for what happens when those routes land. Nothing else has
 * to change: the room, the availability window, the menu, the verification and
 * the booking all already go to the real backend through the shared gateway.
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
        const { data } = await client.get<PublicVenue>(
          `/api/public/venues/${encodeURIComponent(venueSlug)}`,
          anonymous,
        );
        return data;
      } catch (error) {
        return readMiss('resolveVenue', error);
      }
    },

    async resolveBranch({ venueSlug, branchSlug }): Promise<PublicBranch | null> {
      try {
        const { data } = await client.get<PublicBranch>(
          `/api/public/venues/${encodeURIComponent(venueSlug)}/branches/${encodeURIComponent(
            branchSlug,
          )}`,
          anonymous,
        );
        return data;
      } catch (error) {
        return readMiss('resolveBranch', error);
      }
    },

    async getBranchMeta({
      venueSlug,
      branchSlug,
      canonicalUrl,
      locale,
    }): Promise<PublicPageMeta | null> {
      try {
        const { data } = await client.get<PublicPageMeta>(
          `/api/public/venues/${encodeURIComponent(venueSlug)}/branches/${encodeURIComponent(
            branchSlug,
          )}/meta`,
          { ...anonymous, query: { canonicalUrl, locale } },
        );
        return data;
      } catch (error) {
        return readMiss('getBranchMeta', error);
      }
    },

    async getManagedBooking(token): Promise<ManagedBooking | null> {
      try {
        const { data } = await client.get<ManagedBooking>(
          `/api/public/bookings/${encodeURIComponent(token)}`,
          anonymous,
        );
        return data;
      } catch (error) {
        return readMiss('getManagedBooking', error);
      }
    },

    async cancelManagedBooking({ token, commandId }): Promise<ManagedBooking> {
      try {
        const { data } = await client.post<ManagedBooking>(
          `/api/public/bookings/${encodeURIComponent(token)}/cancel`,
          { clientCommandId: commandId },
          anonymous,
        );
        return data;
      } catch (error) {
        if (error instanceof NotFoundError && !error.code) {
          throw new EndpointNotWiredError({ url: error.url, endpoint: 'cancelManagedBooking' });
        }
        throw error;
      }
    },
  };
}
