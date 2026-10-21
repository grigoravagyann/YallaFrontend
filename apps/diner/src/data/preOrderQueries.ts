import {
  preOrderMenu,
  staleTime,
  type ClearPreOrderCommand,
  type OnMyWayResult,
  type PreOrderResult,
  type ReplacePreOrderCommand,
} from '@yalla/api';
import { afterOnMyWay, afterPreOrderSaved, queryKeys, useGateway } from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { bookingKeys } from './bookingKeys';

/**
 * Pre-orders on a booking (2026-10-21), as the app reaches them: through the
 * app's own `useGateway`, like every other query here, with the cache work the
 * API layer shares (`afterPreOrderSaved`, `afterOnMyWay`) — so the booking,
 * the list and the notification landing read the pre-order again together.
 *
 * Every mutation is online only and never retried: a deliberate retry reuses
 * its `clientCommandId` and the server answers the pre-order as it stands.
 */

/** A refusal means the screen is what is stale: read the booking again. */
function rereadBooking(queryClient: QueryClient, reservationId: string): void {
  void queryClient.invalidateQueries({ queryKey: bookingKeys.booking(reservationId) });
  void queryClient.invalidateQueries({ queryKey: bookingKeys.bookings });
  void queryClient.invalidateQueries({ queryKey: bookingKeys.reservationState(reservationId) });
}

/**
 * The dishes the picker offers: the diner menu narrowed to what may be
 * pre-ordered now. Shares the menu's cache entry; a short stale time, since a
 * dish selling out is what this screen must not miss.
 */
export function usePreOrderMenu(branchId: string | null | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.publicMenu(branchId ?? ''),
    queryFn: () => gateway.getBranchMenuDetail(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.frequent,
    select: (menu) => (menu ? preOrderMenu(menu) : null),
  });
}

/** Save the whole pre-order. Errors read with `preOrderFailure`. */
export function useReplacePreOrder() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ReplacePreOrderCommand) => gateway.replacePreOrder(command),
    retry: false,
    onSuccess: (result: PreOrderResult) => afterPreOrderSaved(queryClient, result),
    onError: (_error, command) => rereadBooking(queryClient, command.reservationId),
  });
}

/** Remove it. */
export function useClearPreOrder() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ClearPreOrderCommand) => gateway.clearPreOrder(command),
    retry: false,
    onSuccess: (result: PreOrderResult) => afterPreOrderSaved(queryClient, result),
    onError: (_error, command) => rereadBooking(queryClient, command.reservationId),
  });
}

/** "Yes, I'm on my way": the waiter's card says so, and the feed row has been answered. */
export function useConfirmOnMyWay() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reservationId: string) => gateway.confirmOnMyWay(reservationId),
    retry: false,
    onSuccess: (result: OnMyWayResult) => {
      afterOnMyWay(queryClient, result);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (_error, reservationId) => rereadBooking(queryClient, reservationId),
  });
}
