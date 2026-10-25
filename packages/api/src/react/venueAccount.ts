import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangePlatformPasswordCommand } from '../contracts/platformHome';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews } from './consoleRefresh';

// --- My account (venue console) -------------------------------------------------

/**
 * The signed-in owner's, general manager's or branch manager's own account.
 * `enabled` is off for anyone else, whom the server refuses.
 */
export function useVenueProfile(enabled = true) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.venueProfile,
    queryFn: () => gateway.getVenueProfile(),
    enabled,
    staleTime: staleTime.reference,
  });
}

/** Renames them: the account is replaced in the cache, and the staff list that shows them refreshed. */
export function useUpdateVenueProfile() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullName: string }) => gateway.updateVenueProfile(input),
    retry: false,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.venueProfile, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(profile.venueId) });
      refreshPlatformViews(queryClient);
    },
  });
}

/**
 * Changes their password. Never retried: a second try would say the first
 * one's "wrong". The other sign-ins end, so the list of them is read again.
 */
export function useChangeVenuePassword() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ChangePlatformPasswordCommand) => gateway.changeVenuePassword(command),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venueSessions });
    },
  });
}

/** Where they are signed in: the sign-ins that can still renew, this one first. */
export function useVenueSessions(enabled = true) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.venueSessions,
    queryFn: () => gateway.listVenueSessions(),
    enabled,
    staleTime: staleTime.frequent,
  });
}

/** "Sign out everywhere else". Never retried; the list is read again however it ends. */
export function useSignOutOtherVenueSessions() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.signOutOtherVenueSessions(),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.venueSessions }),
  });
}
