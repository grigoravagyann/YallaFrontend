import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ReservationPolicy,
  SpecialDay,
  SpecialDaysList,
  WeeklyHours,
} from '../contracts/branchSettings';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews, refreshVenueViews } from './consoleRefresh';

export function useOpeningHours(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.openingHours(branchId ?? ''),
    queryFn: () => gateway.getOpeningHours(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    // Explicit-save screen: a refetch mid-edit would replace a half-typed week
    // with the server's copy and lose it without saying so.
    refetchOnWindowFocus: false,
  });
}

export function useSaveOpeningHours(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (week: WeeklyHours) => gateway.replaceOpeningHours({ branchId: branchId!, week }),
    retry: false,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.openingHours(branchId ?? ''), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(branchId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchOverview(branchId ?? '') });
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

/**
 * The branch's special days from its service date on, with the list's
 * version: the one a save is sent against.
 */
export function useSpecialDays(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.specialDays(branchId ?? ''),
    queryFn: () => gateway.getSpecialDays(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * The whole list, replaced against the version it was read at. The answer —
 * the list and its new version — becomes the cached one at once, so the next
 * add or remove starts from it.
 */
export function useSaveSpecialDays(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedVersion: string; days: readonly SpecialDay[] }) =>
      gateway.replaceSpecialDays({ branchId: branchId!, ...input }),
    retry: false,
    onSuccess: (saved) => {
      queryClient.setQueryData<SpecialDaysList>(queryKeys.specialDays(branchId ?? ''), {
        version: saved.version,
        days: saved.days,
      });
      // Overview's hours pill and its service day follow a special day, and
      // so does every list that says "open now", like the weekly save.
      void queryClient.invalidateQueries({ queryKey: queryKeys.branchOverview(branchId ?? '') });
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

export function useReservationPolicy(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.reservationPolicy(branchId ?? ''),
    queryFn: () => gateway.getReservationPolicy(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * What the branch's policy ships with, and the server's bounds: the "Default"
 * and "Reset" beside every field. Not retried: a server that predates the
 * route answers 404, and the screen falls back to its own copy at once.
 */
export function useReservationPolicyDefaults(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.reservationPolicyDefaults(branchId ?? ''),
    queryFn: () => gateway.getReservationPolicyDefaults(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useSaveReservationPolicy(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policy: ReservationPolicy) =>
      gateway.replaceReservationPolicy({ branchId: branchId!, policy }),
    retry: false,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.reservationPolicy(branchId ?? ''), result.policy);
      // The floor and availability both read the turn time and the buffer.
      void queryClient.invalidateQueries({ queryKey: ['availability', branchId] });
      // Saving the form is what marks the policy reviewed on the checklist.
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(branchId ?? '') });
    },
  });
}
