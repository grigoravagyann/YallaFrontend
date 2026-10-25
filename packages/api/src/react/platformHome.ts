import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangePlatformPasswordCommand,
  PlatformActivityQuery,
} from '../contracts/platformHome';
import type { LiftBookingBlockCommand } from '../contracts/guestRecord';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- Home and Settings (platform admin) ------------------------------------------

/**
 * Home in one read. Refreshed whenever the screen comes back into view: it is
 * "the platform as it stands", and a minute-old answer says so on its face.
 */
export function usePlatformOverview() {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.platformOverview,
    queryFn: () => gateway.getPlatformOverview(),
    staleTime: staleTime.frequent,
    refetchOnWindowFocus: true,
  });
}

/** The messages given up on, read only when Home's "Details" is opened. */
export function useOutboxHealth(enabled: boolean) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.outboxHealth,
    queryFn: () => gateway.getOutboxHealth(),
    enabled,
    staleTime: staleTime.frequent,
  });
}

/** The newest audit rows, newest first. */
export function usePlatformActivity(query: PlatformActivityQuery = {}) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.platformActivity(query),
    queryFn: () => gateway.listPlatformActivity(query),
    staleTime: staleTime.frequent,
  });
}

/** Guests blocked from booking for no-shows, the blocks in force (platform admin). */
export function useBookingBlocks(enabled = true) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.bookingBlocks,
    queryFn: () => gateway.listBookingBlocks(),
    enabled,
    staleTime: staleTime.frequent,
  });
}

/**
 * Lift a block (platform admin), with a reason. Never retried: a lift is a
 * decision; the list and the activity feed are read again after it.
 */
export function useLiftBookingBlock() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: LiftBookingBlockCommand) => gateway.liftBookingBlock(command),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookingBlocks });
      void queryClient.invalidateQueries({ queryKey: ['console', 'platformActivity'] });
    },
  });
}

/** The signed-in platform admin's own name and email. */
export function usePlatformProfile(enabled = true) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.platformProfile,
    queryFn: () => gateway.getPlatformProfile(),
    enabled,
    staleTime: staleTime.reference,
  });
}

/** Renames the admin: the profile is replaced in the cache, and the feed refreshed. */
export function useUpdatePlatformProfile() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullName: string }) => gateway.updatePlatformProfile(input),
    retry: false,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.platformProfile, profile);
      void queryClient.invalidateQueries({ queryKey: ['console', 'platformActivity'] });
    },
  });
}

/** Changes the admin's password. Never retried: a second try would say the first one's "wrong". */
export function useChangePlatformPassword() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ChangePlatformPasswordCommand) => gateway.changePlatformPassword(command),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['console', 'platformActivity'] });
    },
  });
}
