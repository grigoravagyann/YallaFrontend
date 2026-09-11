import type { ConsoleGateway } from '../consoleGateway';
import { slugify } from '../slug';
import type {
  ConsoleBranch,
  ConsoleStaffMember,
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  ManagedBranch,
  ManagedVenue,
  Page,
  SubscriptionTier,
  UserRole,
  VenueStatus,
} from '../contracts/console';
import {
  CategoryInUseError,
  FloorPlanInvalidError,
  OutOfScopeError,
  OverlappingHoursError,
  PolicyBoundsError,
  SlugTakenError,
  UnsupportedImageError,
  VenueHasOpenTabsError,
} from '../contracts/errors';
import {
  ConcurrencyConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors';
import { StaffPermissionError } from '../contracts/errors';
import { assignableRoles, canEditStaff, isAdminRole, outranks } from '../contracts/staff';
import type { StaffDevice, StaffMember, StaffSignInLink } from '../contracts/staff';
import type { StaffRole } from '../contracts/console';
import type { PhotoUpload } from '../consoleGateway';
import type {
  AdminMenuCategory,
  AdminMenuItem,
  MenuItemDeletion,
  Photo,
} from '../contracts/menuAdmin';
import type { SpiceLevel } from '../contracts/ordering';
import type {
  HoursBlock,
  PolicyChangeResult,
  ReservationPolicy,
  WeeklyHours,
} from '../contracts/branchSettings';
import {
  POLICY_BOUNDS,
  WEEK_ORDER,
  defaultPolicyFor,
  toMinutes,
} from '../contracts/branchSettings';
import { mockBranchMenu, mockPhoto } from './menuDetail';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  EditorFloorTable,
  FloorPlanSaveResult,
  TableDeletionResult,
} from '../contracts/floorPlan';
import { createMockReports } from './reports';
import { mockVenues } from './venues';

const URL_TAG = 'mock://yalla/console';
// ---------------------------------------------------------------------------
// The menu editor, opening hours and the reservation policy
// ---------------------------------------------------------------------------

/**
 * The stand-in for an item that has no photo yet.
 *
 * The server requires one, so this shape cannot come off the wire — but a mock
 * that refused to represent an unfinished item would make the completeness
 * filter, which is the whole point of the onboarding screen, unreachable. The
 * empty id is what {@link storedItemGaps} keys on.
 */
const NO_PHOTO: Photo = {
  photoId: '',
  thumbnailUrl: '',
  cardUrl: '',
  fullUrl: '',
  width: null,
  height: null,
};

/** Eight megabytes, matching `PhotoRules.MaxUploadBytes`. */
const MOCK_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Bookings the policy screen reports as falling outside a tightened rule.
 *
 * Fixed ids rather than a simulation of the booking table: the point of the
 * report is that a number appears and does not go away, and that branch of the
 * screen is unreachable without one.
 */
const MOCK_AFFECTED_RESERVATIONS: readonly string[] = ['res-mock-1', 'res-mock-2', 'res-mock-3'];

/** The labels the server's bounds messages open with. */
const POLICY_LABELS: Readonly<Record<string, string>> = {
  turnTimeMinutes: 'Turn time',
  bufferMinutes: 'Buffer',
  graceMinutes: 'Grace period',
  lateNudgeAfterMinutes: 'Late nudge delay',
  graceExtensionMinutes: 'Grace extension',
  minLeadMinutes: 'Minimum lead time',
  bookingWindowDays: 'Booking window',
  cancellationDeadlineMinutes: 'Cancellation deadline',
  walkInHoldbackMinutes: 'Walk-in holdback',
  serviceChargePercent: 'Service charge',
};

interface MockItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceDram: number;
  ingredients: string;
  allergens: string;
  portionSize: string;
  spiceLevel: SpiceLevel;
  prepMinutes: number;
  /** Null for an item seeded incomplete, which is what the to-do list is for. */
  photoId: string | null;
  isAvailable: boolean;
  displayOrder: number;
}

interface MockCategory {
  id: string;
  name: string;
  displayOrder: number;
  items: MockItem[];
}

/** Two blocks on one day that overlap. Touching is allowed; overlapping is not. */
function overlapsWithin(blocks: readonly HoursBlock[]): boolean {
  const spans = blocks
    .map((block) => {
      const opens = toMinutes(block.opensAt);
      const closes = toMinutes(block.closesAt);
      if (opens < 0 || closes < 0) return null;
      // A block that crosses midnight is measured forward from its opening, so
      // 22:00–01:00 is 22:00–25:00 and can be compared with an ordinary span.
      return { start: opens, end: closes <= opens ? closes + 1440 : closes };
    })
    .filter((span): span is { start: number; end: number } => span !== null)
    .sort((a, b) => a.start - b.start);

  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1]!;
    const current = spans[index]!;
    if (current.start < previous.end) return true;
  }
  return false;
}

const DEFAULT_PAGE_SIZE = 10;

interface VenueRecord {
  id: string;
  name: string;
  slug: string;
  type: 'cafe' | 'restaurant';
  status: VenueStatus;
  createdAtUtc: string;
  suspendedAtUtc: string | null;
  branches: ConsoleBranch[];
  staff: ConsoleStaffMember[];
}

export interface ConsoleMockOptions {
  readonly now?: () => Date;
  readonly latencyMs?: number;
  /**
   * Who the mock says is signed in. Real deployments read this from the token;
   * the console's dev role switcher passes it here so all four tiers can be
   * walked without four accounts.
   */
  readonly role?: UserRole;
  /**
   * For `role: 'manager'`: whether the signed-in manager was created at a
   * branch (`home`, the default — the first branch of the first venue) or
   * with none (`none`, a venue-wide manager who runs every branch). The two
   * are different people on the server and see different consoles, and the
   * second could not be represented at all before this option.
   */
  readonly managerBranch?: 'home' | 'none';
}

/** Both tiers across the fixture so the list column is not one repeated value. */
function tierFor(index: number): SubscriptionTier {
  return index % 2 === 0 ? 'paid' : 'free';
}

/**
 * The console's mock backend.
 *
 * Built from the same `mockVenues` fixture the diner side uses, so a venue the
 * team suspends here is recognisably the venue a diner browses — one world, two
 * audiences, which is the point of putting both in one app.
 */
