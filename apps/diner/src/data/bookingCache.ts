import type { QueryClient } from '@tanstack/react-query';

/**
 * After losing the race for a table, make the room underneath redraw.
 *
 * `['availability', branchId]` is the prefix every slot-aware read of the
 * branch sits under — including the branch screen's `useSlotFloor`, whose
 * observer is still mounted beneath the confirm screen, so it refetches as the
 * diner lands back on it.
 *
 * This used to write the 409's floor to `['floor', branchId]`, which no diner
 * screen reads, and invalidate `['availability', branchId, slot, size]`, which
 * does not prefix the slot floor's key. The room came back unchanged, with the
 * taken table still drawn free under "Here is what is free now".
 */
export function refreshRoomAfterLoss(queryClient: QueryClient, branchId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['availability', branchId] });
}
