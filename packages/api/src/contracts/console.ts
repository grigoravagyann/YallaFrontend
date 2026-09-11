/**
 * Domain contracts for the web console — the screens the Yalla team, venue
 * owners and branch managers use.
 *
 * Deliberately a separate set from the diner contracts. A venue's subscription
 * tier and its suspension state are not things a diner's app should be able to
 * name, and `YallaGateway` describes what the diner app needs. Two interfaces
 * over one backend is cheaper than one interface nobody can read.
 */

export type VenueType = 'cafe' | 'restaurant';

/**
 * What a branch is paying for. Set per *branch*, not per venue: a chain
 * commonly pilots Yalla in one location before rolling it out.
 *
 * Two values, because that is what the backend has
 * (`Yalla.Domain.Enums.SubscriptionTier`: 1 Free, 2 Paid). The console
 * originally invented `trial | basic | pro` before the backend existed; the
 * server is the authority on what a venue is billed, so the vocabulary
 * follows it rather than the other way round.
 */
export type SubscriptionTier = 'free' | 'paid';

export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = ['free', 'paid'];

/**
 * `suspended` is reversible and mostly about billing; `deleted` is a soft
 * delete the platform team can still see. Neither ever removes a row, because
 * a venue's history is what its reports are made of.
 */
export type VenueStatus = 'active' | 'suspended' | 'deleted';

// ---------------------------------------------------------------------------
// Roles and scope
// ---------------------------------------------------------------------------

/**
 * The four tiers, in one place.
 *
 * Waiter and kitchen are distinct roles with, for now, the same reach: the
 * floor screen for their branch. They are not collapsed into one because the
 * kitchen queue and the floor diverge in the next tasks, and widening a role
 * later is far easier than splitting one that people already hold.
 */
export type UserRole = 'platformAdmin' | 'owner' | 'manager' | 'waiter' | 'kitchen';

export const USER_ROLES: readonly UserRole[] = [
  'platformAdmin',
  'owner',
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
   * The token's **home-branch claim**, and nothing more: one id for a manager,
   * waiter or kitchen account created at a branch, none for an owner or for a
   * manager created with no branch.
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

/** A row in the platform venues list. */
export interface ConsoleVenue {
  readonly id: string;
  readonly name: string;
  /** URL-safe identifier, used for the public branch page later. */
  readonly slug: string;
  readonly type: VenueType;
  readonly status: VenueStatus;
  readonly branchCount: number;
  readonly tableCount: number;
  /** The highest tier across the venue's branches, for the list column. */
  readonly subscriptionTier: SubscriptionTier;
  /**
   * `null` when the source does not report it. The platform list endpoint does
   * not, so the screen omits the line rather than inventing a date.
   */
  readonly createdAtUtc: string | null;
  readonly suspendedAtUtc: string | null;
}

export interface ConsoleBranch {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  readonly timeZoneId: string;
  readonly tableCount: number;
  readonly subscriptionTier: SubscriptionTier;
  /**
   * Tabs open right now. Blocks deleting the venue — see
   * `VenueHasOpenTabsError`. `null` when the source does not report it: "we did
   * not ask" and "none are open" are different answers, and a screen that
   * conflates them tells a manager the floor is clear when nobody looked.
   */
  readonly openTabCount: number | null;
}

export type StaffRole = Extract<UserRole, 'owner' | 'manager' | 'waiter' | 'kitchen'>;

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
 * Separate from {@link ConsoleVenueDetail}, which is the platform tier's view
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
