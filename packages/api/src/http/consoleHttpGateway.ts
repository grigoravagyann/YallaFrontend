import { staffRoleToUserRole, type VenueUserIdentity } from '../auth/endpoints';
import { claimString, decodeJwtPayload } from '../auth/jwt';
import type { AuthSession } from '../auth/session';
import type { ApiClient } from '../client';
import type { ConsoleGateway } from '../consoleGateway';
import type {
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  Page,
  SubscriptionTier,
} from '../contracts/console';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  FloorPlanSaveResult,
  TableDeletionResult,
} from '../contracts/floorPlan';
import { FloorPlanInvalidError, SlugTakenError } from '../contracts/errors';
import { ApiError, ForbiddenError, UnauthorizedError } from '../errors';
import type { components } from '../generated/schema';
import { venueDetailFromWire, venuePageFromWire } from './consoleMapping';

type Schemas = components['schemas'];
type WireDetail = Schemas['Yalla.Application.Platform.VenueDetail'];
type WirePage =
  Schemas['Yalla.Application.Platform.PagedResult`1[[Yalla.Application.Platform.VenueSummary, Yalla.Application, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]'];

/**
 * The name the sign-in response gave us, kept for the session.
 *
 * The backend has no `/me` endpoint, so after a reload the console rebuilds the
 * signed-in user from the access token's claims. Those carry the ids and the
 * role but not the display name, which is why the sign-in result is kept here
 * and read back when the token is refreshed rather than re-issued.
 */
export interface ConsoleIdentityStore {
  get(): VenueUserIdentity | null;
  set(identity: VenueUserIdentity | null): void;
}

export function createMemoryIdentityStore(): ConsoleIdentityStore {
  let value: VenueUserIdentity | null = null;
  return {
    get: () => value,
    set: (identity) => {
      value = identity;
    },
  };
}

export interface ConsoleHttpGatewayOptions {
  readonly auth: AuthSession;
  readonly identity: ConsoleIdentityStore;
}

/** Claim names from the backend's `YallaClaims`. */
const CLAIM = {
  staffMemberId: 'staffMemberId',
  venueId: 'venueId',
  branchId: 'branchId',
  role: 'role',
  subject: 'sub',
} as const;

const PLATFORM = '/api/platform';
const BRANCHES = '/api/branches';

/** `Yalla.Domain.Enums.TableShape`: 1 Rectangle, 2 Round. */
function shapeFromWire(value: number): 'rectangle' | 'round' {
  return value === 2 ? 'round' : 'rectangle';
}

