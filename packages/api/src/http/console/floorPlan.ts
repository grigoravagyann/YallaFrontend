import type { ConsoleGateway } from '../../consoleGateway';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  EditorFloorTable,
  EditorTablePin,
  EditorTableStatus,
  FloorPlanSaveResult,
  TableDeletionResult,
} from '../../contracts/floorPlan';
import { absolutePhoto } from '../photoUrl';
import { FloorPlanChangedError, FloorPlanInvalidError } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import { readinessFromWire } from '../consoleMapping';
import { photo } from '../venueSettingsMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type ConsoleHttpContext, BRANCHES } from './context';

type Schemas = components['schemas'];
type WireArea = Schemas['Yalla.Application.BranchSettings.FloorAreaView'];
type WireTable = Schemas['Yalla.Application.BranchSettings.FloorTableView'];
type WireFloorPlan = Schemas['Yalla.Application.BranchSettings.FloorPlanView'];
type WireSaveResult = Schemas['Yalla.Application.BranchSettings.FloorPlanReplaceResult'];

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** `Yalla.Domain.Enums.TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
const TABLE_STATUS: Readonly<Record<number, EditorTableStatus>> = {
  1: 'free',
  2: 'held',
  4: 'occupied',
  5: 'outOfService',
};

function areaFromWire(area: WireArea, baseUrl: string): EditorFloorArea {
  return {
    id: area.id,
    name: area.name,
    displayOrder: area.displayOrder,
    photos: (area.photos ?? []).map((view) => absolutePhoto(baseUrl, photo(view))),
  };
}

function pinFromWire(table: WireTable): EditorTablePin | null {
  const { photoId, photoX, photoY } = table;
  // All three or none: a pin missing a part has nowhere to be drawn.
  if (!photoId || typeof photoX !== 'number' || typeof photoY !== 'number') return null;
  return { photoId, x: photoX, y: photoY };
}

function floorPlanFromWire(plan: WireFloorPlan, baseUrl: string): EditorFloorPlan {
  return {
    branchId: plan.branchId,
    areas: [...(plan.areas ?? [])]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((area) => areaFromWire(area, baseUrl)),
    tables: (plan.tables ?? []).map((table): EditorFloorTable => ({
      id: table.id,
      label: table.label,
      seats: table.seats,
      floorAreaId: table.floorAreaId ?? null,
      isBookable: table.isBookable,
      isActive: table.isActive,
      isDeletable: table.isDeletable,
      status: TABLE_STATUS[table.status] ?? 'outOfService',
      qrToken: table.qrToken,
      pin: pinFromWire(table),
    })),
    version: plan.version,
  };
}

export function floorPlanMethods(
  ctx: ConsoleHttpContext,
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
  const { client } = ctx;
  return {
    // --- The rooms editor -------------------------------------------------

    async getFloorPlan(branchId: string): Promise<EditorFloorPlan> {
      const { data } = await client.get<WireFloorPlan>(`${BRANCHES}/${branchId}/floor-plan`);
      return floorPlanFromWire(data, client.baseUrl);
    },

    async replaceFloorPlan({ branchId, command }): Promise<FloorPlanSaveResult> {
      try {
        // Inline, so check-gateway-schema reads every key against the request shape.
        const { data } = await client.put<WireSaveResult>(`${BRANCHES}/${branchId}/floor-plan`, {
          expectedVersion: command.expectedVersion,
          areas: command.areas.map(
            (area): Schemas['Yalla.Application.BranchSettings.FloorAreaInput'] => ({
              id: area.id ?? null,
              name: area.name,
              displayOrder: area.displayOrder,
              photoIds: [...area.photoIds],
            }),
          ),
          tables: command.tables.map(
            (table): Schemas['Yalla.Application.BranchSettings.FloorTableInput'] => ({
              id: table.id ?? null,
              label: table.label,
              seats: table.seats,
              floorAreaName: table.floorAreaName ?? null,
              isBookable: table.isBookable,
              // A pin is all three or none of them; the server refuses half of one.
              photoId: table.pin?.photoId ?? null,
              photoX: table.pin ? table.pin.x : null,
              photoY: table.pin ? table.pin.y : null,
              // `qrToken` is deliberately absent. The sticker on the table has
              // to keep working, and only the explicit regenerate action changes it.
            }),
          ),
        });
        return {
          plan: floorPlanFromWire(data.plan, client.baseUrl),
          warnings: data.warnings ?? [],
          deactivatedTables: data.deactivatedTables ?? [],
          removedTables: data.removedTables ?? [],
        };
      } catch (error) {
        if (error instanceof ApiError && error.code === ProblemCodes.FloorPlanChanged) {
          const current = error.problem?.context?.['currentVersion'];
          throw new FloorPlanChangedError({
            url: error.url,
            requestId: error.requestId,
            currentVersion: typeof current === 'string' ? current : null,
          });
        }
        // Only the plan's own refusal is a plan error. A `validation-failed`
        // 422 - a photo in two rooms, half a pin, a missing `expectedVersion`
        // - is already the client's `ValidationError`, naming the field.
        if (error instanceof ApiError && error.code === ProblemCodes.FloorPlanInvalid) {
          const context = error.problem?.context ?? {};
          throw new FloorPlanInvalidError({
            url: error.url,
            errors: stringList(context['errors']).length
              ? stringList(context['errors'])
              : [error.message],
            duplicateLabels: stringList(context['duplicateLabels']),
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    async getBranchReadiness(branchId) {
      const { data } = await client.get<
        Schemas['Yalla.Application.BranchSettings.BranchReadinessView']
      >(`${BRANCHES}/${branchId}/readiness`);
      return readinessFromWire(data);
    },

    async createFloorArea({ branchId, name, displayOrder }): Promise<EditorFloorArea> {
      const { data } = await client.post<WireArea>(`${BRANCHES}/${branchId}/floor-areas`, {
        name,
        displayOrder,
      });
      return areaFromWire(data, client.baseUrl);
    },

    async updateFloorArea({ branchId, areaId, name, displayOrder }): Promise<EditorFloorArea> {
      const { data } = await client.patch<WireArea>(
        `${BRANCHES}/${branchId}/floor-areas/${areaId}`,
        { name, displayOrder },
      );
      return areaFromWire(data, client.baseUrl);
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
  };
}
