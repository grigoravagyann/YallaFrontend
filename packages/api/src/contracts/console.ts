/**
 * Domain contracts for the web console — the screens the Yalla team, venue
 * owners and branch managers use.
 *
 * Deliberately a separate set from the diner contracts. What the platform
 * allows a branch and its suspension state are not things a diner's app should be able to
 * name, and `YallaGateway` describes what the diner app needs. Two interfaces
 * over one backend is cheaper than one interface nobody can read.
 */

import type { VenueType } from './booking';
import type { BranchFeature } from './branchFeatures';

/**
 * The kind of place — one union for both surfaces. A cafe a diner browses and a
 * cafe the console edits are the same `Venue.Type`, and two spellings of it
 * were how the console's create form went on offering two kinds after the
 * server had three.
 */
export type { VenueType };

/**
 * `suspended` is reversible and mostly about billing; `deleted` is a soft
 * delete the platform team can still see. Neither ever removes a row, because
 * a venue's history is what its reports are made of. `inactive` is a venue
 * switched off (`isActive` false) without being suspended — the server's
 * `VenueStatus.Inactive`.
 */
export type VenueStatus = 'active' | 'suspended' | 'inactive' | 'deleted';

// ---------------------------------------------------------------------------
// Roles and scope
// ---------------------------------------------------------------------------

/**
 * The tiers, in one place.
 *
 * `manager` is a **branch manager**: one branch, always named on their staff
 * row. `generalManager` runs every branch of the venue, below the owner and
 * above every branch manager (wire `StaffRole.GeneralManager = 6`). The id
 * `manager` was kept when its meaning narrowed, because it is what `Manager = 2`
 * has always mapped to.
 *
 * Waiter and kitchen are distinct roles with, for now, the same reach: the
 * floor screen for their branch. They are not collapsed into one because the
 * kitchen queue and the floor diverge in the next tasks, and widening a role
 * later is far easier than splitting one that people already hold.
 */
export type UserRole =
  'platformAdmin' | 'owner' | 'generalManager' | 'manager' | 'waiter' | 'kitchen';

export const USER_ROLES: readonly UserRole[] = [
  'platformAdmin',
  'owner',
  'generalManager',
  'manager',
  'waiter',
  'kitchen',
];

/**
 * What a signed-in person may reach.
 *
 * **This comes from the token and never from the URL.** A manager who edits a
 * branch id in the address bar gets a 403 from the server; the client's job is
 * to never construct such a link in the first place, which is why every screen
 * takes its branch from here rather than from a route parameter.
 */
export interface UserScope {
  /** `null` only for a platform admin, who is scoped to every venue. */
  readonly venueId: string | null;
  /**
   * The token's **home-branch claim**, and nothing more: one id for a branch
   * manager, waiter or kitchen account created at a branch, none for an owner
   * or a general manager, who are venue-wide.
   *
   * Empty does not mean "no access". An owner's token carries no branch at all
   * and they reach every branch of their venue; the console used to intersect
   * a venue's branches with this list and showed every owner "no branch" on
   * every tab. Which branches a person may work on comes from
   * {@link ConsoleGateway.getManagedVenue}, where the server decides it from
   * their staff row. This list is only the *default* the venue section opens
   * on, when the server's answer includes it.
   */
  readonly branchIds: readonly string[];
}

export interface ConsoleUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly scope: UserScope;
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

/**
 * Why a venue is not ready for diners yet, as the venues list shows it: one
 * line under the name, amber, never red.
 *
 * The first unmet line of the first branch that has one, in the order a
 * venue is onboarded: tables, then the menu, then the hours, then the cover
 * photo. `branchName` names that branch when the venue has more than one;
 * `count` is the number of unfinished dishes, and `null` for every other kind.
 * `other` is a reason this client does not know yet: still "not ready", never
 * a blank.
 */
export interface VenueReadinessIssue {
  readonly kind: 'noTables' | 'noMenu' | 'incompleteDishes' | 'noHours' | 'noPhoto' | 'other';
  readonly count: number | null;
  readonly branchName: string | null;
}

/** One branch and the features the platform allows there, as the venues list carries it. */
export interface VenueBranchFeatures {
  readonly id: string;
  readonly name: string;
  /** Allowed by the platform, in the server's order. */
  readonly features: readonly BranchFeature[];
}

