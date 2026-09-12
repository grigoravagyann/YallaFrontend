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
  ManagedVenue,
  Page,
  SubscriptionTier,
} from '../contracts/console';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  FloorPlanSaveResult,
  TableDeletionResult,
} from '../contracts/floorPlan';
import type {
  PolicyChangeResult,
  ReservationPolicy,
  WeeklyHours,
} from '../contracts/branchSettings';
import type { AdminMenuCategory, AdminMenuItem, MenuItemDeletion } from '../contracts/menuAdmin';
import type { BranchPublicProfile } from '../contracts/publicProfile';
import { absolutePhoto } from './photoUrl';
import type { PhotoUpload } from '../consoleGateway';
import { REPORT_MAX_DAYS } from '../contracts/reports';
import type { ReportExport, ReportQuery } from '../contracts/reports';
import {
  BranchNotReadyError,
  CategoryInUseError,
  ReportRangeTooLongError,
  StaffPermissionError,
  FloorPlanInvalidError,
  OverlappingHoursError,
  PolicyBoundsError,
  SlugTakenError,
  UnsupportedImageError,
} from '../contracts/errors';
import { ApiError, ForbiddenError, NetworkError, TimeoutError, UnauthorizedError } from '../errors';
import type { components } from '../generated/schema';
import { parseProblem } from '../problem';
import {
  consoleBookingFromWire,
  managedVenueFromWire,
  venueDetailFromWire,
  venuePageFromWire,
  type WireManagedVenue,
} from './consoleMapping';
import {
  createStaffBody,
  enrolmentCode,
  staffDevice,
  staffMember,
  staffSignInLink,
  updateStaffBody,
} from './staffAdminMapping';
import {
  fileNameFrom,
  menuReport,
  occupancyReport,
  reservationReport,
  revenueReport,
  staffReport,
} from './reportMapping';
import {
  adminCategory,
  adminItem,
  adminMenu,
  hoursBlocks,
  menuItemDeletion,
  overlappingDaysFromMessage,
  photo,
  policyChangeResult,
  policyCommand,
  policyFieldFromMessage,
  reservationPolicy,
  spiceCode,
  weeklyHours,
} from './venueSettingsMapping';

type Schemas = components['schemas'];
type WireDetail = Schemas['Yalla.Application.Platform.VenueDetail'];
type WireCategory = Schemas['Yalla.Application.Menus.MenuCategoryView'];
type WireItem = Schemas['Yalla.Application.Menus.MenuItemView'];
type WireHours = Schemas['Yalla.Application.BranchSettings.OpeningHoursView'];
type WirePublicProfile = Schemas['Yalla.Application.BranchSettings.PublicProfileView'];

/**
 * The public page's settings, with the absent-when-null fields made explicit
 * and the cover's links resolved against the API — see `photoUrl.ts`.
 */
function publicProfile(view: WirePublicProfile, baseUrl: string): BranchPublicProfile {
  return {
    phoneE164: view.phoneE164 ?? null,
    acceptsWebBookings: view.acceptsWebBookings,
    coverPhoto: view.coverPhoto ? absolutePhoto(baseUrl, photo(view.coverPhoto)) : null,
  };
}
type WirePolicy = Schemas['Yalla.Application.BranchSettings.ReservationPolicyView'];
type WirePolicyResult = Schemas['Yalla.Application.BranchSettings.ReservationPolicyChangeResult'];
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
const VENUES = '/api/venues';
const RESERVATIONS = '/api/reservations';

type WireReservation = components['schemas']['Yalla.Application.Reservations.ReservationView'];
type WireDecision = components['schemas']['Yalla.Api.Endpoints.DecideReservationRequest'];

// `WireStaff` is taken by the staff *report*; this is the staff *member*.
type WireStaffMember = components['schemas']['Yalla.Application.Staff.StaffMemberView'];
type WireDevice = components['schemas']['Yalla.Application.Auth.StaffDeviceSummary'];
type WireCode = components['schemas']['Yalla.Application.Auth.DeviceEnrolmentCodeResult'];
type WireSignInLink = components['schemas']['Yalla.Application.Staff.StaffSignInLink'];

/**
 * A 403 from the staff routes is the role guard, and it names the field.
 *
 * Surfaced against the control that caused it rather than as a form-level
 * banner: "you cannot assign that role" belongs under the role picker, where
 * the next action is obvious, not above a form where it reads as a refusal of
 * the whole thing.
 */
