import type {
  FloorPlanSaveResult,
  EditorFloorArea,
  TableDeletionResult,
} from '../../contracts/floorPlan';
import { applyFloorPlan, sortAreas } from '../floorPlanMock';
import type { BranchReadiness } from '../../contracts/readiness';
import { NotFoundError, ConcurrencyConflictError } from '../../errors';
import { OutOfScopeError, BranchNotReadyError } from '../../contracts/errors';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** The floor plan editor: the stored plan, its areas and tables, QR codes, readiness and the branch tier. */
export function floorPlanMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  | 'getFloorPlan'
  | 'replaceFloorPlan'
  | 'getBranchReadiness'
  | 'createFloorArea'
  | 'updateFloorArea'
  | 'deleteFloorArea'
  | 'deleteTable'
  | 'regenerateTableQr'
  | 'setBranchTier'
> {
  const {
    branchPhoto,
    bumped,
    conflict,
    floorPlanFor,
    floorPlans,
    hasHistory,
    isIncompleteItem,
    log,
    menuFor,
    nextId,
    readinessFor,
    requireBranchInVenue,
    requireManagerAtBranch,
    requireUnusedAreaName,
    toDetail,
    venues,
    wait,
  } = ctx;
  return {
    // --- The floor plan editor ----------------------------------------------

    async getFloorPlan(branchId) {
      await wait();
      requireBranchInVenue(branchId);
      return floorPlanFor(branchId);
    },

    async replaceFloorPlan({ branchId, command }): Promise<FloorPlanSaveResult> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/floor-plan`;
      requireBranchInVenue(branchId);
      const result = applyFloorPlan(floorPlanFor(branchId), command, {
        branchId,
        url,
        hasHistory,
        branchPhoto: (photoId) => branchPhoto(branchId, photoId),
        newId: nextId,
      });
      floorPlans.set(branchId, result.plan);
      return result;
    },

    async getBranchReadiness(branchId): Promise<BranchReadiness> {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/readiness`);
      return readinessFor(branchId);
    },

    async createFloorArea({ branchId, name, displayOrder }) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/floor-areas`;
      requireBranchInVenue(branchId);
      const plan = floorPlanFor(branchId);
      requireUnusedAreaName(plan, name, null, url);
      // A new room has no photos; they are added through the plan save.
      const area: EditorFloorArea = {
        id: nextId(`area-${branchId}`),
        name: name.trim(),
        displayOrder,
        photos: [],
      };
      // A change to the plan, so its version moves: a stale editor is refused
      // rather than saving over the new room and deleting it.
      floorPlans.set(branchId, {
        ...plan,
        areas: sortAreas([...plan.areas, area]),
        version: bumped(plan.version),
      });
      return area;
    },

    async updateFloorArea({ branchId, areaId, name, displayOrder }) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/floor-areas/${areaId}`;
      requireBranchInVenue(branchId);
      const plan = floorPlanFor(branchId);
      const existing = plan.areas.find((area) => area.id === areaId);
      if (!existing) throw new NotFoundError({ url });
      requireUnusedAreaName(plan, name, areaId, url);
      const updated: EditorFloorArea = { ...existing, name: name.trim(), displayOrder };
      floorPlans.set(branchId, {
        ...plan,
        areas: sortAreas(plan.areas.map((area) => (area.id === areaId ? updated : area))),
        version: bumped(plan.version),
      });
      return updated;
    },

    async deleteFloorArea({ branchId, areaId }) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/floor-areas/${areaId}`;
      requireBranchInVenue(branchId);
      const plan = floorPlanFor(branchId);
      if (!plan.areas.some((area) => area.id === areaId)) throw new NotFoundError({ url });
      floorPlans.set(branchId, {
        ...plan,
        areas: plan.areas.filter((area) => area.id !== areaId),
        // The room and its photos go; its tables stay, with no room and no pin.
        tables: plan.tables.map((t) =>
          t.floorAreaId === areaId ? { ...t, floorAreaId: null, pin: null } : t,
        ),
        version: bumped(plan.version),
      });
    },

    async deleteTable({ branchId, tableId }): Promise<TableDeletionResult> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/tables/${tableId}`;
      requireBranchInVenue(branchId);
      const plan = floorPlanFor(branchId);
      const table = plan.tables.find((t) => t.id === tableId);
      if (!table) throw new NotFoundError({ url });

      if (table.status === 'occupied') {
        const detail = `Table ${table.label} has a party seated at it. Free it first.`;
        throw new ConcurrencyConflictError({
          url,
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

      // The plan changed: a tab that loaded before this must not save the table back.
      const floorPlanVersion = bumped(plan.version);
      if (hasHistory(tableId)) {
        floorPlans.set(branchId, {
          ...plan,
          tables: plan.tables.map((t) => (t.id === tableId ? { ...t, isActive: false } : t)),
          version: floorPlanVersion,
        });
        return {
          tableId,
          label: table.label,
          deleted: false,
          deactivated: true,
          floorPlanVersion,
          message:
            `Table ${table.label} has reservations, seatings or tabs in its history, so it was deactivated rather than deleted. ` +
            'Its records are kept; it no longer appears on the floor plan or takes bookings.',
        };
      }

      floorPlans.set(branchId, {
        ...plan,
        tables: plan.tables.filter((t) => t.id !== tableId),
        version: floorPlanVersion,
      });
      return {
        tableId,
        label: table.label,
        deleted: true,
        deactivated: false,
        floorPlanVersion,
        message: `Table ${table.label} was never used and has been removed.`,
      };
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
        if (!branch) break;

        // `PlatformService.UpdateBranchAsync`: a deleted venue's branches can
        // no longer be changed — a DomainStateException (409) before either
        // tier rule. The mock let "Switch to Paid" through (QA F11).
        if (record.status === 'deleted') {
          throw conflict(
            `Venue '${record.name}' has been deleted, so its branches can no longer be changed.`,
          );
        }

        // The server's two rules, in its order. Going Free hides live bills
        // from the people who owe them, so it waits for the tabs; going Paid
        // is where an unfinished menu is finally refused, with the count.
        if (tier === 'free' && branch.subscriptionTier === 'paid') {
          const open = branch.openTabCount ?? 0;
          if (open > 0) {
            throw conflict(
              `This branch has ${open} open tab(s). Moving it to Free would hide those bills from the people who owe them. Wait until they are settled.`,
            );
          }
        }
        if (tier === 'paid' && branch.subscriptionTier === 'free') {
          const incomplete = menuFor(branchId)
            .flatMap((category) => category.items)
            .filter(isIncompleteItem).length;
          if (incomplete > 0) {
            throw new BranchNotReadyError({
              url: URL_TAG,
              branchId,
              incompleteMenuItemCount: incomplete,
            });
          }
        }

        record.branches[index] = { ...branch, subscriptionTier: tier };
        if (branch.subscriptionTier !== tier) {
          log('branch.tier-change', { type: 'Branch', id: branch.id, name: branch.name }, record, {
            tierTo: tier,
          });
        }
        return toDetail(record);
      }
      throw new OutOfScopeError({ url: URL_TAG });
    },
  };
}
