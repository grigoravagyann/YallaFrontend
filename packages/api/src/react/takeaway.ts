import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { APPROVAL_POLL_MS } from '../contracts/approvals';
import {
  isTakeawayActive,
  type AcceptTakeawayOrderCommand,
  type BranchTakeawayOrders,
  type CollectTakeawayOrderCommand,
  type DeclineTakeawayOrderCommand,
  type PlaceTakeawayOrderCommand,
  type StaffTakeawayOrder,
  type TakeawayOrder,
  type TakeawaySettings,
  type TakeawaySettingsInput,
} from '../contracts/takeaway';
import type { YallaGateway } from '../gateway';
import { staleTime } from '../queryClient';
import { queryKeys, useConsoleGateway, useGateway, useStaffGateway } from './index';

/**
 * Takeaway (2026-10-22): the hooks every surface uses, and what each mutation
 * does to the cache.
 *
 * Every mutation is online only and never retried: the guest's order carries
 * a `clientCommandId` that makes a *deliberate* retry safe, and the counter's
 * moves are idempotent by state (two tablets, one answer). Each one puts its
 * answer straight onto what is on screen and reads again everything that
 * shows the order — a 409 means the screen is what is stale.
 *
 * The cache work is in plain functions (`after…`) so it is tested on a real
 * `QueryClient` without rendering anything. The diner app's own hooks are
 * the same one line over the same options, through its own `useGateway`
 * (see `react/preOrders.ts` on why).
 */

// --- Polling -----------------------------------------------------------------

/** The status screen while the venue has not answered: the five-minute countdown is moving. */
export const TAKEAWAY_ORDER_SENT_POLL_MS = 10_000;
/** …while it is being prepared or waits at the counter. */
export const TAKEAWAY_ORDER_ACTIVE_POLL_MS = 20_000;
/** The checkout's slots move by the quarter hour and with the kitchen's load. */
export const TAKEAWAY_AVAILABILITY_POLL_MS = 60_000;
/**
 * The counter: as often as the awaiting bookings, and for the same reason —
 * an order nobody accepts is declined by itself five minutes after it lands.
 */
export const TAKEAWAY_COUNTER_POLL_MS = APPROVAL_POLL_MS;

/**
 * When to read the guest's order again: often while sent, less while it is
 * being prepared or ready, never once it is finished.
 */
export function takeawayOrderPollMs(order: TakeawayOrder | null | undefined): number | false {
  if (!order) return TAKEAWAY_ORDER_ACTIVE_POLL_MS;
  if (order.status === 'sent') return TAKEAWAY_ORDER_SENT_POLL_MS;
  return isTakeawayActive(order.status) ? TAKEAWAY_ORDER_ACTIVE_POLL_MS : false;
}

// --- What each mutation does to the cache ------------------------------------

/**
 * An order placed or cancelled by the guest: onto its status screen at once,
 * then the branch's availability (a slot or the kitchen's room changed) read
 * again. `onChanged` is the app's: it reads its own Orders tab again.
 */
export function afterTakeawayOrderChanged(queryClient: QueryClient, order: TakeawayOrder): void {
  queryClient.setQueryData(queryKeys.takeawayOrder(order.id), order);
  void queryClient.invalidateQueries({ queryKey: queryKeys.takeawayAvailability(order.branchId) });
}

/**
 * A move at the counter — `order` the answer, or `null` on a refusal. The card
 * replaces its old self in whichever column holds it, and the counter and the
 * kitchen queue (an accepted order is a ticket there) are read again.
 */
export function afterTakeawayAction(
  queryClient: QueryClient,
  branchId: string,
  order: StaffTakeawayOrder | null,
): void {
  if (order) {
    queryClient.setQueryData<BranchTakeawayOrders>(queryKeys.takeawayOrders(branchId), (counter) =>
      counter
        ? {
            ...counter,
            active: counter.active.map((item) => (item.id === order.id ? order : item)),
            finishedToday: counter.finishedToday.map((item) =>
              item.id === order.id ? order : item,
            ),
          }
        : counter,
    );
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.takeawayOrders(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
}

/** The console's save: the answer cached, and the place page's info read again. */
export function afterTakeawaySettingsSaved(
  queryClient: QueryClient,
  branchId: string,
  settings: TakeawaySettings,
): void {
  queryClient.setQueryData(queryKeys.takeawaySettings(branchId), settings);
  void queryClient.invalidateQueries({ queryKey: queryKeys.publicBranchDetail(branchId) });
}

// --- The diner app -------------------------------------------------------------

/**
 * Whether the branch takes takeaway now, and its slots — the checkout. Read
 * again every minute in the foreground (slots pass), and after every send.
 */
export function takeawayAvailabilityOptions(
  gateway: YallaGateway,
  branchId: string | null | undefined,
) {
  return {
    queryKey: queryKeys.takeawayAvailability(branchId ?? ''),
    queryFn: () => gateway.getTakeawayAvailability(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
    refetchInterval: TAKEAWAY_AVAILABILITY_POLL_MS,
    refetchIntervalInBackground: false,
  };
}

export function useTakeawayAvailability(branchId: string | null | undefined) {
  return useQuery(takeawayAvailabilityOptions(useGateway(), branchId));
}

/**
 * One order — the status screen. Polled while active, in the foreground only
 * ({@link takeawayOrderPollMs}); `null` for an unknown one or somebody else's.
 */
export function takeawayOrderOptions(gateway: YallaGateway, orderId: string | null | undefined) {
  return {
    queryKey: queryKeys.takeawayOrder(orderId ?? ''),
    queryFn: () => gateway.getTakeawayOrder(orderId!),
    enabled: Boolean(orderId),
    staleTime: staleTime.live,
    refetchInterval: (query: {
      readonly state: { readonly data: TakeawayOrder | null | undefined };
    }) => takeawayOrderPollMs(query.state.data),
    refetchIntervalInBackground: false,
  };
}

export function useTakeawayOrder(orderId: string | null | undefined) {
  return useQuery(takeawayOrderOptions(useGateway(), orderId));
}

/**
 * Send the order. Never retried; the same `clientCommandId` on a deliberate
 * retry answers the order the first try made. On a refusal the availability
 * is read again — a slot gone or the kitchen full is what it says.
 */
export function placeTakeawayOrderOptions(
  queryClient: QueryClient,
  gateway: YallaGateway,
  onChanged?: () => void,
) {
  return {
    mutationFn: (command: PlaceTakeawayOrderCommand) => gateway.placeTakeawayOrder(command),
    retry: false,
    onSuccess: (order: TakeawayOrder) => {
      afterTakeawayOrderChanged(queryClient, order);
      onChanged?.();
    },
    onError: (_error: unknown, command: PlaceTakeawayOrderCommand) =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.takeawayAvailability(command.branchId),
      }),
  };
}

export function usePlaceTakeawayOrder() {
  return useMutation(placeTakeawayOrderOptions(useQueryClient(), useGateway()));
}

/** Cancel while sent. On a refusal (the venue answered) the order is read again. */
export function cancelTakeawayOrderOptions(
  queryClient: QueryClient,
  gateway: YallaGateway,
  onChanged?: () => void,
) {
  return {
    mutationFn: (orderId: string) => gateway.cancelTakeawayOrder(orderId),
    retry: false,
    onSuccess: (order: TakeawayOrder) => {
      afterTakeawayOrderChanged(queryClient, order);
      onChanged?.();
    },
    onError: (_error: unknown, orderId: string) =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.takeawayOrder(orderId) }),
  };
}

