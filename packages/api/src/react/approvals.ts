import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConsoleGateway } from '../consoleGateway';
import type { ConsoleBooking, DecideReservationCommand } from '../contracts/approvals';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- Bookings waiting for approval ------------------------------------------

/**
 * The branch's pending bookings. Short-lived: a booking waits for a person,
 * and the person is usually looking at this list because somebody just booked.
 *
 * Read again every thirty seconds while open: a short-notice booking leaves
 * the list by itself when its window closes, and a panel that kept showing it
 * would offer a decision the server will refuse.
 */
export function usePendingReservations(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.pendingReservations(branchId ?? ''),
    queryFn: () => gateway.listPendingReservations(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Both decisions invalidate the list on *settle*, not only on success. A 409
 * means somebody else decided first, and the list this person is looking at
 * is what is stale — refreshing it is the useful half of the refusal.
 */
function useDecideReservation(
  branchId: string | undefined,
  decide: (gateway: ConsoleGateway, command: DecideReservationCommand) => Promise<ConsoleBooking>,
) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: DecideReservationCommand) => decide(gateway, command),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pendingReservations(branchId ?? ''),
      });
      // An approved booking joins today's list as confirmed; a declined one leaves it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchOverview(branchId ?? '') });
    },
  });
}

export function useApproveReservation(branchId: string | undefined) {
  return useDecideReservation(branchId, (gateway, command) => gateway.approveReservation(command));
}

export function useRejectReservation(branchId: string | undefined) {
  return useDecideReservation(branchId, (gateway, command) => gateway.rejectReservation(command));
}