/**
 * A row in the platform venues list.
 *
 * The fields marked optional are the list's newer columns (rating, open tabs,
 * readiness, cover, each branch's features, cuisine, district). **Absent means the
 * source did not report it**, which is what today's backend answers; `null`
 * means it reported "none" (no reviews yet, no cover yet). The screen hides a
 * column nobody reports rather than filling it with dashes that read as zeros.
 */
export interface ConsoleVenue {
  readonly id: string;
  readonly name: string;
  /** URL-safe identifier, used for the public branch page later. */
  readonly slug: string;
  readonly type: VenueType;
  readonly status: VenueStatus;
  readonly branchCount: number;
  readonly tableCount: number;
  /** `null` when the source does not report it: the screen omits the line rather than invent a date. */
  readonly createdAtUtc: string | null;
  readonly suspendedAtUtc: string | null;

  /** The average of the published reviews, 1–5; `null` with none yet. */
  readonly rating?: number | null | undefined;
  readonly reviewCount?: number | undefined;
  /** Tabs open right now across every branch. */
  readonly openTabCount?: number | undefined;
  /** `null` when every branch is ready for diners. */
  readonly readinessIssue?: VenueReadinessIssue | null | undefined;
  /** Absolute URL of the first branch's cover thumbnail; `null` with no cover yet. */
  readonly coverThumbnailUrl?: string | null | undefined;
  /**
   * Every branch with the features the platform allows there, in the server's
   * order: the list's feature summary (`venueFeatureSummary`).
   */
  readonly branchFeatures?: readonly VenueBranchFeatures[] | undefined;
  /** The first branch's cuisine line from its app listing. */
  readonly cuisine?: string | null | undefined;
  /** The first branch's district, for the line under the name. */
  readonly district?: string | null | undefined;
}

export interface ConsoleBranch {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  /**
   * The branch half of `yalla.am/{venue}/{branch}`, and its street address.
   * Optional because older shapes of this row did not carry them; the
   * platform venue read does.
   */
  readonly slug?: string | undefined;
  readonly address?: string | null | undefined;
  readonly timeZoneId: string;
  readonly tableCount: number;
  /**
   * The features the platform allows at the branch, in the server's order
   * (`PUT /api/platform/branches/{id}/features`). The venue console shows the
   * others locked; the venue's own switches work only inside this set.
   */
  readonly features: readonly BranchFeature[];
  /**
   * Tabs open right now. Blocks deleting the venue — see
   * `VenueDeletionBlockedError`. `null` when the source does not report it: "we did
   * not ask" and "none are open" are different answers, and a screen that
   * conflates them tells a manager the floor is clear when nobody looked.
   */
  readonly openTabCount: number | null;
  /** The listing's district, when the source reports it. */
  readonly district?: string | null | undefined;
}

export type StaffRole = Extract<
  UserRole,
  'owner' | 'generalManager' | 'manager' | 'waiter' | 'kitchen'
>;

export interface ConsoleStaffMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: StaffRole;
  /** `null` for a venue-wide role such as an owner. */
  readonly branchId: string | null;
}

/**
 * A branch as `GET /api/venues/{venueId}/manage` lists it.
 *
 * `isActive` is on the wire because the server does not hide inactive
 * branches from an owner: `BranchBelongsToVenueAsync` never checks the flag,
 * so an owner can still work on one. It is listed, flagged, and sorted last.
 */
export interface ManagedBranch extends ConsoleBranch {
  readonly slug: string;
  readonly isActive: boolean;
}

/**
 * A venue as the person managing it sees it, with the branches **their staff
 * row covers**: every branch for an owner, for a manager with no branch and
 * for the platform admin; the home branch alone for a manager who has one.
 *
 * Separate from {@link ConsoleVenueDetail}, which is the platform's view
 * and carries billing rollups a manager has no business seeing. The branches
 * arrive sorted active first, then by name, so the first one is the right
 * default.
 */
export interface ManagedVenue {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: VenueType;
  readonly status: VenueStatus;
  readonly branches: readonly ManagedBranch[];
}

