import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BranchPublicProfileInput } from '../contracts/publicProfile';
import type { VenueListingInput } from '../contracts/listing';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews, refreshVenueViews } from './consoleRefresh';

// --- The public page --------------------------------------------------------------

export function usePublicProfile(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.publicProfile(branchId ?? ''),
    queryFn: () => gateway.getPublicProfile(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    // Explicit-save screen, like the hours: a refetch mid-edit would replace
    // a half-typed number with the server's copy and lose it without saying so.
    refetchOnWindowFocus: false,
  });
}

// --- The diner app listing ------------------------------------------------------

export function useBranchListing(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.branchListing(branchId ?? ''),
    queryFn: () => gateway.getBranchListing(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    // Explicit save: a refetch mid-edit would overwrite a half-written paragraph.
    refetchOnWindowFocus: false,
  });
}

export function useSaveBranchListing(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listing: VenueListingInput) =>
      gateway.updateBranchListing({ branchId: branchId!, listing }),
    retry: false,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.branchListing(branchId ?? ''), saved);
      // Cuisine and district are the list's and the venue page's lines; a
      // move is a feed line.
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
    },
  });
}

export function useSavePublicProfile(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: BranchPublicProfileInput) =>
      gateway.updatePublicProfile({ branchId: branchId!, profile }),
    retry: false,
    onSuccess: (saved) => {
      // The cover is the card's picture only: tables are pinned on room
      // photos, so a new cover moves no pin and the plan is not read again.
      queryClient.setQueryData(queryKeys.publicProfile(branchId ?? ''), saved);
      // The card's picture is also what the public page and the readiness
      // checklist read, through the managed venue.
      refreshVenueViews(queryClient);
      // "No photo" is a not-ready line on Home.
      refreshPlatformViews(queryClient);
      // The booking switch is a checklist line of its own.
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(branchId ?? '') });
    },
  });
}
