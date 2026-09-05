import type { Menu } from '@yalla/api';
import { useStaffMenu } from '@yalla/api/react';
import { useEffect, useState } from 'react';
import { menuCache, type CachedMenu } from '../offline/menuCache';

/**
 * The menu, from disk first and the network second.
 *
 * This is the fix for one of the four defects that shipped invisible. Order
 * entry needs the menu; TanStack Query does not *fail* a query the browser
 * cannot send, it **pauses** it — `isError` stays false and `isLoading` stays
 * true forever — so a waiter who opened order entry on a tablet that had been
 * rebooted with the wifi off got a grid and a spinner and no way to tell that
 * nothing was ever going to arrive.
 *
 * Fetching early, as the floor screen does, only covers the case where the
 * tablet was online at some point *this* session. The case that actually
 * happens on a counter — kill the app, reopen it in a basement — needs the menu
 * to have been on disk before the app started, which is what the cache is for.
 *
 * The order is deliberate: read the cache, seed the query with it, let the
 * network replace it. A stale menu is a conversation about a price; no menu is
 * a notepad.
 */
export interface CachedMenuResult {
  readonly data: Menu | null;
  /** True while there is genuinely nothing to draw and something may still arrive. */
  readonly loading: boolean;
  /** Nothing on disk and nothing reachable. The screen says so rather than spinning. */
  readonly unavailable: boolean;
  /** What is on screen came off this device, not off the network. */
  readonly fromCache: boolean;
}

/**
 * The state the screen should be in, given a cache read and a query.
 *
 * Pure, and separated from the hook on purpose: the defect this whole module
 * exists for is a *decision* — treating a paused query as loading — and a
 * decision buried inside a hook is one no test can ask about. Everything that
 * matters is in the four lines at the bottom.
 */
export function resolveMenuState(input: {
  /** `undefined` while the cache read is still in flight. */
  readonly seed: CachedMenu | null | undefined;
  readonly queryData: Menu | null | undefined;
  /** TanStack Query's `fetchStatus`. `paused` is the case that shipped broken. */
  readonly fetchStatus: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
}): CachedMenuResult {
  const ready = input.seed !== undefined;
  const data = input.queryData ?? input.seed?.menu ?? null;
  const paused = input.fetchStatus === 'paused';

  return {
    data,
    // A paused query with nothing to show is **not loading**: nothing is in
    // flight and nothing will be until the connection returns. Reporting it as
    // loading is what produced a spinner that never resolved.
    loading: !ready || (input.isLoading && !paused && data === null),
    unavailable: data === null && (paused || input.isError),
    fromCache: data !== null && data === input.seed?.menu,
  };
}

export function useCachedMenu(branchId: string | undefined, enabled = true): CachedMenuResult {
  const [seed, setSeed] = useState<CachedMenu | null | undefined>(undefined);

  // The read has to finish before the query mounts with its seed, so the query
  // is disabled until then. One extra tick against a hit that saves the whole
  // screen against a miss.
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    void menuCache.read(branchId).then((cached) => {
      if (!cancelled) setSeed(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const query = useStaffMenu(enabled && seed !== undefined ? branchId : undefined, {
    initialData: seed?.menu ?? null,
    ...(seed ? { initialDataUpdatedAt: seed.storedAtMs } : {}),
  });

  // Written back whenever the network answers, so the next cold launch has it.
  useEffect(() => {
    if (!branchId || !query.data) return;
    if (seed && query.data === seed.menu) return;
    void menuCache.write(branchId, query.data);
  }, [branchId, query.data, seed]);

  return resolveMenuState({
    seed,
    queryData: query.data,
    fetchStatus: query.fetchStatus,
    isLoading: query.isLoading,
    isError: query.isError,
  });
}
