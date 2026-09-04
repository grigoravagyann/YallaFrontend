import type { ApiClient } from '../client';
import type { ConsoleGateway } from '../consoleGateway';
import type {
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  Page,
} from '../contracts/console';
import {
  OutOfScopeError,
  SlugTakenError,
  VenueHasOpenTabsError,
  type BlockingTab,
} from '../contracts/errors';
import { ApiError } from '../errors';

/**
 * The console over HTTP.
 *
 * The scope rule made concrete: no method takes a venue or branch id the client
 * invented. Every id here came from `getCurrentUser` or from a list the server
 * already filtered, and the server checks again regardless — a 403 comes back
 * as {@link OutOfScopeError} and the UI shows a plain refusal rather than
 * bouncing the user around a redirect loop.
 */
export function createConsoleHttpGateway(client: ApiClient): ConsoleGateway {
  function translate(error: unknown, context: { venueId?: string; slug?: string }): never {
    if (!(error instanceof ApiError)) throw error;

    if (error.status === 403) throw new OutOfScopeError({ url: error.url });

    const body = error.body as
      { code?: string; openTabs?: readonly BlockingTab[]; slug?: string } | undefined;

    if (error.status === 409 && body?.code === 'venueHasOpenTabs') {
      throw new VenueHasOpenTabsError({
        url: error.url,
        venueId: context.venueId ?? '',
        // An empty list here is a backend bug, and the screen says "still in
        // service" without naming a table rather than claiming none are open.
        openTabs: body.openTabs ?? [],
      });
    }

    if (error.status === 409 && body?.code === 'slugTaken') {
      throw new SlugTakenError({ url: error.url, slug: body.slug ?? context.slug ?? '' });
    }

    throw error;
  }

  /** Every console command posts, carries its id, and returns the whole venue. */
  async function command(
    path: string,
    commandId: string,
    context: { venueId?: string },
    payload?: Record<string, unknown>,
  ): Promise<ConsoleVenueDetail> {
    try {
      const { data } = await client.post<ConsoleVenueDetail>(
        path,
        { commandId, ...payload },
        { headers: { 'idempotency-key': commandId } },
      );
      return data;
    } catch (error) {
      return translate(error, context);
    }
  }

  return {
    async getCurrentUser(): Promise<ConsoleUser> {
      const { data } = await client.get<ConsoleUser>('/console/me');
      return data;
    },

    async listVenues(query: ListVenuesQuery): Promise<Page<ConsoleVenue>> {
      const { data } = await client.get<Page<ConsoleVenue>>('/console/venues', {
        query: {
          ...(query.search ? { search: query.search } : {}),
          ...(query.page ? { page: query.page } : {}),
          ...(query.pageSize ? { pageSize: query.pageSize } : {}),
          ...(query.includeDeleted ? { includeDeleted: true } : {}),
        },
      });
      return data;
    },

    async getVenue(venueId) {
      const { data } = await client.get<ConsoleVenueDetail>(`/console/venues/${venueId}`);
      return data;
    },

    async createVenue(cmd: CreateVenueCommand) {
      try {
        const { data } = await client.post<ConsoleVenueDetail>('/console/venues', cmd, {
          headers: { 'idempotency-key': cmd.commandId },
        });
        return data;
      } catch (error) {
        return translate(error, { slug: cmd.slug });
      }
    },

    suspendVenue({ venueId, commandId }) {
      return command(`/console/venues/${venueId}/suspend`, commandId, { venueId });
    },

    resumeVenue({ venueId, commandId }) {
      return command(`/console/venues/${venueId}/resume`, commandId, { venueId });
    },

    deleteVenue({ venueId, commandId }) {
      return command(`/console/venues/${venueId}/delete`, commandId, { venueId });
    },

    setBranchTier({ branchId, tier, commandId }) {
      return command(`/console/branches/${branchId}/tier`, commandId, {}, { tier });
    },
  };
}
