import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminMenuCategory,
  CreateMenuItemInput,
  UpdateMenuItemInput,
} from '../contracts/menuAdmin';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews, refreshVenueViews } from './consoleRefresh';

// --- The menu editor, opening hours and the reservation policy ----------------

/**
 * The whole menu for a branch.
 *
 * Reference data with a long stale time and **no refetch on focus**: somebody
 * entering eighty dishes alt-tabs to a spreadsheet constantly, and a list that
 * reordered itself under the cursor on every return is a list that gets the
 * wrong price edited.
 */
export function useAdminMenu(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.adminMenu(branchId ?? ''),
    queryFn: () => gateway.getAdminMenu(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * Every menu mutation invalidates the whole menu, and none of them patches it.
 *
 * Patching would be faster and is the wrong trade here: a reorder changes the
 * display order of rows the response does not mention, and a client that
 * patched one row would show an order the server does not have. The menu is one
 * request.
 */
function useMenuMutation<TInput, TResult>(
  branchId: string | undefined,
  run: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminMenu(branchId ?? '') });
      // Categories, items and their completeness are three checklist lines.
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(branchId ?? '') });
      // The pre-order exclusions live on the dish rows: a deleted dish (or a
      // category with its dishes) leaves the server's list, and a cached
      // list still naming it is refused on the next save (review S5).
      void queryClient.invalidateQueries({
        queryKey: queryKeys.preOrderSettings(branchId ?? ''),
      });
      // Unfinished dishes are the list's readiness line and Home's "not ready".
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

export function useCreateCategory(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { name: string; displayOrder?: number | undefined }) =>
    gateway.createCategory({ branchId: branchId!, ...input }),
  );
}

export function useUpdateCategory(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(
    branchId,
    (input: { categoryId: string; name?: string | undefined; displayOrder?: number | undefined }) =>
      gateway.updateCategory({ branchId: branchId!, ...input }),
  );
}

export function useDeleteCategory(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { categoryId: string }) =>
    gateway.deleteCategory({ branchId: branchId!, ...input }),
  );
}

export function useCreateMenuItem(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (item: CreateMenuItemInput) =>
    gateway.createMenuItem({ branchId: branchId!, item }),
  );
}

export function useUpdateMenuItem(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { itemId: string; patch: UpdateMenuItemInput }) =>
    gateway.updateMenuItem({ branchId: branchId!, ...input }),
  );
}

/**
 * The sold-out switch. Its answer is written into the cached menu at once, so
 * the row says what the server now holds before the read that follows.
 */
export function useSetMenuItemAvailability(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; isAvailable: boolean }) =>
      gateway.setMenuItemAvailability({ branchId: branchId!, ...input }),
    retry: false,
    onSuccess: (item) => {
      queryClient.setQueryData<readonly AdminMenuCategory[]>(
        queryKeys.adminMenu(branchId ?? ''),
        (menu) =>
          menu?.map((category) => ({
            ...category,
            items: category.items.map((entry) => (entry.id === item.id ? item : entry)),
          })),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminMenu(branchId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(branchId ?? '') });
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

/** A dish's photo taken off (`DELETE …/photo`): the one field the PATCH cannot clear. */
export function useRemoveMenuItemPhoto(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { itemId: string }) =>
    gateway.removeMenuItemPhoto({ branchId: branchId!, ...input }),
  );
}

/**
 * The whole order of the branch's categories, in one call (VC3 wire §2). The
 * answer is the whole menu, cached at once so the list does not jump back
 * before the read that follows.
 */
export function useReorderMenuCategories(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryIds: readonly string[]) =>
      gateway.reorderMenuCategories({ branchId: branchId!, categoryIds }),
    retry: false,
    onSuccess: (menu) => {
      queryClient.setQueryData(queryKeys.adminMenu(branchId ?? ''), menu);
    },
    // A refusal is a stale menu: read it again, whichever way it went.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminMenu(branchId ?? '') });
    },
  });
}

/** The whole order of one category's dishes, in one call; its answer replaces that category. */
export function useReorderMenuItems(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { categoryId: string; itemIds: readonly string[] }) =>
      gateway.reorderMenuItems({ branchId: branchId!, ...input }),
    retry: false,
    onSuccess: (category) => {
      queryClient.setQueryData<readonly AdminMenuCategory[]>(
        queryKeys.adminMenu(branchId ?? ''),
        (menu) => menu?.map((candidate) => (candidate.id === category.id ? category : candidate)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminMenu(branchId ?? '') });
    },
  });
}

export function useDeleteMenuItem(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { itemId: string }) =>
    gateway.deleteMenuItem({ branchId: branchId!, ...input }),
  );
}

/**
 * One photo upload.
 *
 * Not a query mutation with cache side effects: a photo is attached to an item
 * by a separate call, and an upload that invalidated the menu would redraw the
 * table under a form somebody is still filling in.
 */
export function useUploadPhoto(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (input: {
      file: Blob;
      fileName: string;
      onProgress?: ((fraction: number) => void) | undefined;
      signal?: AbortSignal | undefined;
    }) => gateway.uploadPhoto({ branchId: branchId!, ...input }),
    retry: false,
  });
}
