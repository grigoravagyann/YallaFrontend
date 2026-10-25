import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EditorFloorPlan, ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews, refreshVenueViews } from './consoleRefresh';

// --- The floor plan editor -----------------------------------------------------

/**
 * The stored plan the editor works on.
 *
 * Reference data, not live state: this is furniture, and it changes when
 * somebody edits it. Refetching on window focus would silently replace a
 * half-drawn room with the server's copy, so it does not.
 *
 * It is read afresh every time the editor opens, though: the editor loads one
 * copy and works on it, and a cached copy can carry a QR code another tab has
 * since replaced — printed from here, a sticker that never worked.
 */
export function useEditorFloorPlan(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.editorFloorPlan(branchId ?? ''),
    queryFn: () => gateway.getFloorPlan(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });
}

/**
 * Replace the whole plan atomically.
 *
 * Retry is off, as for every mutation here. This one is not idempotent in any
 * useful sense — a retry after a timeout would replace the room with whatever
 * the editor held at the moment of the first attempt, which may no longer be
 * what is on screen.
 */
export function useSaveFloorPlan() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; command: ReplaceFloorPlanCommand }) =>
      gateway.replaceFloorPlan(input),
    onSuccess: (result, input) => {
      // Carries the new `version`, which the next save sends back.
      queryClient.setQueryData(queryKeys.editorFloorPlan(input.branchId), result.plan);
      // The room the diner and the staff screens draw has just changed shape.
      void queryClient.invalidateQueries({ queryKey: queryKeys.floor(input.branchId) });
      void queryClient.invalidateQueries({ queryKey: ['availability', input.branchId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(input.branchId) });
      // The tables are a column of the list and of the venue page, and a room
      // with none is a "not ready" line on Home.
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

/**
 * Delete a table that was never used, or deactivate one that has history
 * (`DELETE /api/branches/{branchId}/tables/{tableId}`).
 *
 * It does not move the plan's `version`, so the cached plan keeps it: the
 * table goes from the cache, or stays there inactive, exactly as the server
 * now holds it. The rooms editor's next save then neither resurrects it nor
 * looks stale to itself.
 */
export function useDeleteTable(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) => gateway.deleteTable({ branchId: branchId!, tableId }),
    retry: false,
    onSuccess: (result) => {
      queryClient.setQueryData<EditorFloorPlan>(
        queryKeys.editorFloorPlan(branchId ?? ''),
        (plan) =>
          plan
            ? {
                ...plan,
                tables: result.deleted
                  ? plan.tables.filter((table) => table.id !== result.tableId)
                  : plan.tables.map((table) =>
                      table.id === result.tableId ? { ...table, isActive: false } : table,
                    ),
              }
            : plan,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.floor(branchId ?? '') });
      void queryClient.invalidateQueries({ queryKey: ['availability', branchId ?? ''] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(branchId ?? '') });
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

/**
 * What the branch still needs before it can take diners, from the server.
 *
 * Short-lived rather than reference data: it is the screen somebody watches
 * while finishing onboarding, and every save that feeds a line invalidates it.
 */
export function useBranchReadiness(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.readiness(branchId ?? ''),
    queryFn: () => gateway.getBranchReadiness(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

/**
 * Replace a table's QR code. The old sticker stops working at once, so every
 * cached plan holding the table takes the new token: the editor must never
 * show, or print, the dead one. It does not move the plan's `version`.
 */
export function useRegenerateTableQr() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tableId: string }) => gateway.regenerateTableQr(input),
    onSuccess: ({ qrToken }, { tableId }) => {
      queryClient.setQueriesData<EditorFloorPlan>({ queryKey: ['console', 'floorPlan'] }, (plan) =>
        plan?.tables.some((table) => table.id === tableId)
          ? {
              ...plan,
              tables: plan.tables.map((table) =>
                table.id === tableId ? { ...table, qrToken } : table,
              ),
            }
          : plan,
      );
      // A new code is a feed line (`table.regenerate-qr`).
      refreshPlatformViews(queryClient);
    },
  });
}