function staffRefusal(error: unknown): never {
  if (error instanceof ApiError && error.status === 403) {
    const problem = parseProblem(error.body);
    const field = problem?.context?.['field'];
    throw new StaffPermissionError({
      url: error.url,
      detail: problem?.detail ?? error.message,
      field: typeof field === 'string' ? field : null,
    });
  }
  throw error;
}

/**
 * Reports are queried live against the operational tables and the menu one
 * anti-joins the whole menu, so they are allowed longer than an ordinary read
 * before the client gives up. Still finite: a request that will not finish
 * should say so rather than hold a spinner until somebody reloads.
 */
const REPORT_TIMEOUT_MS = 30_000;

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Inclusive of both ends, matching `ReportRange.Days` on the server. */
function daysBetween({ from, to }: { from: string; to: string }): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

type WireOccupancy = components['schemas']['Yalla.Application.Reports.OccupancyReport'];
type WireReservations = components['schemas']['Yalla.Application.Reports.ReservationReport'];
type WireRevenue = components['schemas']['Yalla.Application.Reports.RevenueReport'];
type WireMenu = components['schemas']['Yalla.Application.Reports.MenuReport'];
type WireStaff = components['schemas']['Yalla.Application.Reports.StaffReport'];

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
 * Two tiers of venue read. Venue *management* — listing, creating, suspending
 * — is the platform tier: `/api/platform/venues`, guarded by
 * `PlatformAdminOnly` server-side, and a venue user calling it gets a 403 that
 * surfaces as a plain refusal rather than a retry loop. The venue *a person
 * runs* is `GET /api/venues/{venueId}/manage`, the one read an owner or a
 * manager is allowed, and the one the venue section learns its branches from.
 * Nothing here sends a role or a scope — the token carries both.
 *
 * Every method maps a real endpoint. Nothing is faked: a fabricated
 * "suspended" would be worse than any error.
 */
/**
 * The canvas a new branch's floor starts on, in the editor's own units.
 *
 * `CreateBranchCommand` requires both, and the create form does not ask: an
 * owner sets the real room size in the floor plan editor, with the room in
 * front of them. This is a starting canvas, not a claim about the building, and
 * it matches the dimensions the seeded demo branch uses.
 */
const NEW_BRANCH_FLOOR = { width: 1000, height: 700 } as const;

