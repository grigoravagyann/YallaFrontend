import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateStaffInput, UpdateStaffInput } from '../contracts/staff';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews } from './consoleRefresh';

// --- Staff and devices ---------------------------------------------------------

/**
 * Everyone who works for the venue, active and not.
 *
 * Reference data rather than live state: a staff list changes when somebody
 * hires or fires, which is not something to poll for. Deactivated people stay
 * in it — a waiter who left in March and comes back in June is a reactivation,
 * and their audit history has to stay attached to one person.
 */
export function useStaff(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.staff(venueId ?? ''),
    queryFn: () => gateway.listStaff(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.reference,
  });
}

export function useCreateStaff(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (staff: CreateStaffInput) => gateway.createStaff({ venueId: venueId!, staff }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(venueId ?? '') });
      // A new person may be the line the readiness checklist was waiting for.
      void queryClient.invalidateQueries({ queryKey: ['console', 'readiness'] });
      // "Added Mariam as branch manager" is a feed line.
      refreshPlatformViews(queryClient);
    },
  });
}

export function useUpdateStaff(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { staffMemberId: string; patch: UpdateStaffInput }) =>
      gateway.updateStaff({ venueId: venueId!, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(venueId ?? '') });
      // Moving somebody drops their shifts at the branches they left, and
      // deactivating hides theirs: every branch's shift reads, by prefix.
      void queryClient.invalidateQueries({ queryKey: ['console', 'shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['console', 'readiness'] });
      refreshPlatformViews(queryClient);
    },
  });
}

/**
 * Set or reset a PIN.
 *
 * The result is **not** written into any cache. The mutation returns the staff
 * member, and the PIN the caller sent is theirs to show once and then drop —
 * putting either in a query cache would leave a credential sitting in memory
 * for every screen that reads that key.
 */
export function useSetStaffPin(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { staffMemberId: string; pin: string }) =>
      gateway.setStaffPin({ venueId: venueId!, ...input }),
    onSuccess: () => {
      // Only the list, which carries the lockout flag. Never the PIN.
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(venueId ?? '') });
    },
  });
}

/**
 * Give a manager or owner their admin-panel sign-in.
 *
 * The result carries the one copy of a live sign-in link, so nothing here
 * writes it anywhere: the mutation hands it to the caller, who shows it once
 * and drops it. Only the staff list is invalidated, because it carries the
 * address and the "awaiting password" state that a fresh issue changes.
 *
 * One thing this hook cannot avoid: TanStack keeps a mutation's result as
 * its `data`, and in the mutation cache, until the mutation is reset and
 * collected. So the cache keeps it for no time at all (`gcTime: 0`), and
 * callers `reset()` as soon as their own state holds the link — after which
 * the dialog's copy is the only one anywhere.
 */
export function useIssueStaffSignIn(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { staffMemberId: string; email: string }) =>
      gateway.issueStaffSignIn({ venueId: venueId!, ...input }),
    gcTime: 0,
    onSuccess: () => {
      // The list, never the link. A sign-in issued is a feed line.
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(venueId ?? '') });
      refreshPlatformViews(queryClient);
    },
  });
}

/** The one people use mid-rush. */
export function useClearPinLockout(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; staffMemberId: string }) =>
      gateway.clearPinLockout(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(venueId ?? '') });
    },
  });
}
