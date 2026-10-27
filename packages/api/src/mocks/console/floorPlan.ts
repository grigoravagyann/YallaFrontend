import type {
  FloorPlanSaveResult,
  EditorFloorArea,
  TableDeletionResult,
} from '../../contracts/floorPlan';
import { applyFloorPlan, sortAreas } from '../floorPlanMock';
import type { BranchReadiness } from '../../contracts/readiness';
import { NotFoundError, ConcurrencyConflictError } from '../../errors';
import { OutOfScopeError } from '../../contracts/errors';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';
import { ProblemCodes } from '../../generated/problemCodes';

/** The floor plan editor: the stored plan, its areas and tables, QR codes and readiness. */
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
> {
  const {
    branchPhoto,
    bumped,
    floorPlanFor,
    floorPlans,
    hasHistory,
    nextId,
    readinessFor,
    requireBranchInVenue,
    requireManagerAtBranch,
    requireUnusedAreaName,
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
            code: ProblemCodes.ConflictingState,
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
  };
}
