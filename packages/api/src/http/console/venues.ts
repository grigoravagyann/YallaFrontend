import { staffRoleToUserRole } from '../../auth/endpoints';
import { claimString, decodeJwtPayload } from '../../auth/jwt';
import type { ConsoleGateway } from '../../consoleGateway';
import type {
  AddBranchCommand,
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  ManagedVenue,
  Page,
  UpdateVenueCommand,
} from '../../contracts/console';
import { absolutePhotoUrl } from '../photoUrl';
import { VenueDeletionBlockedError } from '../../contracts/errors';
import { ApiError, UnauthorizedError } from '../../errors';
import type { components } from '../../generated/schema';
import {
  managedVenueFromWire,
  venueDetailFromWire,
  venueBookingsSummaryFromWire,
  venuePageFromWire,
  type WireManagedVenue,
} from '../consoleMapping';
import { venueTypeCode } from '../venueTypeMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type ConsoleHttpContext, PLATFORM, VENUES } from './context';

type Schemas = components['schemas'];
type WireDetail = Schemas['Yalla.Application.Platform.VenueDetail'];
type WirePage =
  Schemas['Yalla.Application.Platform.PagedResult`1[[Yalla.Application.Platform.VenueSummary, Yalla.Application, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]'];

/** Claim names from the backend's `YallaClaims`. */
const CLAIM = {
  staffMemberId: 'staffMemberId',
  venueId: 'venueId',
  branchId: 'branchId',
  role: 'role',
  subject: 'sub',
} as const;

export function venuesMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'getCurrentUser'
  | 'listVenues'
  | 'getVenue'
  | 'getManagedVenue'
  | 'createVenue'
  | 'updateVenue'
  | 'addBranch'
  | 'suspendVenue'
  | 'resumeVenue'
  | 'deleteVenue'
  | 'getVenueBookingsSummary'
  | 'restoreVenue'
