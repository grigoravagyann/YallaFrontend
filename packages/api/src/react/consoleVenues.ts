import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddBranchCommand,
  BookingSummaryDays,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  UpdateVenueCommand,
} from '../contracts/console';
import type { BranchFeature } from '../contracts/branchFeatures';
import { listAllConsoleVenues } from '../platformVenues';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews } from './consoleRefresh';

// --- Console -------------------------------------------------------------------

export function useConsoleVenues(query: ListVenuesQuery) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.consoleVenues(query),
    queryFn: () => gateway.listVenues(query),
    staleTime: staleTime.reference,
    // Keeps the previous page on screen while the next one loads, so paging
    // does not blank the table under the cursor.
    placeholderData: (previous) => previous,
  });
}

export function useConsoleVenue(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.consoleVenue(venueId ?? ''),
    queryFn: () => gateway.getVenue(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.reference,
  });
}

/**
 * The venue the signed-in person manages, with the branches their staff row
 * covers. The one read the venue section learns its branches from; the
 * platform admin's `useConsoleVenue` is a different route with a different
 * guard, and a venue user calling it gets a 403.
 */
export function useManagedVenue(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.managedVenue(venueId ?? ''),
    queryFn: () => gateway.getManagedVenue(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.reference,
  });
}

/**
 * Every venue command returns the whole refreshed venue, so they all cache the
 * same way: replace it, never patch it. Retry is off (the shared default) —
 * a retried command is a second command, and the `commandId` exists so a
 * *deliberate* retry is safe rather than so an automatic one is silent.
 */
function useVenueCommand<TInput>(run: (input: TInput) => Promise<ConsoleVenueDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (venue: ConsoleVenueDetail) => {
      queryClient.setQueryData(queryKeys.consoleVenue(venue.id), venue);
      void queryClient.invalidateQueries({ queryKey: ['console', 'venues'] });
      // The venue section's own read carries the name and the branch list
      // too, and a renamed venue or a new branch must reach it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.managedVenue(venue.id) });
      refreshPlatformViews(queryClient);
    },
  });
}

export function useSuspendVenue() {
  const gateway = useConsoleGateway();
  return useVenueCommand((input: { venueId: string; commandId: string }) =>
    gateway.suspendVenue(input),
  );
}

export function useResumeVenue() {
  const gateway = useConsoleGateway();
  return useVenueCommand((input: { venueId: string; commandId: string }) =>
    gateway.resumeVenue(input),
  );
}

export function useDeleteVenue() {
  const gateway = useConsoleGateway();
  return useVenueCommand((input: { venueId: string; commandId: string }) =>
    gateway.deleteVenue(input),
  );
}

export function useCreateVenue() {
  const gateway = useConsoleGateway();
  return useVenueCommand((command: CreateVenueCommand) => gateway.createVenue(command));
}

/** Platform admin only: name, web address and type. */
export function useUpdateVenue() {
  const gateway = useConsoleGateway();
  return useVenueCommand((command: UpdateVenueCommand) => gateway.updateVenue(command));
}

/** Platform admin only. Answers with the whole venue, new branch included. */
export function useAddBranch() {
  const gateway = useConsoleGateway();
  return useVenueCommand((command: AddBranchCommand) => gateway.addBranch(command));
}

/**
 * The features the platform allows at one branch. Platform admin only.
 * Answers with the whole venue, so the cache is replaced like the others.
 */
export function useSetBranchFeatures() {
  const gateway = useConsoleGateway();
  return useVenueCommand(
    (input: { branchId: string; features: readonly BranchFeature[]; commandId: string }) =>
      gateway.setBranchFeatures(input),
  );
}

/** One set for every branch of a venue, all or nothing. Platform admin only. */
export function useApplyVenueFeatures() {
  const gateway = useConsoleGateway();
  return useVenueCommand(
    (input: { venueId: string; features: readonly BranchFeature[]; commandId: string }) =>
      gateway.applyVenueFeatures(input),
  );
}

/**
 * Every venue on the platform, deleted ones included — the redesigned venues
 * list, which searches, filters and sorts in place and counts what it hides.
 * See `listAllConsoleVenues`.
 */
export function useAllConsoleVenues() {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.allConsoleVenues,
    queryFn: () => listAllConsoleVenues(gateway),
    staleTime: staleTime.reference,
  });
}

/**
 * A venue's bookings over the last 7 or 30 days, aggregates only — the venue
 * page's Bookings tab. Platform admin only.
 */
export function useVenueBookingsSummary(venueId: string | undefined, days: BookingSummaryDays) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.venueBookingsSummary(venueId ?? '', days),
    queryFn: () => gateway.getVenueBookingsSummary({ venueId: venueId!, days }),
    enabled: Boolean(venueId),
    staleTime: staleTime.frequent,
    // A switch from 30 days to 7 keeps the month on screen until the week
    // arrives — for the same venue only: another venue's numbers are not these.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === venueId ? previous : undefined,
  });
}

/**
 * Every branch's readiness at once, for the venue page's checklist. One
 * query per branch under the same key `useBranchReadiness` uses, so the two
 * share their answers.
 */
export function useBranchesReadiness(branchIds: readonly string[]) {
  const gateway = useConsoleGateway();
  return useQueries({
    queries: branchIds.map((branchId) => ({
      queryKey: queryKeys.readiness(branchId),
      queryFn: () => gateway.getBranchReadiness(branchId),
      staleTime: staleTime.live,
    })),
  });
}

/** Undo a soft delete. Platform admin only; caches like every venue command. */
export function useRestoreVenue() {
  const gateway = useConsoleGateway();
  return useVenueCommand((input: { venueId: string; commandId: string }) =>
    gateway.restoreVenue(input),
  );
}
