import {
  clearPreOrderOptions,
  confirmOnMyWayOptions,
  preOrderMenuOptions,
  replacePreOrderOptions,
  reportRunningLateOptions,
  useGateway,
} from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NOTIFICATIONS_KEY } from './notifications';

/**
 * Pre-orders on a booking (2026-10-21), as the app reaches them.
 *
 * Why the app has these at all, and not `@yalla/api/react`'s hooks of the same
 * names: those reach the gateway through that module's own `useGateway`, which
 * the screen tests cannot replace (they mock the module's exported one, as
 * every other screen test here does). These are the same one line each over
 * the **same** options (`preOrderMenuOptions`, `replacePreOrderOptions`,
 * `clearPreOrderOptions`, `confirmOnMyWayOptions`), through the app's
 * `useGateway` — one definition of each query, mutation and its cache work, so
 * the two cannot drift.
 *
 * The one thing the app adds: "Yes, I'm on my way" also reads the
 * notifications feed again, whose row has now been answered.
 */

/** The dishes the picker offers: the diner menu narrowed to what may be pre-ordered now. */
export function usePreOrderMenu(branchId: string | null | undefined) {
  return useQuery(preOrderMenuOptions(useGateway(), branchId));
}

/** Save the whole pre-order. Errors read with `preOrderFailure`. */
export function useReplacePreOrder() {
  return useMutation(replacePreOrderOptions(useQueryClient(), useGateway()));
}

/** Remove it. */
export function useClearPreOrder() {
  return useMutation(clearPreOrderOptions(useQueryClient(), useGateway()));
}

/** "Yes, I'm on my way": the waiter's card says so, and the feed row has been answered. */
export function useConfirmOnMyWay() {
  const queryClient = useQueryClient();
  return useMutation(
    confirmOnMyWayOptions(queryClient, useGateway(), () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }),
  );
}

/**
 * "I'm running late" — 10, 15 or 30 minutes (2026-10-22): the waiter's card
 * says so, and the feed's "are you coming?" row has been answered.
 */
export function useReportRunningLate() {
  const queryClient = useQueryClient();
  return useMutation(
    reportRunningLateOptions(queryClient, useGateway(), () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }),
  );
}