/** `SubscriptionTier.Free`. Every venue starts free; the platform upgrades it later. */
const FREE_TIER = 1;

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

  /**
   * The query string every report and every export shares.
   *
   * One place, because the five reports and their five exports must ask the
   * *same* question — an export whose range differed from the screen's by a day
   * would be a file that quietly disagreed with the report it came from.
   */
  function reportQuery(query: ReportQuery, format?: 'csv') {
    return {
      from: query.from,
      to: query.to,
      // Only sent when true: an owner's rollup is the exception, and a `false`
      // on every ordinary request is noise in a log somebody will read.
      ...(query.rollUpVenue ? { rollUpVenue: true } : {}),
      ...(format ? { format } : {}),
    };
  }

  /**
   * One report group.
   *
   * The 400 the server raises for an over-long range is translated here rather
   * than at each of the five call sites, and it carries the server's own limit:
   * a screen that named a different number from the one actually enforced would
   * be telling an owner to narrow a range that was already narrow enough.
   */
  async function report<T>(section: string, query: ReportQuery): Promise<T> {
    try {
      const { data } = await client.get<T>(`${BRANCHES}/${query.branchId}/reports/${section}`, {
        query: reportQuery(query),
        timeoutMs: REPORT_TIMEOUT_MS,
      });
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        const problem = parseProblem(error.body);
        throw new ReportRangeTooLongError({
          url: error.url,
          requestedDays: numberFrom(problem?.context?.['requestedDays']) ?? daysBetween(query),
          maxDays: numberFrom(problem?.context?.['maxDays']) ?? REPORT_MAX_DAYS,
        });
      }
      throw error;
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

  // Photo links resolved against the API's origin, at the boundary — see
  // `photoUrl.ts`. The console is the one client that draws every variant.
  const absoluteItem = (item: AdminMenuItem): AdminMenuItem => ({
    ...item,
    photo: absolutePhoto(client.baseUrl, item.photo),
  });
  const absoluteCategory = (category: AdminMenuCategory): AdminMenuCategory => ({
    ...category,
    items: category.items.map(absoluteItem),
  });

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
      // manager created with no branch. None of these is a broken token, and
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
      return venuePageFromWire(data);
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
         * address, latitude, longitude, timeZoneId, floorWidth, floorHeight and
         * subscriptionTier, and sending two of them answered
         * `400 Value must not be null or blank. (Parameter 'slug')` on every
         * attempt. Venue creation had never worked against a real backend.
         */
        const { data } = await client.post<WireDetail>(`${PLATFORM}/venues`, {
          name: command.name,
          slug: command.slug,
          type: command.type === 'restaurant' ? 2 : 1,
          firstBranch: {
            name: command.firstBranch.name,
            slug: command.firstBranch.slug,
            address: command.firstBranch.address,
            latitude: command.firstBranch.latitude,
            longitude: command.firstBranch.longitude,
            timeZoneId: command.firstBranch.timeZoneId,
            floorWidth: NEW_BRANCH_FLOOR.width,
            floorHeight: NEW_BRANCH_FLOOR.height,
            subscriptionTier: FREE_TIER,
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
      let venueId: string;
      try {
        const { data } = await client.patch<Schemas['Yalla.Application.Platform.BranchSummary']>(
          `${PLATFORM}/branches/${branchId}`,
          { subscriptionTier: TIER_TO_WIRE[tier] },
        );
        venueId = data.venueId;
      } catch (error) {
        // Going Paid with an unfinished menu is the one refusal with a number
        // in it, so it gets a type. Going Free with open tabs is a plain 409
        // whose sentence already names the tables; it is left as it arrives.
        if (error instanceof ApiError && error.code === 'branch-not-ready') {
          const context = error.problem?.context as
            { branchId?: unknown; incompleteMenuItemCount?: unknown } | null | undefined;
          throw new BranchNotReadyError({
            url: error.url,
            requestId: error.requestId,
            branchId: typeof context?.branchId === 'string' ? context.branchId : branchId,
            incompleteMenuItemCount:
              typeof context?.incompleteMenuItemCount === 'number'
                ? context.incompleteMenuItemCount
                : 0,
          });
        }
        throw error;
      }
      // The patch answers with the branch, not the venue the console caches.
      // Re-read the venue so the screen replaces rather than patches.
      return venueDetail(`${PLATFORM}/venues/${venueId}`);
    },
    // --- The menu editor --------------------------------------------------------

    async getAdminMenu(branchId: string): Promise<readonly AdminMenuCategory[]> {
      // `/menu/manage`, not the diner's `/menu`: this one is reachable for a
      // suspended venue, and a manager fixing their menu during a suspension is
      // exactly who is looking at this screen.
      const { data } = await client.get<WireCategory[]>(`${BRANCHES}/${branchId}/menu/manage`);
      return adminMenu(data ?? []).map(absoluteCategory);
    },

    async createCategory({ branchId, name, displayOrder }): Promise<AdminMenuCategory> {
      const { data } = await client.post<WireCategory>(`${BRANCHES}/${branchId}/menu/categories`, {
        name,
        displayOrder,
      } satisfies Schemas['Yalla.Application.Menus.CreateMenuCategoryCommand']);
      return absoluteCategory(adminCategory(data));
    },

    async updateCategory({ branchId, categoryId, name, displayOrder }) {
      const { data } = await client.patch<WireCategory>(
        `${BRANCHES}/${branchId}/menu/categories/${categoryId}`,
        {
          ...(name !== undefined ? { name } : {}),
          ...(displayOrder !== undefined ? { displayOrder } : {}),
        } satisfies Schemas['Yalla.Application.Menus.UpdateMenuCategoryCommand'],
      );
      return absoluteCategory(adminCategory(data));
    },

    async deleteCategory({ branchId, categoryId }): Promise<void> {
      try {
        await client.delete(`${BRANCHES}/${branchId}/menu/categories/${categoryId}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new CategoryInUseError({
            url: error.url,
            categoryId,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    async createMenuItem({ branchId, item }): Promise<AdminMenuItem> {
      const { data } = await client.post<WireItem>(
        `${BRANCHES}/${branchId}/menu/categories/${item.categoryId}/items`,
        {
          name: item.name,
          description: item.description,
          priceAmd: item.priceDram,
          ingredients: item.ingredients,
          allergens: item.allergens,
          portionSize: item.portionSize,
          spiceLevel: spiceCode(item.spiceLevel),
          prepMinutes: item.prepMinutes,
          photoId: item.photoId,
          displayOrder: item.displayOrder,
        } satisfies Schemas['Yalla.Application.Menus.CreateMenuItemCommand'],
      );
      return absoluteItem(adminItem(data));
    },

    async updateMenuItem({ branchId, itemId, patch }): Promise<AdminMenuItem> {
      const { data } = await client.patch<WireItem>(
        `${BRANCHES}/${branchId}/menu/items/${itemId}`,
        {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.priceDram !== undefined ? { priceAmd: patch.priceDram } : {}),
          ...(patch.ingredients !== undefined ? { ingredients: patch.ingredients } : {}),
          ...(patch.allergens !== undefined ? { allergens: patch.allergens } : {}),
          ...(patch.portionSize !== undefined ? { portionSize: patch.portionSize } : {}),
          ...(patch.spiceLevel !== undefined ? { spiceLevel: spiceCode(patch.spiceLevel) } : {}),
          ...(patch.prepMinutes !== undefined ? { prepMinutes: patch.prepMinutes } : {}),
          ...(patch.photoId !== undefined ? { photoId: patch.photoId } : {}),
          ...(patch.displayOrder !== undefined ? { displayOrder: patch.displayOrder } : {}),
        } satisfies Schemas['Yalla.Application.Menus.UpdateMenuItemCommand'],
      );
      return absoluteItem(adminItem(data));
    },

    async setMenuItemAvailability({ branchId, itemId, isAvailable }): Promise<AdminMenuItem> {
      const { data } = await client.post<WireItem>(
        `${BRANCHES}/${branchId}/menu/items/${itemId}/availability`,
        {
          isAvailable,
        } satisfies Schemas['Yalla.Api.Endpoints.VenueAdminEndpoints.SetAvailabilityRequest'],
      );
      return absoluteItem(adminItem(data));
    },

    async deleteMenuItem({ branchId, itemId }): Promise<MenuItemDeletion> {
      const { data } = await client.delete<
        Schemas['Yalla.Application.Menus.MenuItemDeletionResult']
      >(`${BRANCHES}/${branchId}/menu/items/${itemId}`);
      return menuItemDeletion(data);
    },

    // --- Photos ------------------------------------------------------------------

    /**
     * The one request in this client that does not go through `ApiClient`.
     *
     * Two reasons, and both are about the upload being large. `fetch` cannot
     * report upload progress at all — there is no readable stream for the
     * request body in any shipping browser — and these are eight-megabyte phone
     * photos over a hotel wifi, where a bar is the difference between waiting
     * and reloading. `XMLHttpRequest` still has `upload.onprogress`, so it is
     * what this uses.
     *
     * The body is `FormData` with a single `file` part and **no explicit
     * content type**: the boundary is generated by the browser, and setting the
     * header by hand omits it and produces a body the server cannot parse.
     */
    uploadPhoto({ branchId, file, fileName, onProgress, signal }): Promise<PhotoUpload> {
      return new Promise<PhotoUpload>((resolve, reject) => {
        void (async () => {
          const url = `${client.baseUrl.replace(/\/+$/u, '')}${BRANCHES}/${branchId}/photos`;
          const token = await auth.getAccessToken();

          const request = new XMLHttpRequest();
          request.open('POST', url, true);
          request.responseType = 'json';
          if (token) request.setRequestHeader('authorization', `Bearer ${token}`);
          request.setRequestHeader('accept', 'application/json');

          request.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              onProgress?.(event.loaded / event.total);
            }
          };

          request.onerror = () => reject(new NetworkError({ url }));
          request.ontimeout = () => reject(new TimeoutError({ url, timeoutMs: 0 }));
          request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

          request.onload = () => {
            const body: unknown =
              typeof request.response === 'string' && request.response.length > 0
                ? safeJson(request.response)
                : request.response;

            if (request.status >= 200 && request.status < 300) {
              const result = body as Schemas['Yalla.Application.Media.PhotoUploadResult'];
              onProgress?.(1);
              resolve({
                photo: absolutePhoto(client.baseUrl, photo(result.photo)),
                wasDeduplicated: result.wasDeduplicated,
                bytesStored: result.bytesStored,
              });
              return;
            }

            reject(photoRejection(url, request.status, body));
          };

          signal?.addEventListener('abort', () => request.abort(), { once: true });

          const form = new FormData();
          form.append('file', file, fileName);
          request.send(form);
        })().catch(reject);
      });
    },

    // --- Opening hours ------------------------------------------------------------

    async getOpeningHours(branchId: string): Promise<WeeklyHours> {
      const { data } = await client.get<WireHours[]>(`${BRANCHES}/${branchId}/opening-hours`);
      return weeklyHours(data ?? []);
    },

    async replaceOpeningHours({ branchId, week }): Promise<WeeklyHours> {
      try {
        const { data } = await client.put<WireHours[]>(
          `${BRANCHES}/${branchId}/opening-hours`,
          hoursBlocks(week),
        );
        return weeklyHours(data ?? []);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          const detail = error.problem?.detail ?? error.message;
          throw new OverlappingHoursError({
            url: error.url,
            days: overlappingDaysFromMessage(detail),
            detail,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    // --- The reservation policy ---------------------------------------------------

    // --- The public page ------------------------------------------------------------

    async getPublicProfile(branchId: string): Promise<BranchPublicProfile> {
      const { data } = await client.get<WirePublicProfile>(
        `${BRANCHES}/${branchId}/public-profile`,
      );
      return publicProfile(data, client.baseUrl);
    },

    async updatePublicProfile({ branchId, profile }): Promise<BranchPublicProfile> {
      // The server omits null fields on the way out and takes them on the way
      // in; both the phone and the picture clear with an explicit null.
      const { data } = await client.put<WirePublicProfile>(
        `${BRANCHES}/${branchId}/public-profile`,
        {
          phoneE164: profile.phoneE164,
          acceptsWebBookings: profile.acceptsWebBookings,
          coverPhotoId: profile.coverPhotoId,
        },
      );
      return publicProfile(data, client.baseUrl);
    },

    async getReservationPolicy(branchId: string): Promise<ReservationPolicy> {
      const { data } = await client.get<WirePolicy>(`${BRANCHES}/${branchId}/reservation-policy`);
      return reservationPolicy(data);
    },

    // --- Bookings waiting for approval ------------------------------------------

    async listPendingReservations(branchId: string) {
      // `status` is the server's `ReservationStatus` number: 1 is
      // PendingApproval. The server caps the list at 200 and sorts it by the
      // branch's own day and start time; the order is kept, not re-sorted.
      const { data } = await client.get<WireReservation[]>(`${BRANCHES}/${branchId}/reservations`, {
        query: { status: 1 },
      });
      return data.map(consoleBookingFromWire);
    },

    async approveReservation({ reservationId }) {
      // The body is the decision request with nothing in it: `reason` is
      // recorded on a rejection only. Sent rather than omitted so the route
      // sees a JSON document, which is what its nullable parameter is bound
      // from. The 403 and the 409 pass through as the client's own errors,
      // carrying the server's sentence as `message`.
      const { data } = await client.post<WireReservation>(
        `${RESERVATIONS}/${reservationId}/approve`,
        {} satisfies WireDecision,
      );
      return consoleBookingFromWire(data);
    },

    async rejectReservation({ reservationId, reason }) {
      const { data } = await client.post<WireReservation>(
        `${RESERVATIONS}/${reservationId}/reject`,
        { reason: reason ?? null } satisfies WireDecision,
      );
      return consoleBookingFromWire(data);
    },

    // --- Staff ----------------------------------------------------------------

    async listStaff(venueId) {
      const { data } = await client.get<WireStaffMember[]>(`${VENUES}/${venueId}/staff`);
      return data.map(staffMember);
    },

    async createStaff({ venueId, staff }) {
      try {
        const { data } = await client.post<WireStaffMember>(
          `${VENUES}/${venueId}/staff`,
          createStaffBody(staff),
        );
        return staffMember(data);
      } catch (error) {
        return staffRefusal(error);
      }
    },

    async updateStaff({ venueId, staffMemberId, patch }) {
      try {
        const { data } = await client.patch<WireStaffMember>(
          `${VENUES}/${venueId}/staff/${staffMemberId}`,
          updateStaffBody(patch),
        );
        return staffMember(data);
      } catch (error) {
        return staffRefusal(error);
      }
    },

    async setStaffPin({ venueId, staffMemberId, pin }) {
      // In the body, never the path. A PIN in a URL is a PIN in the server log,
      // the browser history and every proxy in between.
      const { data } = await client.post<WireStaffMember>(
        `${VENUES}/${venueId}/staff/${staffMemberId}/pin`,
        { pin },
      );
      return staffMember(data);
    },

    async issueStaffSignIn({ venueId, staffMemberId, email }) {
      try {
        const { data } = await client.post<WireSignInLink>(
          `${VENUES}/${venueId}/staff/${staffMemberId}/sign-in`,
          { email },
        );
        return staffSignInLink(data);
      } catch (error) {
        // Only the 403 is re-wrapped: it is the rank rule, same as create and
        // edit. The 409 (PIN-only role, deactivated, address taken) and the 422
        // (not an address) already arrive as ConcurrencyConflictError and
        // ValidationError carrying the server's own sentence, which is the
        // thing the screen shows.
        return staffRefusal(error);
      }
    },

    async clearPinLockout({ branchId, staffMemberId }) {
      await client.post<void>(`${BRANCHES}/${branchId}/staff/${staffMemberId}/clear-pin-lockout`);
    },

    // --- Devices --------------------------------------------------------------

    async listDevices(branchId) {
      const { data } = await client.get<WireDevice[]>(`${BRANCHES}/${branchId}/devices`);
      return data.map(staffDevice);
    },

    async createEnrolmentCode(branchId) {
      const { data } = await client.post<WireCode>(
        `${BRANCHES}/${branchId}/devices/enrolment-codes`,
      );
      return enrolmentCode(data);
    },

    async revokeDevice({ branchId, deviceId }) {
      await client.post<void>(`${BRANCHES}/${branchId}/devices/${deviceId}/revoke`);
    },

    // --- Reports ------------------------------------------------------------

    async getOccupancyReport(query) {
      return occupancyReport(await report<WireOccupancy>('occupancy', query));
    },

    async getReservationReport(query) {
      return reservationReport(await report<WireReservations>('reservations', query));
    },

    async getRevenueReport(query) {
      return revenueReport(await report<WireRevenue>('revenue', query));
    },

    async getMenuReport(query) {
      return menuReport(await report<WireMenu>('menu', query));
    },

    async getStaffReport(query) {
      return staffReport(await report<WireStaff>('staff', query));
    },

    async exportReport({ section, ...query }): Promise<ReportExport> {
      /*
       * The server's own CSV, carried through as bytes.
       *
       * `format=csv` on the very same route the screen read, so the file and
       * the screen are two renderings of one query rather than two queries that
       * ought to agree. The client does not build rows, order them, round
       * anything or localise a date: if the file and the screen ever disagree
       * the client is wrong by definition, so it is given no opportunity.
       *
       * The body arrives as text because it is not JSON, and goes into a Blob
       * unchanged — the server's UTF-8 BOM included, which is the only reason
       * Excel opens an Armenian venue name as words rather than mojibake.
       */
      const response = await client.get<string>(
        `${BRANCHES}/${query.branchId}/reports/${section}`,
        { query: reportQuery(query, 'csv'), timeoutMs: REPORT_TIMEOUT_MS },
      );

      const csv = typeof response.data === 'string' ? response.data : '';

      return {
        fileName: fileNameFrom(
          response.headers.get('content-disposition'),
          `${section}-${query.from}-to-${query.to}.csv`,
        ),
        contentType: response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
        bytes: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      };
    },

    async replaceReservationPolicy({ branchId, policy }): Promise<PolicyChangeResult> {
      try {
        const { data } = await client.put<WirePolicyResult>(
          `${BRANCHES}/${branchId}/reservation-policy`,
          policyCommand(policy),
        );
        return policyChangeResult(data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          const detail = error.problem?.detail ?? error.message;
          throw new PolicyBoundsError({
            url: error.url,
            field: policyFieldFromMessage(detail),
            detail,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Which of the three refusals this is.
 *
 * The server answers 409 for both "not an image we store" and "too big", with
 * the reason only in the sentence — so the sentence is what is read, and the
 * sentence itself is shown either way. The three cases have three different
 * fixes and lumping them together as "upload failed" is the version that
 * generates a support conversation about a `.jpg` that is really a HEIC.
 */
function photoRejection(url: string, status: number, body: unknown): ApiError {
  const problem = parseProblem(body);
  const detail = problem?.detail ?? 'That photo could not be uploaded.';
  const lower = detail.toLowerCase();

  if (status === 413 || lower.includes('larger') || lower.includes('too big')) {
    return new UnsupportedImageError({ url, reason: 'tooLarge', detail });
  }
  if (status === 409 || status === 415) {
    const detected = problem?.context?.['detectedFormat'];
    return new UnsupportedImageError({
      url,
      reason: lower.includes('pixel') || lower.includes('dimension') ? 'dimensions' : 'format',
      detectedFormat: typeof detected === 'string' ? detected : null,
      detail,
    });
  }
  if (status === 401) return new UnauthorizedError({ url, body, problem });
  if (status === 403) return new ForbiddenError({ url, body, problem });
  return new ApiError(detail, { status, url, body, problem });
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