function shapeToWire(shape: 'rectangle' | 'round'): number {
  return shape === 'round' ? 2 : 1;
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** `Yalla.Domain.Enums.SubscriptionTier`: 1 Free, 2 Paid. */
const TIER_TO_WIRE: Readonly<Record<SubscriptionTier, number>> = { free: 1, paid: 2 };

/**
 * The console over HTTP.
 *
 * Venue management is the platform tier: `/api/platform/venues`, guarded by
 * `PlatformAdminOnly` server-side. Nothing here sends a role or a scope — the
 * token carries both, and a venue user calling these gets a 403 that surfaces
 * as a plain refusal rather than a retry loop.
 *
 * Every method maps a real endpoint. Nothing is faked: a fabricated
 * "suspended" would be worse than any error.
 */
export function createConsoleHttpGateway(
  client: ApiClient,
  options: ConsoleHttpGatewayOptions,
): ConsoleGateway {
  const { auth, identity } = options;

  /**
   * A 409 on create means the slug is taken — the one conflict this surface
   * raises, and the fix is a specific field.
   */
  function translate(error: unknown, context: { slug?: string }): never {
    if (error instanceof ApiError && error.status === 409) {
      throw new SlugTakenError({ url: error.url, slug: context.slug ?? '' });
    }
    throw error;
  }

  async function venueDetail(path: string, context: { slug?: string } = {}) {
    try {
      const { data } = await client.get<WireDetail>(path);
      return venueDetailFromWire(data);
    } catch (error) {
      return translate(error, context);
    }
  }

  async function venueCommand(
    method: 'post' | 'delete',
    path: string,
  ): Promise<ConsoleVenueDetail> {
    const { data } =
      method === 'post'
        ? await client.post<WireDetail>(path)
        : await client.delete<WireDetail>(path);
    return venueDetailFromWire(data);
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
      // neither claim. That is the correct empty scope, not a broken token.
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
      return venuePageFromWire(data);
    },

    getVenue: (venueId) => venueDetail(`${PLATFORM}/venues/${venueId}`),

    async createVenue(command: CreateVenueCommand) {
      try {
        // The backend takes no `commandId` on this route and derives the
        // branch slug from its name; the fields it does take are sent, and
        // nothing is invented for the ones it does not.
        const { data } = await client.post<WireDetail>(`${PLATFORM}/venues`, {
          name: command.name,
          slug: command.slug,
          type: command.type === 'restaurant' ? 2 : 1,
          firstBranch: {
            name: command.firstBranch.name,
            timeZoneId: command.firstBranch.timeZoneId,
          },
        });
        return venueDetailFromWire(data);
      } catch (error) {
        return translate(error, { slug: command.slug });
      }
    },

    suspendVenue: ({ venueId }) => venueCommand('post', `${PLATFORM}/venues/${venueId}/suspend`),

    resumeVenue: ({ venueId }) => venueCommand('post', `${PLATFORM}/venues/${venueId}/reactivate`),

    deleteVenue: ({ venueId }) => venueCommand('delete', `${PLATFORM}/venues/${venueId}`),

    // --- The floor plan editor ----------------------------------------------

    async getFloorPlan(branchId: string): Promise<EditorFloorPlan> {
      const { data } = await client.get<WireFloorPlan>(`${BRANCHES}/${branchId}/floor-plan`);
      return floorPlanFromWire(data);
    },

    async replaceFloorPlan({ branchId, command }): Promise<FloorPlanSaveResult> {
      try {
        const { data } = await client.put<WireSaveResult>(`${BRANCHES}/${branchId}/floor-plan`, {
          floorWidth: command.floorWidth,
          floorHeight: command.floorHeight,
          areas: command.areas.map((area) => ({
            id: area.id ?? null,
            name: area.name,
            displayOrder: area.displayOrder,
          })),
          tables: command.tables.map((table) => ({
            id: table.id ?? null,
            label: table.label,
            seats: table.seats,
            x: Math.round(table.x),
            y: Math.round(table.y),
            width: Math.round(table.width),
            height: Math.round(table.height),
            rotationDegrees: table.rotationDegrees,
            shape: shapeToWire(table.shape),
            floorAreaName: table.floorAreaName ?? null,
            isBookable: table.isBookable,
            // `qrToken` is deliberately absent. The sticker on the table has to
            // keep working, and the only way it changes is the explicit
            // regenerate action.
          })),
        });
        return {
          plan: floorPlanFromWire(data.plan),
          warnings: data.warnings ?? [],
          deactivatedTables: data.deactivatedTables ?? [],
          removedTables: data.removedTables ?? [],
        };
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          const context = error.problem?.context ?? {};
          throw new FloorPlanInvalidError({
            url: error.url,
            errors: stringList(context['errors']).length
              ? stringList(context['errors'])
              : [error.message],
            tablesOutsideCanvas: stringList(context['tablesOutsideCanvas']),
            duplicateLabels: stringList(context['duplicateLabels']),
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    async createFloorArea({ branchId, name, displayOrder }): Promise<EditorFloorArea> {
      const { data } = await client.post<WireArea>(`${BRANCHES}/${branchId}/floor-areas`, {
        name,
        displayOrder,
      });
      return data;
    },

    async updateFloorArea({ branchId, areaId, name, displayOrder }): Promise<EditorFloorArea> {
      const { data } = await client.patch<WireArea>(
        `${BRANCHES}/${branchId}/floor-areas/${areaId}`,
        { name, displayOrder },
      );
      return data;
    },

    async deleteFloorArea({ branchId, areaId }): Promise<void> {
      await client.delete(`${BRANCHES}/${branchId}/floor-areas/${areaId}`);
    },

    async deleteTable({ branchId, tableId }): Promise<TableDeletionResult> {
      const { data } = await client.delete<TableDeletionResult>(
        `${BRANCHES}/${branchId}/tables/${tableId}`,
      );
      return data;
    },

    async regenerateTableQr({ tableId }): Promise<{ qrToken: string }> {
      const { data } = await client.post<WireTable>(`/api/tables/${tableId}/regenerate-qr`);
      return { qrToken: data.qrToken };
    },

    /**
     * The tier lives on a branch, and the backend changes it through the
     * general branch patch rather than a tier-specific route.
     */
    async setBranchTier({ branchId, tier }) {
      const { data } = await client.patch<Schemas['Yalla.Application.Platform.BranchSummary']>(
        `${PLATFORM}/branches/${branchId}`,
        { subscriptionTier: TIER_TO_WIRE[tier] },
      );
      // The patch answers with the branch, not the venue the console caches.
      // Re-read the venue so the screen replaces rather than patches.
      return venueDetail(`${PLATFORM}/venues/${data.venueId}`);
    },
  };
}

type WireArea = EditorFloorArea;

interface WireTable {
  id: string;
  label: string;
  seats: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  shape: number;
  floorAreaId?: string | null;
  isBookable: boolean;
  isActive: boolean;
  qrToken: string;
}

interface WireFloorPlan {
  branchId: string;
  floorWidth: number;
  floorHeight: number;
  areas?: WireArea[];
  tables?: WireTable[];
}

interface WireSaveResult {
  plan: WireFloorPlan;
  warnings?: string[];
  deactivatedTables?: string[];
  removedTables?: string[];
}

function floorPlanFromWire(plan: WireFloorPlan): EditorFloorPlan {
  return {
    branchId: plan.branchId,
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    areas: [...(plan.areas ?? [])].sort((a, b) => a.displayOrder - b.displayOrder),
    tables: (plan.tables ?? []).map((table) => ({
      id: table.id,
      label: table.label,
      seats: table.seats,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      rotationDegrees: table.rotationDegrees,
      shape: shapeFromWire(table.shape),
      floorAreaId: table.floorAreaId ?? null,
      isBookable: table.isBookable,
      isActive: table.isActive,
      qrToken: table.qrToken,
    })),
  };
}

/** Re-exported so a screen inspecting the refusal needs one import. */
export { ForbiddenError };
