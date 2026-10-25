import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BranchOverview, ConsoleBookingActionCommand } from '../contracts/branchOverview';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- Overview -------------------------------------------------------------------

/**
 * A branch's today: `GET /api/branches/{branchId}/overview`, read every 30
 * seconds like the approvals list beside it, while the tab is in front.
 */
export function useBranchOverview(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.branchOverview(branchId ?? ''),
    queryFn: () => gateway.getBranchOverview(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * One of the Overview row menu's actions on a booking.
 *
 * On success the row moves at once — the status the server answered is
 * written into the cached overview (for a release, the booking's own: a replay
 * says what it was released as the first time) — and the read is repeated on
 * settle either way: a 409 means
 * somebody else acted first (a waiter on the floor tablet), and the list on
 * screen is what is stale. The floor's own reads go stale with it.
 *
 * Never retried: a command id makes a repeat harmless on the server, but a
 * click that failed is the person's to repeat, after reading why.
 */
export function useBookingAction(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ConsoleBookingActionCommand) => gateway.actOnBooking(command),
    retry: false,
    onSuccess: (result) => {
      queryClient.setQueryData<BranchOverview>(
        queryKeys.branchOverview(branchId ?? ''),
        (overview) =>
          overview && {
            ...overview,
            todayBookings: overview.todayBookings.map((booking) =>
              booking.id === result.reservationId ? { ...booking, status: result.status } : booking,
            ),
          },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchOverview(branchId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
    },
  });
}