export function useCancelTakeawayOrder() {
  return useMutation(cancelTakeawayOrderOptions(useQueryClient(), useGateway()));
}

// --- The floor tablet --------------------------------------------------------------

/**
 * The counter — the rail's "Takeaway · accept" cards, the Takeaway page's
 * three columns and the tab's badge (`sentCount + readyCount`). Polled every
 * ten seconds, **in the background too**: takeaway writes nothing to the
 * change stream, and an order nobody accepts runs out in five minutes.
 */
export function useTakeawayOrders(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.takeawayOrders(branchId ?? ''),
    queryFn: () => gateway.listTakeawayOrders(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: TAKEAWAY_COUNTER_POLL_MS,
    refetchIntervalInBackground: true,
  });
}

/**
 * A counter move's mutation options, apart from the hook so the network rule
 * is tested on a real `QueryClient`.
 */
export function takeawayActionOptions<C>(
  queryClient: QueryClient,
  branchId: string,
  act: (command: C) => Promise<StaffTakeawayOrder>,
) {
  return {
    mutationFn: act,
    retry: false,
    // Online only, never queued: an accept that went out as the wifi dropped
    // and landed minutes later would promise the guest a time nobody saw.
    networkMode: 'always' as const,
    onSuccess: (order: StaffTakeawayOrder) => afterTakeawayAction(queryClient, branchId, order),
    onError: () => afterTakeawayAction(queryClient, branchId, null),
  };
}

function useTakeawayAction<C>(
  branchId: string | undefined,
  act: (command: C) => Promise<StaffTakeawayOrder>,
) {
  const queryClient = useQueryClient();
  return useMutation(takeawayActionOptions(queryClient, branchId ?? '', act));
}

/** "Accept" with the stepper's ready time. Errors: `TakeawayStatusConflictError`, `ValidationError`. */
export function useAcceptTakeawayOrder(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useTakeawayAction(branchId, (command: AcceptTakeawayOrderCommand) =>
    gateway.acceptTakeawayOrder(command),
  );
}

/** "Decline", with the reason the guest is shown. */
export function useDeclineTakeawayOrder(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useTakeawayAction(branchId, (command: DeclineTakeawayOrderCommand) =>
    gateway.declineTakeawayOrder(command),
  );
}

/** "Ready" — the kitchen's or the floor's. Takes the order id. */
export function useMarkTakeawayOrderReady(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useTakeawayAction(branchId, (orderId: string) => gateway.markTakeawayOrderReady(orderId));
}

/** "Paid, handed over", cash or card. */
export function useCollectTakeawayOrder(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useTakeawayAction(branchId, (command: CollectTakeawayOrderCommand) =>
    gateway.collectTakeawayOrder(command),
  );
}

/** "No-show", from thirty minutes after ready. Takes the order id. */
export function useMarkTakeawayOrderNoShow(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useTakeawayAction(branchId, (orderId: string) => gateway.markTakeawayOrderNoShow(orderId));
}

// --- The console ------------------------------------------------------------------

/** The branch's takeaway settings. Reference data; read once per visit. */
export function useTakeawaySettings(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.takeawaySettings(branchId ?? ''),
    queryFn: () => gateway.getTakeawaySettings(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * Save all five. A 422 names each field out of bounds (`ValidationError`); on
 * any failure the settings are read again, so the card shows the server's.
 * The per-dish switch is `useUpdateMenuItem` with `{ availableForTakeaway }`.
 */
export function useSaveTakeawaySettings(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: TakeawaySettingsInput) =>
      gateway.saveTakeawaySettings({ branchId: branchId!, settings }),
    retry: false,
    onSuccess: (settings: TakeawaySettings) =>
      afterTakeawaySettingsSaved(queryClient, branchId ?? '', settings),
    onError: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.takeawaySettings(branchId ?? ''),
      }),
  });
}
