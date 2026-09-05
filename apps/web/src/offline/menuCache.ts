import type { Menu } from '@yalla/api';
import { get, set, type UseStore } from 'idb-keyval';
import { openStore } from './idb';

/**
 * The menu, on disk, per branch.
 *
 * This exists because of one failure that shipped invisible: order entry needs
 * the menu, TanStack Query does not *fail* a query the browser cannot send —
 * it **pauses** it — and a paused query never resolves and never errors. A
 * waiter who opened order entry on a tablet that had been rebooted with the
 * wifi off got an empty grid and a spinner, for as long as they were willing to
 * look at it.
 *
 * Fetching the menu early, as the floor screen does, only fixes the case where
 * the tablet was online at some point *this* session. The case that actually
 * happens — kill the app, reopen it in a basement — needs the menu to be on
 * disk, which is what this is.
 *
 * A cached menu can be stale. That is acceptable and the alternative is not: a
 * price that moved last week is a conversation, and no menu at all is a
 * notepad. The fetch that follows a cache hit replaces it silently.
 */

const PREFIX = 'menu:v1:';

export interface CachedMenu {
  readonly menu: Menu;
  /** When this device stored it, so the query can still refetch in the background. */
  readonly storedAtMs: number;
}

export interface MenuCache {
  read(branchId: string): Promise<CachedMenu | null>;
  write(branchId: string, menu: Menu): Promise<void>;
}

export function createMenuCache(store: UseStore = openStore('menu-cache')): MenuCache {
  return {
    async read(branchId) {
      try {
        return (await get<CachedMenu>(`${PREFIX}${branchId}`, store)) ?? null;
      } catch {
        // A browser with site data blocked. The screen degrades to "the menu is
        // not on this tablet yet", which is true and is not a spinner.
        return null;
      }
    },

    async write(branchId, menu) {
      try {
        await set(`${PREFIX}${branchId}`, { menu, storedAtMs: Date.now() }, store);
      } catch {
        /* Failing to cache is not failing to order. */
      }
    },
  };
}

/** In memory, for tests. */
export function createMemoryMenuCache(): MenuCache {
  const entries = new Map<string, CachedMenu>();
  return {
    read: async (branchId) => entries.get(branchId) ?? null,
    write: async (branchId, menu) => void entries.set(branchId, { menu, storedAtMs: Date.now() }),
  };
}

export const menuCache: MenuCache = createMenuCache();
