import {
  isEndpointNotWired,
  isTabAccessEnded,
  staleTime,
  type DinerTabView,
  type PlaceOrderCommand,
  type SettlementMode,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { liveMarkers, type ChangeMarker } from '../tab/events';
import { createRefetchCoalescer } from '../tab/refetchQueue';
import { createTabFeed, type TabFeed } from '../tab/tabFeed';

/**
 * Ordering and the bill, as query hooks.
 *
 * Kept beside the tab hooks rather than in them because the caching rules are
 * opposite, and the difference is the whole of Part 6:
 *
 * - **The menu is cached hard and readable offline.** It changes rarely and it
 *   is the thing somebody stares at while the signal is gone.
 * - **The bill is not cached as live data.** Offline it is shown as the last
 *   known state, marked stale, with the time it was read — never as current.
 */

export const orderKeys = {
  menuDetail: (branchId: string) => ['menuDetail', branchId] as const,
  dinerTab: (tabId: string) => ['dinerTab', tabId] as const,
  shares: (tabId: string) => ['tabShares', tabId] as const,
  branchZone: (branchId: string) => ['branchZone', branchId] as const,
};

/**
 * A tab read that says this phone is no longer on the tab is final: retrying
 * it cannot help, and three retries with backoff is how a removed guest stared
 * at a spinner.
 */
function retryUnlessEnded(failureCount: number, error: unknown): boolean {
  return !isTabAccessEnded(error) && failureCount < 2;
}

/**
 * The branch's zone, for a branch reached with no browse card and no tab — a
 * bare deep link to its floor. The card and the tab carry the zone themselves.
 * Cached as static: a branch does not move.
 */
export function useBranchTimeZone(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: orderKeys.branchZone(branchId ?? ''),
    queryFn: () => gateway.getBranchTimeZone(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.static,
    gcTime: 24 * 60 * 60_000,
  });
}

/**
 * The menu, cached for the session.
 *
 * `gcTime` well past `staleTime` on purpose: a diner who loses signal between
 * the tab screen and the menu must still get a menu, and a cache that has been
 * garbage-collected is the same as no cache at all.
 */
export function useMenuDetail(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: orderKeys.menuDetail(branchId ?? ''),
    queryFn: () => gateway.getBranchMenuDetail(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    gcTime: 24 * 60 * 60_000,
  });
}

/**
 * The tab as this phone may see it — the one read every tab screen draws from.
 *
 * `pollMs` while there is a reason to watch without an event stream: a pending
 * joiner waiting to be let on, a host waiting for somebody to ask.
 */
export function useDinerTab(tabId: string | undefined, options: { pollMs?: number } = {}) {
  const gateway = useGateway();
  return useQuery({
    queryKey: orderKeys.dinerTab(tabId ?? ''),
    queryFn: () => gateway.getDinerTab(tabId!),
    enabled: Boolean(tabId),
    staleTime: staleTime.live,
    retry: retryUnlessEnded,
    ...(options.pollMs ? { refetchInterval: options.pollMs } : {}),
  });
}

export function useTabShares(tabId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: orderKeys.shares(tabId ?? ''),
    queryFn: () => gateway.getTabShares(tabId!),
    enabled: Boolean(tabId),
    staleTime: staleTime.live,
    retry: retryUnlessEnded,
  });
}

/**
 * Placing the tray.
 *
 * Never retried, and no optimistic update. An order either reached the kitchen
 * or it did not, and a line that appears on the bill because the phone assumed
 * success is a diner waiting twenty minutes for food nobody is cooking.
 */
export function usePlaceOrder() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PlaceOrderCommand) => gateway.placeOrder(command),
    retry: false,
    // `networkMode` is not set here. It is the diner app's client-wide setting
    // — see `app/_layout.tsx` — because it is a property of *which app this is*
    // rather than of this one mutation, and a per-mutation override is how the
    // next ordering mutation quietly gets the library default instead.
    onSuccess: (_result, command) => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(command.tabId) });
      void queryClient.invalidateQueries({ queryKey: orderKeys.shares(command.tabId) });
    },
  });
}

