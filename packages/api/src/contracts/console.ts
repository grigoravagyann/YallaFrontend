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
 */
export type SubscriptionTier = 'trial' | 'basic' | 'pro';

export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = ['trial', 'basic', 'pro'];

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
   * Branches this person may act on. Empty *and* `venueId === null` means the
   * whole platform; empty with a venue id means a venue-wide role with no
   * branches yet, which is a real state during onboarding.
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
  readonly createdAtUtc: string;
  readonly suspendedAtUtc: string | null;
}

export interface ConsoleBranch {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  readonly timeZoneId: string;
  readonly tableCount: number;
  readonly subscriptionTier: SubscriptionTier;
  /** Tabs open right now. Blocks deleting the venue — see `VenueHasOpenTabsError`. */
  readonly openTabCount: number;
}

export type StaffRole = Extract<UserRole, 'owner' | 'manager' | 'waiter' | 'kitchen'>;

export interface ConsoleStaffMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: StaffRole;
  /** `null` for a venue-wide role such as an owner. */
  readonly branchId: string | null;
}

export interface ConsoleVenueDetail extends ConsoleVenue {
  readonly branches: readonly ConsoleBranch[];
  readonly staff: readonly ConsoleStaffMember[];
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
  };
}
