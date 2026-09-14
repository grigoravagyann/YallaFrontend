import { staleTime } from '@yalla/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../stores/session';
import type { Order } from './model';
import { orderRepository } from './repository';

/** The Orders tab's only way to an order. See `places/hooks.ts` for the pattern. */

/** Named apart from `data/orderQueries.ts`'s `orderKeys`, which are the tab's kitchen orders. */
export const dinerOrderKeys = {
  all: ['dinerOrders'] as const,
  list: () => ['dinerOrders', 'list'] as const,
  detail: (orderId: string) => ['dinerOrders', 'detail', orderId] as const,
};

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