export function useSetSettlementMode() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; mode: SettlementMode; clientCommandId: string }) =>
      gateway.setSettlementMode(input),
    retry: false,
    onSuccess: (tab: DinerTabView) => {
      queryClient.setQueryData(orderKeys.dinerTab(tab.tabId), tab);
      void queryClient.invalidateQueries({ queryKey: orderKeys.shares(tab.tabId) });
    },
    // A refused change reads the tab again: the lock is stamped on the server
    // by the very attempt that was refused, and the screen should show it.
    onError: (_error, input) => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(input.tabId) });
    },
  });
}

export interface TabLiveState {
  /** Markers for changes staff made, still fresh enough to be worth showing. */
  readonly markers: readonly ChangeMarker[];
  /** True only once a page of events has actually come back. */
  readonly connected: boolean;
  /** True when the backend has no event stream, so this is polling blind. */
  readonly unavailable: boolean;
}

/**
 * Subscribe to a tab's event sequence.
 *
 * Through `@yalla/realtime`, the same transport the staff tablet uses for the
 * floor — one implementation, so a waiter's screen and a diner's phone cannot
 * disagree about a bill. The events decide *whether* to refetch; the money
 * always comes from the server.
 *
 * **Seeded from the tab read.** `maxSequence` from every successful read moves
 * the stream to where the tab stands, so it reads events from there. It used
 * to start at zero and never move, so it never read an event at all — every
 * tick was a blind refetch and the header said "Up to date" regardless.
 */
export function useTabStream(
  tabId: string | undefined,
  enabled: boolean,
  maxSequence: number | undefined,
): TabLiveState {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  const [markers, setMarkers] = useState<readonly ChangeMarker[]>([]);
  const [connected, setConnected] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const feedRef = useRef<TabFeed | null>(null);

  useEffect(() => {
    if (!tabId || !enabled) return;

    /**
     * One refetch in flight, one queued. Both queries are invalidated together,
     * so "the refetch has landed" means the bill *and* the shares agree.
     */
    const refetch = createRefetchCoalescer(() =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(tabId) }),
        queryClient.invalidateQueries({ queryKey: orderKeys.shares(tabId) }),
      ]),
    );
    const landed = () => queryClient.getQueryState(orderKeys.dinerTab(tabId))?.status !== 'error';

    /** The name this device currently shows for a line, before it is refetched. */
    const nameLine = (lineId: string): string | null => {
      const tab = queryClient.getQueryData<DinerTabView | null>(orderKeys.dinerTab(tabId));
      const line =
        tab?.myLines.find((candidate) => candidate.id === lineId) ??
        tab?.tableLines?.find((candidate) => candidate.id === lineId);
      return line?.name ?? null;
    };

    const feed = createTabFeed({
      tabId,
      getTabEvents: (input) => gateway.getTabEvents(input),
      refetch: () => refetch.request().then(landed),
      nameLine,
      onMarkers: (next) => setMarkers((current) => [...current, ...next]),
      onConnected: setConnected,
      onUnavailable: () => setUnavailable(true),
      isUnavailable: isEndpointNotWired,
    });

    // Seed before the first poll from the read already in the cache, so the
    // first page continues from where the tab stands instead of replaying
    // its history — which used to flash old staff voids on every open.
    const cached = queryClient.getQueryData<DinerTabView | null>(orderKeys.dinerTab(tabId));
    if (cached) feed.seed(cached.maxSequence);

    feedRef.current = feed;
    feed.start();
    return () => {
      feed.stop();
      feedRef.current = null;
    };
  }, [tabId, enabled, gateway, queryClient]);

  // Every successful tab read — including the one after a gap — moves the
  // stream to where the tab now stands.
  useEffect(() => {
    if (maxSequence !== undefined) feedRef.current?.seed(maxSequence);
  }, [maxSequence]);

  // Markers age out by when they arrived here, rather than piling up.
  useEffect(() => {
    if (markers.length === 0) return;
    const timer = setInterval(() => {
      setMarkers((current) => {
        const live = liveMarkers(current, Date.now());
        return live.length === current.length ? current : live;
      });
    }, 2_000);
    return () => clearInterval(timer);
  }, [markers.length]);

  return { markers, connected, unavailable };
}
