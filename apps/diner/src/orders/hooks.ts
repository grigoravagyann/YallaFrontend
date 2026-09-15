import { staleTime } from '@yalla/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../stores/session';
import { dinerOrderKeys } from './keys';
import { ACTIVE_WINDOW_MS, isActiveStatus, type Order } from './model';
import { orderRepository } from './repository';

/** The Orders tab's only way to an order. See `places/hooks.ts` for the pattern. */

export { dinerOrderKeys };

/** How often an order the kitchen still owes is read again while the app is open. */
export const ORDER_REFRESH_MS = 15_000;

/**
 * `ORDER_REFRESH_MS` while any of these orders is still moving — confirmed,
 * preparing or ready, and placed within the active window — otherwise no
 * polling at all.
 *
 * The interval runs only while the app is in the foreground: TanStack Query's
 * focus manager is driven by `AppState` (`lib/queryManagers.ts`) and a
 * `refetchInterval` does not fire in the background, so a phone in a pocket
 * does not keep asking. A push about the order refreshes it sooner.
 */
export function refreshWhileActive(
  orders: readonly Order[] | Order | null | undefined,
  now: Date = new Date(),
): number | false {
  if (!orders) return false;
  const list: readonly Order[] = Array.isArray(orders) ? orders : [orders as Order];
  const moving = list.some(
    (order) =>
      isActiveStatus(order.status) &&
      now.getTime() - new Date(order.placedAt).getTime() < ACTIVE_WINDOW_MS,
  );
  return moving ? ORDER_REFRESH_MS : false;
}

/**
 * This diner's orders. Only asked for while signed in: the endpoint answers a
 * diner session and nothing else, and with none the screen offers a way in.
 */
export function useOrders() {
  const signedIn = useSession((state) => state.signedIn);
  return useQuery({
    queryKey: dinerOrderKeys.list(),
    queryFn: () => orderRepository.list(),
    enabled: signedIn,
    staleTime: staleTime.frequent,
    refetchInterval: (query) => refreshWhileActive(query.state.data),
  });
}

/** `null` data means the id is unknown — render the not-found state. */
export function useOrder(orderId: string | undefined) {
  const signedIn = useSession((state) => state.signedIn);
  return useQuery({
    queryKey: dinerOrderKeys.detail(orderId ?? ''),
    queryFn: () => orderRepository.getById(orderId!),
    enabled: Boolean(orderId) && signedIn,
    staleTime: staleTime.frequent,
    refetchInterval: (query) => refreshWhileActive(query.state.data),
  });
}

/**
 * Cancel an order. No automatic retry (the shared client default): the UI has
 * to show what happened before anyone taps again.
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => orderRepository.cancel(orderId),
    onSuccess: (order: Order) => {
      queryClient.setQueryData(dinerOrderKeys.detail(order.id), order);
      void queryClient.invalidateQueries({ queryKey: dinerOrderKeys.list() });
    },
  });
}