export interface ConsoleVenueDetail extends ConsoleVenue {
  readonly branches: readonly ConsoleBranch[];
  /**
   * `null` when the staff list was not loaded. The backend serves staff from a
   * separate venue-scoped endpoint, so the platform venue view does not carry
   * them — and "not loaded" must not render as "nobody has been added".
   */
  readonly staff: readonly ConsoleStaffMember[] | null;
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

export interface Page<T> {
  readonly items: readonly T[];
  /** Total matching rows, not the page length. Drives "3 of 41". */
  readonly total: number;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

export interface ListVenuesQuery {
  readonly search?: string | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
  /** Suspended venues are listed by default; the team needs to see them. */
  readonly includeDeleted?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Create a venue and its first branch in one command.
 *
 * One flow, not two: a venue with no branch has no floor, no menu and no
 * tables, so it cannot be onboarded, demoed or even opened. Making the branch
 * optional would just produce rows nobody can use.
 */
export interface CreateVenueCommand {
  readonly commandId: string;
  readonly name: string;
  readonly slug: string;
  readonly type: VenueType;
  readonly firstBranch: {
    readonly name: string;
    readonly timeZoneId: string;
    /**
     * Street address, latitude and longitude are all required by the backend
     * and cannot be derived from anything the form already has. They were
     * missing from this command, which is why every create returned 400: the
     * comment on the old gateway assumed the server filled them in.
     */
    /**
     * The branch half of `/{venueSlug}/{branchSlug}`. Supplied rather than
     * derived from the name: `slugify` strips everything outside a-z0-9, so an
     * Armenian or Russian branch name derives to an empty string and the server
     * refuses it — which is the common case in this market, not an edge one.
     */
    readonly slug: string;
    readonly address: string;
    readonly latitude: number;
    readonly longitude: number;
  };
}

/**
 * Rename a venue, move its web address, or change its type:
 * `PATCH /api/platform/venues/{venueId}`, platform admin only.
 *
 * All three are sent every time; the server applies each one it is given, and
 * the form always shows all three.
 */
export interface UpdateVenueCommand {
  readonly venueId: string;
  readonly commandId: string;
  readonly name: string;
  readonly slug: string;
  readonly type: VenueType;
}

/**
 * A second (or fifth) branch for a venue that already exists:
 * `POST /api/platform/venues/{venueId}/branches`, platform admin only.
 *
 * The same fields as {@link CreateVenueCommand}'s `firstBranch`, for the same
 * reasons: the slug cannot be derived from an Armenian name, and a blank map
 * pin would arrive as 0,0.
 */
export interface AddBranchCommand {
  readonly venueId: string;
  readonly commandId: string;
  readonly name: string;
  readonly slug: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZoneId: string;
}

// ---------------------------------------------------------------------------
// A venue's bookings, as the platform admin may see them
// ---------------------------------------------------------------------------

/** The two windows the venue page offers: the last week and the last month. */
export type BookingSummaryDays = 7 | 30;
export const BOOKING_SUMMARY_DAYS: readonly BookingSummaryDays[] = [7, 30];

/**
 * Bookings counted by what became of them.
 *
 * - `completed`: the party came (seated, then completed).
 * - `upcoming`: confirmed and still ahead.
 * - `pending`: waiting for the venue to approve.
 * - `cancelled`: by the guest or by the venue.
 * - `noShow`: confirmed, and nobody came.
 */
export interface BookingStatusCounts {
  readonly completed: number;
  readonly upcoming: number;
  readonly pending: number;
  readonly cancelled: number;
  readonly noShow: number;
}

export interface BranchBookingsSummary extends BookingStatusCounts {
  readonly branchId: string;
  readonly name: string;
  readonly total: number;
  /** Its bookings for its own today, cancelled ones left out: the venue page's "Bookings today". */
  readonly todayCount: number;
}

/**
 * A venue's bookings over the last 7 or 30 days, **aggregates only**
 * (HANDOFF section 3): the platform admin never sees a guest's name or phone,
 * so nothing here can carry one. Counted in the branches' own time zone.
 */
export interface VenueBookingsSummary {
  readonly venueId: string;
  readonly days: BookingSummaryDays;
  readonly total: number;
  readonly byStatus: BookingStatusCounts;
  /** Seven counts, **Monday first**, by the day the booking is for. */
  readonly byWeekday: readonly number[];
  /** Guests per booking; `null` with no bookings in the window. */
  readonly averagePartySize: number | null;
  readonly byBranch: readonly BranchBookingsSummary[];
}
