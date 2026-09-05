import {
  isEndpointNotWired,
  staleTime,
  type DinerTabView,
  type PlaceOrderCommand,
  type SettlementMode,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { createSequenceStream, type LiveStream } from '@yalla/realtime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { applyTabEvents, liveMarkers, type ChangeMarker } from '../tab/events';

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
};

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

export function useDinerTab(tabId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: orderKeys.dinerTab(tabId ?? ''),
    queryFn: () => gateway.getDinerTab(tabId!),
    enabled: Boolean(tabId),
    staleTime: staleTime.live,
  });
}

export function useTabShares(tabId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: orderKeys.shares(tabId ?? ''),
    queryFn: () => gateway.getTabShares(tabId!),
    enabled: Boolean(tabId),
    staleTime: staleTime.live,
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
    // Attempt it even when the browser says there is no network, so the request
    // fails and the screen can say the order was not placed. The default is to
    // *pause* an offline mutation, which here would leave the button spinning
    // for ever and the diner believing food is on the way. This is the opposite
    // of the staff app's rule, and deliberately: a waiter is standing in the
    // room and can reconcile a late order, a diner on a phone cannot.
    networkMode: 'always',
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
  });
}

export interface TabLiveState {
  /** Markers for changes staff made, still fresh enough to be worth showing. */
  readonly markers: readonly ChangeMarker[];
  /** False when the stream has never managed a round trip. */
  readonly connected: boolean;
  /** True when the backend has no event stream, so this is polling blind. */
  readonly unavailable: boolean;
}

/**
 * Subscribe to a tab's event sequence.
 *
 * Through `@yalla/realtime`, the same transport the staff tablet uses for the
 * floor — one implementation, so a waiter's screen and a diner's phone cannot
 * disagree about a bill. When the hub lands it replaces that implementation and
 * nothing here changes.
 *
 * The events decide *whether* to refetch; the money always comes from the
 * server. Reconstructing a bill from event payloads would be a second
 * implementation of the billing arithmetic.
 */
export function useTabStream(tabId: string | undefined, enabled: boolean): TabLiveState {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  const [markers, setMarkers] = useState<readonly ChangeMarker[]>([]);
  const [connected, setConnected] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const cursor = useRef(0);
  const streamRef = useRef<LiveStream | null>(null);

  useEffect(() => {
    if (!tabId || !enabled) return;

    const stream = createSequenceStream({
      fetchPage: async (afterSequence) => {
        const page = await gateway.getTabEvents({ tabId, afterSequence });
        return { lastSequence: page.lastSequence, items: page.events };
      },
      handlers: {
        onItems: (events) => {
          setConnected(true);
          const update = applyTabEvents(cursor.current, events);
          cursor.current = update.lastSequence;
          if (update.kind !== 'refetch') return;
          if (update.markers.length > 0) {
            setMarkers((current) => [...current, ...update.markers]);
          }
          void queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(tabId) });
          void queryClient.invalidateQueries({ queryKey: orderKeys.shares(tabId) });
        },
        onResync: (reason) => {
          if (reason === 'notWired') {
            setUnavailable(true);
            return;
          }
          setConnected(true);
          void queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(tabId) });
        },
        onError: () => setConnected(false),
      },
      isUnavailable: isEndpointNotWired,
      foregroundMs: 3_000,
    });

    streamRef.current = stream;
    stream.start();
    return () => {
      stream.stop();
      streamRef.current = null;
    };
  }, [tabId, enabled, gateway, queryClient]);

  // Seed the cursor from whatever the tab itself reports, so the first page
  // continues from the right place rather than replaying the tab's history.
  const tab = queryClient.getQueryData<DinerTabView | null>(orderKeys.dinerTab(tabId ?? ''));
  useEffect(() => {
    if (tab && cursor.current === 0) {
      cursor.current = tab.lastSequence;
      streamRef.current?.setSequence(tab.lastSequence);
    }
  }, [tab]);

  // Markers age out rather than piling up. A change nobody read within a few
  // seconds is not worth keeping on a bill somebody is trying to check.
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
