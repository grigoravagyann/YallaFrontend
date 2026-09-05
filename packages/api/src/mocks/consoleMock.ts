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
import {
  FloorPlanInvalidError,
  OutOfScopeError,
  SlugTakenError,
  VenueHasOpenTabsError,
} from '../contracts/errors';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  EditorFloorTable,
  FloorPlanSaveResult,
  TableDeletionResult,
} from '../contracts/floorPlan';
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

    // --- The floor plan editor ----------------------------------------------

    async getFloorPlan(branchId) {
      await wait();
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
  };
}
