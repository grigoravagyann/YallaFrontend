import {
  cancelTakeawayOrderOptions,
  placeTakeawayOrderOptions,
  takeawayAvailabilityOptions,
  takeawayOrderOptions,
  useGateway,
} from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dinerOrderKeys } from '../orders/keys';
import { useSession } from '../stores/session';

/**
 * Takeaway (2026-10-22), as the app reaches it.
 *
 * The same one line each over `@yalla/api/react`'s options — one definition
 * of each query, mutation and its cache work — through the app's own
 * `useGateway`, which the screen tests replace (see `data/preOrderQueries.ts`
 * on why). What the app adds: an order placed or cancelled reads the Orders
 * tab again.
 *
 * The diner's takeaway endpoints answer a signed-in diner only, so both reads
 * wait for a session.
 */

/** Whether the branch takes takeaway now, its pickup slots and the kitchen's load. */
export function useTakeawayAvailability(branchId: string | null | undefined) {
  const signedIn = useSession((state) => state.signedIn);
  const options = takeawayAvailabilityOptions(useGateway(), branchId);
  return useQuery({ ...options, enabled: options.enabled && signedIn });
}

/** One order — the status screen. Polled while it moves, in the foreground only. */
export function useTakeawayOrder(orderId: string | null | undefined) {
  const signedIn = useSession((state) => state.signedIn);
  const options = takeawayOrderOptions(useGateway(), orderId);
  return useQuery({ ...options, enabled: options.enabled && signedIn });
}

function useReadOrdersAgain() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: dinerOrderKeys.all });
}

/** Send the cart. Errors read with `takeawayFailure`. */
export function usePlaceTakeawayOrder() {
  const changed = useReadOrdersAgain();
  return useMutation(placeTakeawayOrderOptions(useQueryClient(), useGateway(), changed));
}

/** Cancel while the venue has not answered. */
export function useCancelTakeawayOrder() {
  const changed = useReadOrdersAgain();
  return useMutation(cancelTakeawayOrderOptions(useQueryClient(), useGateway(), changed));
}