> {
  const { client, auth, identity, translate, photoLink, venueDetail } = ctx;
  async function venueCommand(
    method: 'post' | 'delete',
    path: string,
  ): Promise<ConsoleVenueDetail> {
    const { data } =
      method === 'post'
        ? await client.post<WireDetail>(path)
        : await client.delete<WireDetail>(path);
    return venueDetailFromWire(data, photoLink);
  }

  return {
    async getCurrentUser(): Promise<ConsoleUser> {
      // Refreshes first if the held token is stale, so the claims read below
      // are from a token the server would accept right now.
      const token = await auth.getAccessToken();
      if (!token) {
        throw new UnauthorizedError({ url: '/api/auth/venue/refresh' });
      }

      const claims = decodeJwtPayload(token);
      const staffMemberId =
        claimString(claims, CLAIM.staffMemberId) ?? claimString(claims, CLAIM.subject);
      const role = claimString(claims, CLAIM.role);
      if (!staffMemberId || !role) {
        // A token without the staff claims is not a console session — a diner
        // token pasted into the wrong app, or a backend change.
        throw new UnauthorizedError({ url: '/api/auth/venue/refresh' });
      }

      const known = identity.get();
      // A platform admin belongs to no venue and no branch, and carries
      // neither claim. An owner carries the venue and no branch, and so does a
      // general manager. None of these is a broken token, and
      // none of them says what the person may reach: that is
      // `getManagedVenue`'s answer. `branchIds` is only the home branch.
      const venueId = claimString(claims, CLAIM.venueId);
      const branchId = claimString(claims, CLAIM.branchId);

      return {
        id: staffMemberId,
        // The display name is not in the token; after a reload we show none
        // until the next sign-in rather than inventing one.
        displayName: known?.staffMemberId === staffMemberId ? known.fullName : '',
        role: staffRoleToUserRole(role),
        scope: { venueId, branchIds: branchId ? [branchId] : [] },
      };
    },

    async listVenues(query: ListVenuesQuery): Promise<Page<ConsoleVenue>> {
      const { data } = await client.get<WirePage>(`${PLATFORM}/venues`, {
        query: {
          ...(query.search ? { search: query.search } : {}),
          ...(query.page ? { page: query.page } : {}),
          ...(query.pageSize ? { pageSize: query.pageSize } : {}),
          ...(query.includeDeleted ? { includeDeleted: true } : {}),
        },
      });
      return venuePageFromWire(data, (url) => absolutePhotoUrl(client.baseUrl, url));
    },

    getVenue: (venueId) => venueDetail(`${PLATFORM}/venues/${venueId}`),

    async getManagedVenue(venueId): Promise<ManagedVenue> {
      // A 403 arrives as `ForbiddenError` from the client and is left alone:
      // the notice classifies it, and there is nothing to retry.
      const { data } = await client.get<WireManagedVenue>(`${VENUES}/${venueId}/manage`);
      return managedVenueFromWire(data);
    },

    async createVenue(command: CreateVenueCommand) {
      try {
        /*
         * The backend takes no `commandId` on this route. It also does **not**
         * derive the branch slug from its name, which an earlier comment here
         * claimed: `CreateBranchCommand` requires all nine of name, slug,
         * address, latitude, longitude and timeZoneId, and sending two of them answered
         * `400 Value must not be null or blank. (Parameter 'slug')` on every
         * attempt. Venue creation had never worked against a real backend.
         */
        const { data } = await client.post<WireDetail>(`${PLATFORM}/venues`, {
          name: command.name,
          slug: command.slug,
          type: venueTypeCode(command.type),
          firstBranch: {
            name: command.firstBranch.name,
            slug: command.firstBranch.slug,
            address: command.firstBranch.address,
            latitude: command.firstBranch.latitude,
            longitude: command.firstBranch.longitude,
            // No `features`: a new branch starts on the Basic preset, and the
            // platform switches table service on from the branch's page.
            timeZoneId: command.firstBranch.timeZoneId,
          },
        });
        return venueDetailFromWire(data, photoLink);
      } catch (error) {
        return translate(error, { slug: command.slug });
      }
    },

    async updateVenue(command: UpdateVenueCommand) {
      try {
        // No `isActive`: suspend and resume are their own routes, with their
        // own audit entries, and this form does not offer either.
        const { data } = await client.patch<WireDetail>(`${PLATFORM}/venues/${command.venueId}`, {
          name: command.name,
          slug: command.slug,
          type: venueTypeCode(command.type),
        });
        return venueDetailFromWire(data, photoLink);
      } catch (error) {
        // The other 409 here is "the venue is deleted", and the screen offers
        // no edit on a deleted venue, so the one that reaches it is the slug.
        return translate(error, { slug: command.slug });
      }
    },

    async addBranch(command: AddBranchCommand) {
      try {
        await client.post<Schemas['Yalla.Application.Platform.BranchSummary']>(
          `${PLATFORM}/venues/${command.venueId}/branches`,
          {
            name: command.name,
            slug: command.slug,
            address: command.address,
            latitude: command.latitude,
            longitude: command.longitude,
            // No `features`: the Basic preset, as for a venue's first branch.
            timeZoneId: command.timeZoneId,
          },
        );
      } catch (error) {
        return translate(error, { slug: command.slug });
      }
      // The route answers with the branch; the console caches the venue.
      // Re-read it, as the feature switch does, so the screen replaces its copy.
      return venueDetail(`${PLATFORM}/venues/${command.venueId}`);
    },

    suspendVenue: ({ venueId }) => venueCommand('post', `${PLATFORM}/venues/${venueId}/suspend`),

    resumeVenue: ({ venueId }) => venueCommand('post', `${PLATFORM}/venues/${venueId}/reactivate`),

    async deleteVenue({ venueId }) {
      try {
        return await venueCommand('delete', `${PLATFORM}/venues/${venueId}`);
      } catch (error) {
        // 409 venue-deletion-blocked names what is still in use: open tables
        // and upcoming bookings. Without this the screen could only say
        // "something went wrong".
        if (error instanceof ApiError && error.code === ProblemCodes.VenueDeletionBlocked) {
          const context = error.problem?.context as
            { openTabs?: unknown; futureReservations?: unknown } | null | undefined;
          const strings = (value: unknown): string[] =>
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
          throw new VenueDeletionBlockedError({
            url: error.url,
            requestId: error.requestId,
            venueId,
            openTables: strings(context?.openTabs),
            futureBookings: strings(context?.futureReservations),
            message: error.message,
          });
        }
        throw error;
      }
    },

    async getVenueBookingsSummary({ venueId, days }) {
      const { data } = await client.get<Schemas['Yalla.Application.Platform.VenueBookingsSummary']>(
        `${PLATFORM}/venues/${venueId}/bookings-summary`,
        { query: { days } },
      );
      return venueBookingsSummaryFromWire(data);
    },

    async restoreVenue({ venueId }) {
      const { data } = await client.post<WireDetail>(`${PLATFORM}/venues/${venueId}/restore`);
      return venueDetailFromWire(data, photoLink);
    },
  };
}
