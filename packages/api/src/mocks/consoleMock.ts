import type { ConsoleGateway } from '../consoleGateway';
import type {
  ConsoleBranch,
  ConsoleStaffMember,
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  Page,
  SubscriptionTier,
  UserRole,
  VenueStatus,
} from '../contracts/console';
import { OutOfScopeError, SlugTakenError, VenueHasOpenTabsError } from '../contracts/errors';
import { mockVenues } from './venues';

const URL_TAG = 'mock://yalla/console';
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
}

function slugify(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
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

  const wait = () =>
    latency > 0 ? new Promise((resolve) => setTimeout(resolve, latency)) : Promise.resolve();

  const venues = new Map<string, VenueRecord>();
  let sequence = 0;

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

  /** The scope a token of this role would carry. */
  function currentUser(): ConsoleUser {
    const firstVenue = [...venues.values()][0];
    const branchIds = firstVenue?.branches.map((b) => b.id) ?? [];

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
          scope: { venueId: firstVenue?.id ?? null, branchIds },
        };
      default:
        // Manager, waiter and kitchen are all one branch and no more.
        return {
          id: `u-${role}`,
          displayName:
            role === 'manager' ? 'Nare Petrosyan' : role === 'waiter' ? 'Gor Hakobyan' : 'Kitchen',
          role,
          scope: {
            venueId: firstVenue?.id ?? null,
            branchIds: branchIds.slice(0, 1),
          },
        };
    }
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
      const record = venues.get(venueId);
      return record ? toDetail(record) : null;
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
  };
}