export function createConsoleMockGateway(options: ConsoleMockOptions = {}): ConsoleGateway {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 0;
  const role: UserRole = options.role ?? 'platformAdmin';
  const managerBranch = options.managerBranch ?? 'home';

  /**
   * `multiplier` exists for the reports.
   *
   * The menu report anti-joins a branch's whole menu against the period's order
   * lines and is comfortably the slowest of the five against a real database.
   * Letting the mock answer it as fast as everything else would mean its
   * loading state — the one that will actually be seen in production — is the
   * one nobody ever looks at while building the screen.
   */
  const wait = (multiplier = 1) =>
    latency > 0
      ? new Promise((resolve) => setTimeout(resolve, latency * multiplier))
      : Promise.resolve();

  const venues = new Map<string, VenueRecord>();
  let sequence = 0;

  // --- The menu, the week and the policy, per branch ---------------------------

  const menus = new Map<string, MockCategory[]>();
  const hours = new Map<string, WeeklyHours>();
  const policies = new Map<string, ReservationPolicy>();
  const photosById = new Map<string, Photo>();
  const uploadedPhotos = new Map<string, Photo>();
  /** Items the fixture pretends have been ordered, so deletion is refused. */
  const orderedItemIds = new Set<string>();

  let mockSequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(mockSequence += 1)}`;

  /** A branch's menu, seeded from the shared fixture on first read. */
  function menuFor(branchId: string): MockCategory[] {
    const existing = menus.get(branchId);
    if (existing) return existing;

    const seeded: MockCategory[] = mockBranchMenu(branchId, 'cafe').categories.map(
      (category, categoryIndex) => ({
        id: category.id,
        name: category.name,
        displayOrder: categoryIndex,
        items: category.items.map((item, itemIndex) => ({
          id: item.id,
          categoryId: category.id,
          name: item.name,
          description: item.description,
          priceDram: item.priceDram,
          ingredients: item.ingredients,
          allergens: item.allergens,
          portionSize: item.portionSize,
          spiceLevel: item.spiceLevel,
          prepMinutes: item.prepMinutes,
          // Two seeded items have no photo and one has no allergens, so the
          // completeness filter and its count are reachable on first load —
          // which is the state every real venue is in on day one.
          photoId: itemIndex === 0 && categoryIndex === 0 ? null : item.photo.photoId,
          isAvailable: item.isAvailable,
          displayOrder: itemIndex,
        })),
      }),
    );

    for (const category of seeded) {
      for (const item of category.items) {
        if (item.photoId) photosById.set(item.photoId, mockPhoto(item.id));
      }
    }
    // The first item of the second category is "on an order": deleting it
    // deactivates rather than removes, and its category cannot be deleted.
    const ordered = seeded[1]?.items[0];
    if (ordered) orderedItemIds.add(ordered.id);

    menus.set(branchId, seeded);
    return seeded;
  }

  function sortedMenu(categories: readonly MockCategory[]): readonly AdminMenuCategory[] {
    return [...categories].sort((a, b) => a.displayOrder - b.displayOrder).map(toCategory);
  }

  function toCategory(category: MockCategory): AdminMenuCategory {
    return {
      id: category.id,
      name: category.name,
      displayOrder: category.displayOrder,
      items: [...category.items].sort((a, b) => a.displayOrder - b.displayOrder).map(toItem),
    };
  }

  /**
   * An item with no photo cannot exist on the wire — the server requires one —
   * so the mock's incomplete rows carry a placeholder whose id is empty. The
   * completeness check keys on that, exactly as it does against a real API when
   * a draft has not uploaded one yet.
   */
  function toItem(item: MockItem): AdminMenuItem {
    return {
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      priceDram: item.priceDram,
      ingredients: item.ingredients,
      allergens: item.allergens,
      portionSize: item.portionSize,
      spiceLevel: item.spiceLevel,
      prepMinutes: item.prepMinutes,
      photo: item.photoId ? (photosById.get(item.photoId) ?? mockPhoto(item.photoId)) : NO_PHOTO,
      isAvailable: item.isAvailable,
      displayOrder: item.displayOrder,
    };
  }

  function requireCategory(branchId: string, categoryId: string): MockCategory {
    const category = menuFor(branchId).find((candidate) => candidate.id === categoryId);
    if (!category) throw new NotFoundError({ url: `${URL_TAG}/menu/${categoryId}` });
    return category;
  }

  function requireItem(branchId: string, itemId: string): MockItem {
    for (const category of menuFor(branchId)) {
      const item = category.items.find((candidate) => candidate.id === itemId);
      if (item) return item;
    }
    throw new NotFoundError({ url: `${URL_TAG}/menu/items/${itemId}` });
  }

  /** A plausible week: open every day, one late night at the weekend. */
  function hoursFor(branchId: string): WeeklyHours {
    const existing = hours.get(branchId);
    if (existing) return existing;

    const seeded: WeeklyHours = WEEK_ORDER.map((day) => ({
      day,
      blocks:
        day === 0
          ? // Sunday shut, so the "closed" row is on screen from the first load
            // rather than being a state somebody has to construct.
            []
          : [{ opensAt: '09:00', closesAt: day === 5 || day === 6 ? '01:00' : '23:00' }],
    }));
    hours.set(branchId, seeded);
    return seeded;
  }

  /*
   * Staff and devices, per venue and per branch respectively.
   *
   * Two scopes, because that is what the API has: staff belong to a venue (an
   * owner works everywhere) and a tablet is bolted to one counter.
   */
  const staffByVenue = new Map<string, StaffMember[]>();
  const devicesByBranch = new Map<string, StaffDevice[]>();

  /**
   * A 409 whose `message` is the server's sentence.
   *
   * The staff routes answer a fact about the target — signs in with a PIN,
   * deactivated, address taken — as `conflicting-state`, which the client
   * already maps to {@link ConcurrencyConflictError}. The detail is the thing a
   * screen shows, so the mock has to carry one the way the wire does.
   */
  function conflict(detail: string): ConcurrencyConflictError {
    return new ConcurrencyConflictError({
      url: URL_TAG,
      problem: {
        type: 'about:blank',
        title: 'Conflicting state',
        status: 409,
        detail,
        code: 'conflicting-state',
        traceId: 'mock',
      },
    });
  }

  /**
   * The 422 the endpoint filter answers before the handler runs.
   *
   * `IssueSignInRequest` carries `[Required][EmailAddress][StringLength(320)]`
   * on its one field, and DataAnnotations run ahead of the service — so this
   * is the first refusal on the route whatever the target is, and it names
   * `email` in `context.field` the way the real 422 does.
   */
  function badAddress(detail: string): ValidationError {
    return new ValidationError({
      url: URL_TAG,
      status: 422,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail,
        code: 'validation-failed',
        traceId: 'mock',
        context: { field: 'email', fields: [{ field: 'email', message: detail }] },
      },
    });
  }

  /** `FieldLengths.Email` on the server: the most an address may be. */
  const EMAIL_MAX_LENGTH = 320;

  /**
   * `StaffRole` as the server's `StaffPermissionException` spells it. The
   * console's vocabulary is camelCase; the sentence a screen shows is not.
   */
  const SERVER_ROLE: Readonly<Record<StaffRole | 'platformAdmin', string>> = {
    platformAdmin: 'PlatformAdmin',
    owner: 'Owner',
    manager: 'Manager',
    waiter: 'Waiter',
    kitchen: 'Kitchen',
  };

  /** The server's `RequireCanHoldPassword` refusal: about the person, not the caller. */
  const pinOnly = (role: StaffRole) =>
    `A ${SERVER_ROLE[role]} signs in by tapping a PIN on a tablet a manager enrolled, so they cannot ` +
    'have an email and password. Only an owner or a manager uses the admin panel. ' +
    'Create them without credentials, or give them the Manager role.';

  const ADDRESS_TAKEN =
    'That email address already has an account. Every address signs in to one account, ' +
    'so use a different one - or edit the existing account instead.';

  /**
   * Whether an address already signs in to some account, anywhere.
   *
   * The server's rule is the filtered unique index `UX_StaffMembers_Email`
   * over the whole StaffMembers table, so this looks across every venue —
   * seeding each one first, since a venue's people exist only once asked
   * for. A mock that searched the target's own venue alone accepted the very
   * address the server answers 409 to, and every screen test with a
   * cross-venue duplicate passed against it. The person's own address is
   * fine: re-issuing is the normal way to replace a lost link.
   */
  function addressTaken(address: string, exceptId: string | null): boolean {
    for (const id of venues.keys()) staffFor(id);
    return [...staffByVenue.values()].some((people) =>
      people.some((member) => member.id !== exceptId && member.email === address),
    );
  }

  function venueOfBranch(branchId: string): string | null {
    for (const record of venues.values()) {
      if (record.branches.some((branch) => branch.id === branchId)) return record.id;
    }
    return null;
  }

  /**
   * Who the mock is acting as.
   *
   * Derived from the signed-in console user rather than assumed, because every
   * role guard below is about the *actor* — a manager sees a different screen
   * from an owner, and a mock that always acted as an owner would let a
   * manager's picker be wrong with every test still passing.
   */
  function actingStaff(venueId: string): { id: string; role: StaffRole | 'platformAdmin' } {
    if (role === 'platformAdmin') return { id: 'u-platform', role: 'platformAdmin' };

    const list = staffFor(venueId);
    // The seeded person this console role corresponds to, so "you cannot edit
    // yourself" has a real row to point at rather than an id nothing matches.
    // A manager is the branch one or the venue-wide one, by the option.
    const self =
      role === 'owner'
        ? list.find((member) => member.role === 'owner')
        : role === 'manager' && managerBranch === 'none'
          ? list.find((member) => member.role === 'manager' && member.branchId === null)
          : list.find((member) => member.role === 'manager' && member.branchId !== null);

    return self ? { id: self.id, role: self.role } : { id: `u-${role}`, role: 'owner' };
  }

  /** A venue's people, seeded from the same names the venue fixture uses. */
  function staffFor(venueId: string): StaffMember[] {
    const existing = staffByVenue.get(venueId);
    if (existing) return existing;

    const record = venues.get(venueId);
    const branches = record?.branches ?? [];

    const seeded: StaffMember[] = [
      {
        id: `${venueId}-owner`,
        venueId,
        // Venue-wide: the owner works everywhere, which is what a null branch
        // means and what this screen finally makes reachable.
        branchId: null,
        fullName: 'Aram Sargsyan',
        phone: '+37477101010',
        role: 'owner',
        isActive: true,
        email: `owner@${slugify(record?.name ?? 'venue')}.am`,
        hasPasswordSignIn: true,
        isPinLocked: false,
      },
      ...branches.flatMap((branch, index): StaffMember[] => [
        {
          id: `${branch.id}-manager`,
          venueId,
          branchId: branch.id,
          fullName:
            ['Nare Petrosyan', 'Tigran Avetisyan', 'Lilit Grigoryan'][index % 3] ?? 'Manager',
          phone: `+3747720${index}0${index}0`,
          role: 'manager',
          isActive: true,
          email: null,
          hasPasswordSignIn: false,
          isPinLocked: false,
        },
        {
          id: `${branch.id}-waiter-1`,
          venueId,
          branchId: branch.id,
          // Unique per branch: an owner sees every branch's people in one
          // list, and two rows with the same name are two rows nobody can
          // tell apart.
          fullName: `Ani Hakobyan (${branch.name})`,
          phone: `+3747730${index}111`,
          role: 'waiter',
          isActive: true,
          email: null,
          hasPasswordSignIn: false,
          // Somebody is always locked out mid-service. It is the most
          // time-critical row on the screen, so the fixture has one.
          isPinLocked: index === 0,
        },
        {
          id: `${branch.id}-waiter-2`,
          venueId,
          branchId: branch.id,
          fullName: `Davit Manukyan (${branch.name})`,
          phone: `+3747730${index}222`,
          role: 'waiter',
          // Left in March, and the record stays so a return in June is a
          // reactivation rather than a second person with the same history.
          isActive: false,
          email: null,
          hasPasswordSignIn: false,
          isPinLocked: false,
        },
        {
          id: `${branch.id}-kitchen`,
          venueId,
          branchId: branch.id,
          fullName: `Sona Vardanyan (${branch.name})`,
          phone: `+3747740${index}333`,
          role: 'kitchen',
          isActive: true,
          email: null,
          hasPasswordSignIn: false,
          isPinLocked: false,
        },
      ]),
      {
        id: `${venueId}-manager`,
        venueId,
        // A manager created with no branch: they run every branch, the way an
        // owner does, and the console must show them every branch.
        branchId: null,
        fullName: 'Hasmik Karapetyan',
        phone: '+37477209090',
        role: 'manager',
        isActive: true,
        email: null,
        hasPasswordSignIn: false,
        isPinLocked: false,
      },
    ];

    staffByVenue.set(venueId, seeded);
    return seeded;
  }

  /** A branch's tablets, including one already killed. */
  function devicesFor(branchId: string): StaffDevice[] {
    const existing = devicesByBranch.get(branchId);
    if (existing) return existing;

    const seeded: StaffDevice[] = [
      {
        id: `${branchId}-device-counter`,
        name: 'Counter tablet',
        branchId,
        enrolledAtUtc: '2026-08-21T08:00:00Z',
        lastSeenAtUtc: new Date(Date.now() - 4 * 60_000).toISOString(),
        isRevoked: false,
      },
      {
        id: `${branchId}-device-old`,
        name: 'Old iPad (left in a taxi)',
        branchId,
        enrolledAtUtc: '2026-07-02T09:30:00Z',
        lastSeenAtUtc: '2026-08-14T22:10:00Z',
        // Revoked and still listed: the list is an audit trail, not a roster.
        isRevoked: true,
      },
    ];

    devicesByBranch.set(branchId, seeded);
    return seeded;
  }

  /** Every branch in the fixture, flattened once for the report scope lookups. */
  function allBranches(): readonly ConsoleBranch[] {
    return [...venues.values()].flatMap((venue) => venue.branches);
  }

  /*
   * The report generator reads the world rather than inventing one.
   *
   * `menuOf` matters most: the never-ordered list has to name items the menu
   * editor actually has, or the "one tap to act on it" link goes nowhere — and
   * that link is the entire reason the block earns its prominence.
   */
  const reports = createMockReports({
    menuOf: (branchId) =>
      menuFor(branchId).flatMap((category) =>
        category.items.map((item) => ({
          id: item.id,
          name: item.name,
          categoryName: category.name,
          priceDram: item.priceDram,
        })),
      ),
    branchIdsFor: (branchId, rollUpVenue) => {
      if (!rollUpVenue) return [branchId];
      const venue = [...venues.values()].find((record) =>
        record.branches.some((branch) => branch.id === branchId),
      );
      return venue?.branches.map((branch) => branch.id) ?? [branchId];
    },
    timeZoneOf: (branchId) =>
      allBranches().find((branch) => branch.id === branchId)?.timeZoneId ?? 'Asia/Yerevan',
  });

  function policyFor(branchId: string): ReservationPolicy {
    const existing = policies.get(branchId);
    if (existing) return existing;
    const seeded = defaultPolicyFor('cafe');
    policies.set(branchId, seeded);
    return seeded;
  }

  mockVenues.forEach((venue, venueIndex) => {
    const branches: ConsoleBranch[] = venue.branches.map((branch, branchIndex) => ({
      id: branch.id,
      venueId: venue.id,
      name: branch.name,
      timeZoneId: branch.timeZoneId,
      tableCount: branch.totalTables,
      subscriptionTier: tierFor(venueIndex + branchIndex),
      // One branch in the fixture is mid-service, so "cannot delete, table 7 has
      // an open tab" is a state the screen can actually be driven into.
      openTabCount: venue.id === 'v-lumen' && branchIndex === 0 ? 2 : 0,
    }));

    const staff: ConsoleStaffMember[] = [
      { id: `${venue.id}-owner`, displayName: 'Aram Sargsyan', role: 'owner', branchId: null },
      ...branches.map((branch, i) => ({
        id: `${branch.id}-manager`,
        displayName: ['Nare Petrosyan', 'Tigran Avetisyan', 'Lilit Grigoryan'][i % 3] ?? 'Manager',
        role: 'manager' as const,
        branchId: branch.id,
      })),
    ];

    venues.set(venue.id, {
      id: venue.id,
      name: venue.name,
      slug: slugify(venue.name),
      type: venue.type,
      status: venue.id === 'v-tumanyan' ? 'suspended' : 'active',
      createdAtUtc: '2026-06-01T09:00:00Z',
      suspendedAtUtc: venue.id === 'v-tumanyan' ? '2026-08-14T09:00:00Z' : null,
      branches,
      staff,
    });
  });

  /** The tier the list column shows: the best one any branch is on. */
  function headlineTier(record: VenueRecord): SubscriptionTier {
    const order: readonly SubscriptionTier[] = ['free', 'paid'];
    return record.branches.reduce<SubscriptionTier>(
      (best, branch) =>
        order.indexOf(branch.subscriptionTier) > order.indexOf(best)
          ? branch.subscriptionTier
          : best,
      'free',
    );
  }

  function toRow(record: VenueRecord): ConsoleVenue {
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      type: record.type,
      status: record.status,
      branchCount: record.branches.length,
      tableCount: record.branches.reduce((sum, branch) => sum + branch.tableCount, 0),
      subscriptionTier: headlineTier(record),
      createdAtUtc: record.createdAtUtc,
      suspendedAtUtc: record.suspendedAtUtc,
    };
  }

  function toDetail(record: VenueRecord): ConsoleVenueDetail {
    return { ...toRow(record), branches: record.branches, staff: record.staff };
  }

  function requireVenue(venueId: string): VenueRecord {
    const record = venues.get(venueId);
    if (!record) throw new OutOfScopeError({ url: URL_TAG });
    return record;
  }

  /**
   * The scope a token of this role would carry — the **claims**, not the
   * coverage. An owner's token names the venue and no branch (live probe,
   * 2026-09-10), and so does a manager created with no branch; the branches
   * they may work on are `getManagedVenue`'s answer, as on the server.
   */
  function currentUser(): ConsoleUser {
    const firstVenue = [...venues.values()][0];
    const homeBranch = firstVenue?.branches[0]?.id;

    switch (role) {
      case 'platformAdmin':
        return {
          id: 'u-platform',
          displayName: 'Yalla team',
          role,
          scope: { venueId: null, branchIds: [] },
        };
      case 'owner':
        return {
          id: 'u-owner',
          displayName: 'Aram Sargsyan',
          role,
          scope: { venueId: firstVenue?.id ?? null, branchIds: [] },
        };
      case 'manager':
        return {
          id: 'u-manager',
          displayName: managerBranch === 'none' ? 'Hasmik Karapetyan' : 'Nare Petrosyan',
          role,
          scope: {
            venueId: firstVenue?.id ?? null,
            branchIds: managerBranch === 'none' || !homeBranch ? [] : [homeBranch],
          },
        };
      default:
        // A waiter or a kitchen account is one branch and no more.
        return {
          id: `u-${role}`,
          displayName: role === 'waiter' ? 'Gor Hakobyan' : 'Kitchen',
          role,
          scope: {
            venueId: firstVenue?.id ?? null,
            branchIds: homeBranch ? [homeBranch] : [],
          },
        };
    }
  }

  /**
   * The server's scope rule, as `BranchScoped` and `StaffBranchGuard` apply
   * it: a branch read must name a branch of the token's venue. Not the
   * console's narrower view — a manager with a home branch is *not* confined
   * to it here, because the server does not confine them either.
   */
  function requireBranchInVenue(branchId: string): void {
    if (role === 'platformAdmin') return;
    const venueId = currentUser().scope.venueId;
    if (venueId === null || venueOfBranch(branchId) !== venueId) {
      throw new ForbiddenError({ url: `${URL_TAG}/branches/${branchId}` });
    }
  }

  /** `VenueScoped`: the venue in the route must be the token's. */
  function requireVenueInScope(venueId: string): void {
    if (role === 'platformAdmin') return;
    if (currentUser().scope.venueId !== venueId) {
      throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}` });
    }
  }

  /**
   * `GET /api/venues/{venueId}/manage`: coverage from the caller's own staff
   * row, which must be active, in this venue, and an owner or a manager.
   */
  function managedVenueFor(venueId: string): ManagedVenue {
    const record = venues.get(venueId);

    const toManaged = (branch: ConsoleBranch): ManagedBranch => ({
      ...branch,
      slug: slugify(branch.name),
      // The fixture has no inactive branch; the field is on the wire so the
      // screens are exercised against the real shape.
      isActive: true,
    });
    // The server sorts active first, then by name, then by id. With every
    // fixture branch active the first term would never decide, so it is not
    // written: a comparator no test can turn red is a claim, not a rule.
    const sorted = (branches: readonly ConsoleBranch[]) =>
      branches
        .map(toManaged)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    if (role === 'platformAdmin') {
      if (!record) throw new NotFoundError({ url: `${URL_TAG}/venues/${venueId}/manage` });
      return {
        id: record.id,
        name: record.name,
        slug: record.slug,
        type: record.type,
        status: record.status,
        branches: sorted(record.branches),
      };
    }

    // ManagerOrAbove, then VenueScoped. A venue user never learns whether a
    // venue that is not theirs exists.
    if (role !== 'owner' && role !== 'manager') {
      throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}/manage` });
    }
    requireVenueInScope(venueId);
    if (!record) throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}/manage` });

    const actor = actingStaff(venueId);
    const row = staffFor(venueId).find((member) => member.id === actor.id);
    if (!row || !row.isActive || (row.role !== 'owner' && row.role !== 'manager')) {
      throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}/manage` });
    }

    const covered =
      row.role === 'manager' && row.branchId !== null
        ? record.branches.filter((branch) => branch.id === row.branchId)
        : record.branches;

    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      type: record.type,
      status: record.status,
      branches: sorted(covered),
    };
  }

  // --- The floor plan the editor works on ------------------------------------

  /**
   * Per-branch working state, seeded from the shared fixture the viewer uses.
   *
   * Held here rather than derived on each call so the editor's save is real:
   * you can draw a room, save it, navigate away and come back to it, which is
   * the whole point of having a mock at all.
   */
  const floorPlans = new Map<string, EditorFloorPlan>();

  /**
   * Which tables the mock pretends have been sat at.
   *
   * Two in every branch, so the "deactivated rather than deleted" path is
   * reachable without inventing a booking first. It is the path most likely to
   * be got wrong, and the one a person will hit by accident.
   */
  function hasHistory(tableId: string): boolean {
    return tableId.endsWith('1') || tableId.endsWith('7');
  }

  function seedFloorPlan(branchId: string): EditorFloorPlan {
    const areaNames = ['Windows', 'Bar', 'Terrace'];
    const areas: EditorFloorArea[] = areaNames.map((name, index) => ({
      id: `area-${branchId}-${index}`,
      name,
      displayOrder: index,
    }));

    const tables: EditorFloorTable[] = Array.from({ length: 12 }, (_, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const area = areas[row] ?? areas[0]!;
      return {
        id: `tbl-${branchId}-${i + 1}`,
        label: String(i + 1),
        seats: col === 3 ? 4 : 2,
        x: 120 + col * 200,
        y: 120 + row * 220,
        width: col === 3 ? 140 : 90,
        height: 90,
        rotationDegrees: 0,
        shape: col % 2 === 0 ? 'rectangle' : 'round',
        floorAreaId: area.id,
        isBookable: true,
        isActive: true,
        qrToken: `qr-${branchId}-${i + 1}`,
      };
    });

    return { branchId, floorWidth: 1000, floorHeight: 800, areas, tables };
  }

  function floorPlanFor(branchId: string): EditorFloorPlan {
    let plan = floorPlans.get(branchId);
    if (!plan) {
      plan = seedFloorPlan(branchId);
      floorPlans.set(branchId, plan);
    }
    return plan;
  }

  /** The same advisory the server gives: overlapping tables save anyway. */
  function overlapWarnings(
    tables: readonly { label: string; x: number; y: number; width: number; height: number }[],
  ): string[] {
    const warnings: string[] = [];
    for (let i = 0; i < tables.length; i += 1) {
      for (let j = i + 1; j < tables.length; j += 1) {
        const a = tables[i];
        const b = tables[j];
        if (!a || !b) continue;
        if (
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height
        ) {
          warnings.push(`Tables ${a.label} and ${b.label} overlap.`);
        }
      }
    }
    return warnings;
  }

  return {
    async getCurrentUser() {
      await wait();
      return currentUser();
    },

    async listVenues(query: ListVenuesQuery): Promise<Page<ConsoleVenue>> {
      await wait();
      const needle = query.search?.trim().toLocaleLowerCase() ?? '';
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);

      const matching = [...venues.values()]
        .filter((record) => query.includeDeleted || record.status !== 'deleted')
        .filter(
          (record) =>
            !needle ||
            record.name.toLocaleLowerCase().includes(needle) ||
            record.slug.includes(needle),
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      const start = (page - 1) * pageSize;
      return {
        items: matching.slice(start, start + pageSize).map(toRow),
        total: matching.length,
        page,
        pageSize,
      };
    },

    async getVenue(venueId) {
      await wait();
      // `PlatformAdminOnly`: the real route answers every venue user 403, and
      // a mock that answered them is how the console shipped reading its
      // branches from a route its users cannot call.
      if (role !== 'platformAdmin') {
        throw new ForbiddenError({ url: `${URL_TAG}/platform/venues/${venueId}` });
      }
      const record = venues.get(venueId);
      return record ? toDetail(record) : null;
    },

    async getManagedVenue(venueId) {
      await wait();
      return managedVenueFor(venueId);
    },

    async createVenue(command: CreateVenueCommand) {
      await wait();

      const slug = command.slug.trim().toLocaleLowerCase();
      if ([...venues.values()].some((record) => record.slug === slug)) {
        throw new SlugTakenError({ url: URL_TAG, slug });
      }

      sequence += 1;
      const venueId = `v-new-${sequence}`;
      const branchId = `${venueId}-b1`;

      const record: VenueRecord = {
        id: venueId,
        name: command.name.trim(),
        slug,
        type: command.type,
        status: 'active',
        createdAtUtc: now().toISOString(),
        suspendedAtUtc: null,
        branches: [
          {
            id: branchId,
            venueId,
            name: command.firstBranch.name.trim(),
            timeZoneId: command.firstBranch.timeZoneId,
            // A new venue has no floor plan yet — the team draws it during
            // onboarding, which is exactly the next task.
            tableCount: 0,
            subscriptionTier: 'free',
            openTabCount: 0,
          },
        ],
        staff: [],
      };

      venues.set(venueId, record);
      return toDetail(record);
    },

    async suspendVenue({ venueId }) {
      await wait();
      const record = requireVenue(venueId);
      record.status = 'suspended';
      record.suspendedAtUtc = now().toISOString();
      return toDetail(record);
    },

    async resumeVenue({ venueId }) {
      await wait();
      const record = requireVenue(venueId);
      record.status = 'active';
      record.suspendedAtUtc = null;
      return toDetail(record);
    },

    async deleteVenue({ venueId }) {
      await wait();
      const record = requireVenue(venueId);

      // The whole reason this returns a typed error rather than a boolean: the
      // screen has to be able to say *which* table is still sitting.
      // The mock always knows its own tab counts, so a null here would be a
      // bug in the fixture rather than a source that did not report them.
      const blocking = record.branches.filter((branch) => (branch.openTabCount ?? 0) > 0);
      if (blocking.length > 0) {
        throw new VenueHasOpenTabsError({
          url: URL_TAG,
          venueId,
          openTabs: blocking.flatMap((branch) =>
            Array.from({ length: branch.openTabCount ?? 0 }, (_, i) => ({
              tabId: `${branch.id}-tab-${i + 1}`,
              branchId: branch.id,
              branchName: branch.name,
              tableLabel: String(i + 7),
            })),
          ),
        });
      }

      record.status = 'deleted';
      return toDetail(record);
    },

    // --- The floor plan editor ----------------------------------------------

    async getFloorPlan(branchId) {
      await wait();
      requireBranchInVenue(branchId);
      return floorPlanFor(branchId);
    },

    async replaceFloorPlan({ branchId, command }): Promise<FloorPlanSaveResult> {
      await wait();
      const existing = floorPlanFor(branchId);

      // The same two refusals the server makes, and no more. Overlapping
      // tables are deliberately not one of them: a client stricter than the
      // server teaches people a rule that does not exist.
      const outside = command.tables
        .filter(
          (t) =>
            t.x < 0 ||
            t.y < 0 ||
            t.x + t.width > command.floorWidth ||
            t.y + t.height > command.floorHeight,
        )
        .map((t) => t.label);

      const seen = new Map<string, number>();
      for (const table of command.tables) {
        const key = table.label.trim().toLocaleLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const duplicates = command.tables
        .map((t) => t.label.trim())
        .filter((label, index, all) => {
          const key = label.toLocaleLowerCase();
          return (
            (seen.get(key) ?? 0) > 1 &&
            all.findIndex((l) => l.toLocaleLowerCase() === key) === index
          );
        });

      if (outside.length > 0 || duplicates.length > 0) {
        const errors: string[] = [];
        if (outside.length > 0) {
          errors.push(`These tables sit outside the canvas: ${outside.join(', ')}.`);
        }
        if (duplicates.length > 0) {
          errors.push(
            `Table labels must be unique within a branch. Repeated: ${duplicates.join(', ')}.`,
          );
        }
        throw new FloorPlanInvalidError({
          url: URL_TAG,
          errors,
          tablesOutsideCanvas: outside,
          duplicateLabels: duplicates,
        });
      }

      const areas: EditorFloorArea[] = command.areas.map((area, index) => ({
        id: area.id ?? `area-${branchId}-${index}-${area.name}`,
        name: area.name,
        displayOrder: area.displayOrder,
      }));
      const areaByName = new Map(areas.map((a) => [a.name, a.id]));

      const kept = new Set(command.tables.map((t) => t.id).filter(Boolean));
      // A table dropped from the plan is removed only if it never had a
      // booking; one with history is deactivated and stays on the canvas.
      const dropped = existing.tables.filter((t) => !kept.has(t.id));
      const deactivated = dropped.filter((t) => hasHistory(t.id));
      const removed = dropped.filter((t) => !hasHistory(t.id));

      const tables: EditorFloorTable[] = [
        ...command.tables.map((table, index): EditorFloorTable => {
          const previous = table.id ? existing.tables.find((t) => t.id === table.id) : undefined;
          return {
            id: table.id ?? `tbl-${branchId}-${index}-${table.label}`,
            label: table.label,
            seats: table.seats,
            x: Math.round(table.x),
            y: Math.round(table.y),
            width: Math.round(table.width),
            height: Math.round(table.height),
            rotationDegrees: table.rotationDegrees,
            shape: table.shape,
            floorAreaId: table.floorAreaName ? (areaByName.get(table.floorAreaName) ?? null) : null,
            isBookable: table.isBookable,
            isActive: true,
            // Survives the edit, exactly as on the server.
            qrToken: previous?.qrToken ?? `qr-${branchId}-${table.label}`,
          };
        }),
        ...deactivated.map((table) => ({ ...table, isActive: false })),
      ];

      const saved: EditorFloorPlan = {
        branchId,
        floorWidth: command.floorWidth,
        floorHeight: command.floorHeight,
        areas,
        tables,
      };
      floorPlans.set(branchId, saved);

      return {
        plan: saved,
        warnings: overlapWarnings(command.tables),
        deactivatedTables: deactivated.map((t) => t.label),
        removedTables: removed.map((t) => t.label),
      };
    },

    async createFloorArea({ branchId, name, displayOrder }) {
      await wait();
      const plan = floorPlanFor(branchId);
      const area: EditorFloorArea = { id: `area-${branchId}-${name}`, name, displayOrder };
      floorPlans.set(branchId, { ...plan, areas: [...plan.areas, area] });
      return area;
    },

    async updateFloorArea({ branchId, areaId, name, displayOrder }) {
      await wait();
      const plan = floorPlanFor(branchId);
      const updated: EditorFloorArea = { id: areaId, name, displayOrder };
      floorPlans.set(branchId, {
        ...plan,
        areas: plan.areas.map((area) => (area.id === areaId ? updated : area)),
      });
      return updated;
    },

    async deleteFloorArea({ branchId, areaId }) {
      await wait();
      const plan = floorPlanFor(branchId);
      floorPlans.set(branchId, {
        ...plan,
        areas: plan.areas.filter((area) => area.id !== areaId),
        // The area goes; its tables stay, with no area.
        tables: plan.tables.map((t) =>
          t.floorAreaId === areaId ? { ...t, floorAreaId: null } : t,
        ),
      });
    },

    async deleteTable({ branchId, tableId }): Promise<TableDeletionResult> {
      await wait();
      const plan = floorPlanFor(branchId);
      const table = plan.tables.find((t) => t.id === tableId);
      if (!table) throw new OutOfScopeError({ url: URL_TAG });

      if (hasHistory(tableId)) {
        floorPlans.set(branchId, {
          ...plan,
          tables: plan.tables.map((t) => (t.id === tableId ? { ...t, isActive: false } : t)),
        });
        return {
          tableId,
          label: table.label,
          deleted: false,
          deactivated: true,
          message: `Table ${table.label} has bookings against it, so it was deactivated rather than deleted.`,
        };
      }

      floorPlans.set(branchId, { ...plan, tables: plan.tables.filter((t) => t.id !== tableId) });
      return { tableId, label: table.label, deleted: true, deactivated: false, message: '' };
    },

    async regenerateTableQr({ tableId }) {
      await wait();
      for (const [branchId, plan] of floorPlans) {
        if (!plan.tables.some((t) => t.id === tableId)) continue;
        const qrToken = `qr-${tableId}-${plan.tables.length}-regenerated`;
        floorPlans.set(branchId, {
          ...plan,
          tables: plan.tables.map((t) => (t.id === tableId ? { ...t, qrToken } : t)),
        });
        return { qrToken };
      }
      throw new OutOfScopeError({ url: URL_TAG });
    },

    async setBranchTier({ branchId, tier }) {
      await wait();
      for (const record of venues.values()) {
        const index = record.branches.findIndex((branch) => branch.id === branchId);
        if (index === -1) continue;
        const branch = record.branches[index];
        if (branch) record.branches[index] = { ...branch, subscriptionTier: tier };
        return toDetail(record);
      }
      throw new OutOfScopeError({ url: URL_TAG });
    },

    // --- The menu editor --------------------------------------------------------

    async getAdminMenu(branchId): Promise<readonly AdminMenuCategory[]> {
      await wait();
      requireBranchInVenue(branchId);
      return sortedMenu(menuFor(branchId));
    },

    async createCategory({ branchId, name, displayOrder }): Promise<AdminMenuCategory> {
      await wait();
      const category: MockCategory = { id: nextId('cat'), name, displayOrder, items: [] };
      menuFor(branchId).push(category);
      return toCategory(category);
    },

    async updateCategory({ branchId, categoryId, name, displayOrder }) {
      await wait();
      const category = requireCategory(branchId, categoryId);
      if (name !== undefined) category.name = name;
      if (displayOrder !== undefined) category.displayOrder = displayOrder;
      return toCategory(category);
    },

    async deleteCategory({ branchId, categoryId }): Promise<void> {
      await wait();
      const category = requireCategory(branchId, categoryId);
      // The real refusal, simulated: an item that has been ordered cannot go,
      // and the category cannot go without it. `orderedItemIds` is seeded so
      // the branch is reachable without placing an order first.
      if (category.items.some((item) => orderedItemIds.has(item.id))) {
        throw new CategoryInUseError({ url: `${URL_TAG}/menu/${categoryId}`, categoryId });
      }
      const categories = menuFor(branchId);
      categories.splice(categories.indexOf(category), 1);
    },

    async createMenuItem({ branchId, item }): Promise<AdminMenuItem> {
      await wait();
      const category = requireCategory(branchId, item.categoryId);
      const created: MockItem = {
        id: nextId('item'),
        categoryId: category.id,
        name: item.name,
        description: item.description,
        priceDram: item.priceDram,
        ingredients: item.ingredients,
        allergens: item.allergens,
        portionSize: item.portionSize,
        spiceLevel: item.spiceLevel,
        prepMinutes: item.prepMinutes,
        photoId: item.photoId,
        isAvailable: true,
        displayOrder: item.displayOrder,
      };
      category.items.push(created);
      return toItem(created);
    },

    async updateMenuItem({ branchId, itemId, patch }): Promise<AdminMenuItem> {
      await wait();
      const item = requireItem(branchId, itemId);
      if (patch.name !== undefined) item.name = patch.name;
      if (patch.description !== undefined) item.description = patch.description;
      if (patch.priceDram !== undefined) item.priceDram = patch.priceDram;
      if (patch.ingredients !== undefined) item.ingredients = patch.ingredients;
      if (patch.allergens !== undefined) item.allergens = patch.allergens;
      if (patch.portionSize !== undefined) item.portionSize = patch.portionSize;
      if (patch.spiceLevel !== undefined) item.spiceLevel = patch.spiceLevel;
      if (patch.prepMinutes !== undefined) item.prepMinutes = patch.prepMinutes;
      if (patch.photoId !== undefined) item.photoId = patch.photoId;
      if (patch.displayOrder !== undefined) item.displayOrder = patch.displayOrder;
      return toItem(item);
    },

    async setMenuItemAvailability({ branchId, itemId, isAvailable }): Promise<AdminMenuItem> {
      await wait();
      const item = requireItem(branchId, itemId);
      item.isAvailable = isAvailable;
      return toItem(item);
    },

    async deleteMenuItem({ branchId, itemId }): Promise<MenuItemDeletion> {
      await wait();
      const item = requireItem(branchId, itemId);

      // An item on an order is deactivated rather than deleted: the order line
      // points at it and that reference has to survive. The server says which
      // happened and so does this, because a "deleted" item still on the list
      // is the kind of thing somebody deletes twice.
      if (orderedItemIds.has(item.id)) {
        item.isAvailable = false;
        return {
          itemId,
          deleted: false,
          deactivated: true,
          message: 'This item appears on an order, so it was marked unavailable instead.',
        };
      }

      for (const category of menuFor(branchId)) {
        const index = category.items.indexOf(item);
        if (index >= 0) category.items.splice(index, 1);
      }
      return { itemId, deleted: true, deactivated: false, message: 'Removed.' };
    },

    // --- Photos ------------------------------------------------------------------

    async uploadPhoto({ file, fileName, onProgress }): Promise<PhotoUpload> {
      // Progress in steps, because a bar that jumps from nothing to done is a
      // bar nobody believes, and this is the one screen where the wait is real.
      for (const fraction of [0.25, 0.6, 0.9]) {
        await wait();
        onProgress?.(fraction);
      }

      // The real refusals, on the same signals the server uses. The bytes are
      // not sniffed here — a mock cannot decode an image — so the extension
      // stands in, with the one case that matters called out: a HEIC saved as
      // `.jpg` is refused by the server and would sail through this check.
      if (file.size > MOCK_MAX_UPLOAD_BYTES) {
        throw new UnsupportedImageError({
          url: `${URL_TAG}/photos`,
          reason: 'tooLarge',
          detail: 'That photo is larger than 8 MB. Export it smaller and try again.',
        });
      }
      if (!/\.(jpe?g|png|webp)$/iu.test(fileName)) {
        throw new UnsupportedImageError({
          url: `${URL_TAG}/photos`,
          reason: 'format',
          detectedFormat: fileName.split('.').pop()?.toLowerCase() ?? null,
          detail: 'That file is not a JPEG, PNG or WebP.',
        });
      }

      // Deduplicated by size and name, which is the closest a mock gets to the
      // server's content hash. Reported rather than hidden: an upload that
      // wrote nothing looks like a failure.
      const key = `${fileName}:${file.size}`;
      const existing = uploadedPhotos.get(key);
      if (existing) {
        onProgress?.(1);
        return { photo: existing, wasDeduplicated: true, bytesStored: 0 };
      }

      const photoId = nextId('photo');
      const stored: Photo = {
        photoId,
        thumbnailUrl: `/api/photos/${photoId}/thumbnail`,
        cardUrl: `/api/photos/${photoId}/card`,
        fullUrl: `/api/photos/${photoId}/full`,
        width: 1600,
        height: 1200,
      };
      uploadedPhotos.set(key, stored);
      photosById.set(photoId, stored);
      onProgress?.(1);
      return { photo: stored, wasDeduplicated: false, bytesStored: file.size };
    },

    // --- Opening hours ------------------------------------------------------------

    async getOpeningHours(branchId): Promise<WeeklyHours> {
      await wait();
      requireBranchInVenue(branchId);
      return hoursFor(branchId);
    },

    async replaceOpeningHours({ branchId, week }): Promise<WeeklyHours> {
      await wait();

      // The server's own check, so the screen's client-side validation has
      // something to be tested against rather than being the only opinion.
      const clashing = week.filter((day) => overlapsWithin(day.blocks)).map((day) => day.day);
      if (clashing.length > 0) {
        throw new OverlappingHoursError({
          url: `${URL_TAG}/opening-hours`,
          days: clashing,
          detail: 'Two opening times on the same day overlap.',
        });
      }

      const stored: WeeklyHours = week.map((day) => ({
        day: day.day,
        blocks: day.blocks.map((block) => ({ ...block })),
      }));
      hours.set(branchId, stored);
      return stored;
    },

    // --- The reservation policy ---------------------------------------------------

    async getReservationPolicy(branchId): Promise<ReservationPolicy> {
      await wait();
      requireBranchInVenue(branchId);
      return policyFor(branchId);
    },

    // --- Staff ----------------------------------------------------------------

    async listStaff(venueId) {
      await wait();
      requireVenueInScope(venueId);
      return [...staffFor(venueId)];
    },

    async createStaff({ venueId, staff }) {
      await wait();
      /*
       * The role guard, enforced here as the server enforces it.
       *
       * The mock has to refuse what the server refuses or the screen's pickers
       * could be wrong and every test would still pass — which is precisely
       * how the availability bug survived. `assignableRoles` is the same
       * function the picker is built from, so the two cannot disagree about
       * what a manager may create.
       */
      const actor = actingStaff(venueId);
      if (!assignableRoles(actor.role).includes(staff.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `A ${actor.role} cannot create a ${staff.role}.`,
          field: 'role',
        });
      }

      /*
       * Either both or neither, as the server rules it: an email without a
       * password is a 400 with no field named, and so is a password without
       * an email — `HasPasswordCredentials` is `Email is not null &&
       * PasswordHash is not null`, so a person holding one and not the other
       * is a state the server can never report. An empty string counts as
       * given: it `is not null` there, and is refused as blank.
       *
       * This mock used to accept the email half and mark the person
       * sign-in-less, which would have let a screen forward the address on
       * the create call and pass every test while the real backend refused
       * every hire. A manager gets their sign-in through `issueStaffSignIn`,
       * after they exist.
       */
      const email = staff.email ?? null;
      const password = staff.password ?? null;
      if ((email === null) !== (password === null) || email?.trim() === '' || password === '') {
        throw new ValidationError({
          url: URL_TAG,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid request',
            status: 400,
            detail: 'An admin-panel sign-in needs both an email address and a password.',
            code: 'invalid-request',
            traceId: 'mock',
          },
        });
      }

      // Only the two roles that use the admin panel may hold a password: the
      // server's `RequireCanHoldPassword`, a 409 about the person being made.
      if (email !== null && !isAdminRole(staff.role)) throw conflict(pinOnly(staff.role));

      // Stored as the server stores it, and one account per address across
      // the whole table — see `addressTaken`.
      const address = email === null ? null : email.trim().toLowerCase();
      if (address !== null && addressTaken(address, null)) throw conflict(ADDRESS_TAKEN);

      const created: StaffMember = {
        id: nextId('staff'),
        venueId,
        branchId: staff.branchId,
        fullName: staff.fullName,
        phone: staff.phone,
        role: staff.role,
        isActive: true,
        email: address,
        hasPasswordSignIn: address !== null,
        isPinLocked: false,
      };

      // The PIN is *not* kept. Nothing in this mock can hand it back, which is
      // the same promise the server makes and the reason the screen shows it
      // once and never again.
      staffFor(venueId).push(created);
      return created;
    },

    async updateStaff({ venueId, staffMemberId, patch }) {
      await wait();
      const list = staffFor(venueId);
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });

      const subject = list[index]!;
      const actor = actingStaff(venueId);

      if (!canEditStaff(actor, subject)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail:
            actor.id === subject.id
              ? 'You cannot change your own role or deactivate your own account.'
              : `A ${actor.role} cannot edit a ${subject.role}.`,
          field: actor.id === subject.id ? 'role' : 'role',
        });
      }

      if (patch.role !== undefined && !assignableRoles(actor.role).includes(patch.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `A ${actor.role} cannot assign the role ${patch.role}.`,
          field: 'role',
        });
      }

      const updated: StaffMember = {
        ...subject,
        ...(patch.fullName === undefined ? {} : { fullName: patch.fullName }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.role === undefined ? {} : { role: patch.role }),
        ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
        // Applied only behind the flag, so "venue-wide" (null) is reachable and
        // distinguishable from "leave it alone".
        ...(patch.setBranch ? { branchId: patch.branchId ?? null } : {}),
      };

      list[index] = updated;
      return updated;
    },

    async setStaffPin({ venueId, staffMemberId, pin }) {
      await wait();
      const list = staffFor(venueId);
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });

      if (!/^\d{4,8}$/u.test(pin)) {
        throw new ValidationError({
          url: URL_TAG,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid PIN',
            status: 400,
            detail: 'A PIN is 4 to 8 digits.',
            code: 'validation-failed',
            traceId: 'mock',
            errors: { pin: ['A PIN is 4 to 8 digits.'] },
          },
        });
      }

      // Setting a PIN clears any lockout, as the server's does. The PIN itself
      // is discarded: this mock could not return it later if it wanted to.
      const updated = { ...list[index]!, isPinLocked: false };
      list[index] = updated;
      return updated;
    },

    async issueStaffSignIn({ venueId, staffMemberId, email }) {
      await wait();

      /*
       * The server's refusals, in the server's order, because the screen shows
       * the sentence it gets and a mock that refused in a different order would
       * let the wrong sentence pass every test.
       *
       * The address goes first. `IssueSignInRequest` is validated by the
       * endpoint filter before the handler runs, so a malformed or overlong
       * address is a 422 naming `email` whatever the target is — unknown, a
       * waiter, deactivated — and the backend's own test pins that. Then the
       * handler: self and rank are the role guard (403); a PIN-only role, a
       * deactivated person and a taken address are facts about the target
       * (409).
       *
       * Lowercased with `toLowerCase`, not the host locale: the server uses
       * `ToLowerInvariant`, and in a Turkish-locale browser the two disagree
       * about `I`.
       */
      const address = email.trim().toLowerCase();
      if (address.length > EMAIL_MAX_LENGTH) {
        throw badAddress(
          `The field email must be a string with a maximum length of ${EMAIL_MAX_LENGTH}.`,
        );
      }
      if (!/^[^\s@]+@[^\s@]+$/u.test(address)) {
        throw badAddress('The email field is not a valid e-mail address.');
      }

      const list = staffFor(venueId);
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });

      const subject = list[index]!;
      const actor = actingStaff(venueId);

      if (actor.id === subject.id) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `Issuing your own sign-in requires the PlatformAdmin role; the caller is a ${SERVER_ROLE[actor.role]}.`,
        });
      }

      if (!isAdminRole(subject.role)) throw conflict(pinOnly(subject.role));

      // Strictly above — the server's `Outranks`, not its `MayManage`: an
      // owner may edit a co-owner but cannot issue their sign-in, and a
      // manager reaches no admin role at all. `outranks` is what the screens'
      // sign-in buttons are gated on, so the two cannot disagree.
      if (!outranks(actor.role, subject.role)) {
        throw new StaffPermissionError({
          url: URL_TAG,
          detail: `Issuing a sign-in for a ${SERVER_ROLE[subject.role]} requires the PlatformAdmin role; the caller is a ${SERVER_ROLE[actor.role]}.`,
        });
      }

      if (!subject.isActive) {
        throw conflict(
          `${subject.fullName} is deactivated. Reactivate them first, then send a sign-in link.`,
        );
      }

      if (addressTaken(address, subject.id)) throw conflict(ADDRESS_TAKEN);

      // The address changes now; the password, if any, only when the link is
      // used. `hasPasswordSignIn` is therefore left exactly as it was, which
      // is what makes "Awaiting password" true for a first issue and absent
      // for a re-issue to somebody who already signs in.
      list[index] = { ...subject, email: address };

      /*
       * An opaque token from the same generator the enrolment code uses, and
       * only the *link* is handed back: nothing here keeps it, so this mock
       * could not return it a second time if asked — the same promise the
       * server makes with its hash. The fragment, not the query, because that
       * is where the real template puts it and the reset page reads it from.
       */
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const token = Array.from({ length: 32 }, () => {
        sequence = (sequence * 1103515245 + 12345) % 2147483648;
        return alphabet[sequence % alphabet.length];
      }).join('');

      const link: StaffSignInLink = {
        staffMemberId: subject.id,
        email: address,
        resetLink: `${URL_TAG}/reset-password#token=${token}`,
        expiresAtUtc: new Date(now().getTime() + 24 * 60 * 60_000).toISOString(),
        replacedExistingSignIn: subject.hasPasswordSignIn,
      };
      return link;
    },

    async clearPinLockout({ branchId, staffMemberId }) {
      await wait();
      const venueId = venueOfBranch(branchId);
      const list = venueId ? staffFor(venueId) : [];
      const index = list.findIndex((member) => member.id === staffMemberId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });
      list[index] = { ...list[index]!, isPinLocked: false };
    },

    // --- Devices --------------------------------------------------------------

    async listDevices(branchId) {
      await wait();
      requireBranchInVenue(branchId);
      return [...devicesFor(branchId)];
    },

    async createEnrolmentCode(branchId) {
      await wait();
      /*
       * A fresh code every time, and the old one is not retrievable — the same
       * promise the server makes, which is why "regenerate" is a new code
       * rather than a second look at the last one.
       *
       * **Ten characters of the server's own readable alphabet.** No I, L, O or
       * U and no digits that resemble them: a manager reading this across a bar
       * should not have to say "letter O, not zero". The mock used to emit six
       * digits, which looked plausible, sized differently on screen, and would
       * have let a client built against it meet a real code it had never been
       * laid out for.
       */
      const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
      const code = Array.from({ length: 10 }, () => {
        sequence = (sequence * 1103515245 + 12345) % 2147483648;
        return alphabet[sequence % alphabet.length];
      }).join('');
      return {
        code,
        expiresAtUtc: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        branchId,
      };
    },

    async revokeDevice({ branchId, deviceId }) {
      await wait();
      const list = devicesFor(branchId);
      const index = list.findIndex((device) => device.id === deviceId);
      if (index < 0) throw new NotFoundError({ url: URL_TAG });
      // Revoked, not removed: the list is an audit trail, and "which tablet was
      // this done from, and was it still ours" is asked after the fact.
      list[index] = { ...list[index]!, isRevoked: true };
    },

    // --- Reports ------------------------------------------------------------

    async getOccupancyReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      return reports.occupancy(query);
    },

    async getReservationReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      return reports.reservations(query);
    },

    async getRevenueReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      return reports.revenue(query);
    },

    async getMenuReport(query) {
      // The slowest of the five against a real database — it anti-joins the
      // whole menu to find what never sold — so the mock is slow too. A section
      // that always answers instantly is a section whose loading state nobody
      // ever sees, and this is the one that needs a real one.
      await wait(3);
      requireBranchInVenue(query.branchId);
      return reports.menu(query);
    },

    async getStaffReport(query) {
      await wait();
      requireBranchInVenue(query.branchId);
      return reports.staff(query);
    },

    async exportReport(input) {
      await wait();
      return reports.csv(input);
    },

    async replaceReservationPolicy({ branchId, policy }): Promise<PolicyChangeResult> {
      await wait();

      // Refused, never clamped, and named — the same sentence shape the server
      // produces, so the message-to-field mapping is exercised by the mock too.
      for (const [field, bounds] of Object.entries(POLICY_BOUNDS)) {
        const value = policy[field as keyof ReservationPolicy];
        if (typeof value !== 'number') continue;
        if (value < bounds.min || value > bounds.max) {
          throw new PolicyBoundsError({
            url: `${URL_TAG}/reservation-policy`,
            field,
            detail: `${POLICY_LABELS[field] ?? field} must be between ${bounds.min} and ${bounds.max}; ${value} was given.`,
          });
        }
      }

      const previous = policyFor(branchId);
      policies.set(branchId, policy);

      // Bookings that would not have been allowed under the new rules. They are
      // **not** changed — a settings edit never rewrites a booking — and the
      // count is the whole reason this screen reports anything at all.
      const affected =
        policy.bookingWindowDays < previous.bookingWindowDays ||
        policy.turnTimeMinutes > previous.turnTimeMinutes
          ? MOCK_AFFECTED_RESERVATIONS
          : [];

      return {
        policy,
        affectedExistingReservations: affected.length,
        affectedReservationIds: affected,
      };
    },
  };
}
