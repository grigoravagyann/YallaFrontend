import type { ConsoleVenueDetail, CreateVenueCommand, ListVenuesQuery } from '@yalla/api';
import { staleTime } from '@yalla/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDevRole } from '../auth/session';
import { consoleGatewayFor, dinerGateway } from './gateway';

/** Query keys in one place, so an invalidation cannot miss a cache entry. */
export const keys = {
  currentUser: (role: string) => ['currentUser', role] as const,
  venues: (query: ListVenuesQuery) => ['console', 'venues', query] as const,
  venue: (venueId: string) => ['console', 'venue', venueId] as const,
  floor: (branchId: string) => ['floor', branchId] as const,
};

/**
 * The gateway for the current session.
 *
 * Reads the dev role so that switching it re-resolves the mock; against a real
 * backend the argument is dropped and this is a constant.
 */
function useConsoleGateway() {
  return consoleGatewayFor(useDevRole((state) => state.role));
}

export function useConsoleVenues(query: ListVenuesQuery) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: keys.venues(query),
    queryFn: () => gateway.listVenues(query),
    staleTime: staleTime.frequent,
    // Keeps the previous page on screen while the next one loads, so paging
    // does not blank the table under the cursor.
    placeholderData: (previous) => previous,
  });
}

export function useConsoleVenue(venueId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: keys.venue(venueId ?? ''),
    queryFn: () => gateway.getVenue(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.frequent,
  });
}

/**
 * Every venue command returns the whole refreshed venue, so they all cache the
 * same way: replace it, never patch it. A locally patched row is how a console
 * ends up showing a suspension the server did not apply.
 */
function useVenueCommand<TInput>(run: (input: TInput) => Promise<ConsoleVenueDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (venue: ConsoleVenueDetail) => {
      queryClient.setQueryData(keys.venue(venue.id), venue);
      void queryClient.invalidateQueries({ queryKey: ['console', 'venues'] });
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

/**
 * The branch floor, for the staff screen.
 *
 * Deliberately the diner-side gateway: it is the same floor, the same read
 * model and the same renderer. A second source of truth for where the tables
 * are is how a diner and a waiter end up disagreeing about table 7.
 */
export function useFloorPlan(branchId: string | undefined) {
  return useQuery({
    queryKey: keys.floor(branchId ?? ''),
    queryFn: () => dinerGateway.getFloorPlan(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}
