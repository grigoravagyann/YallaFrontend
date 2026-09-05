import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { ConsoleGateway } from '../consoleGateway';
import type { ConsoleVenueDetail, CreateVenueCommand, ListVenuesQuery } from '../contracts/console';
import type { YallaGateway } from '../gateway';
import { staleTime } from '../queryClient';

/**
 * TanStack Query hooks per endpoint group, shared by both apps.
 *
 * The gateway arrives through context rather than an import so the same hook
 * runs against the mock in one app and the real client in another, and so a
 * test can hand it a fake. Query keys are exported so an invalidation can never
 * miss a cache entry.
 *
 * No JSX here on purpose: this package stays a plain TypeScript library and the
 * provider is a `createElement` call.
 */

export { describeFailure } from '../errors';
export type { FailureKind } from '../errors';

/**
 * True when a query is not running because the browser is offline.
 *
 * TanStack Query does not *fail* a query it cannot send: it **pauses** it. So
 * `isError` stays false, `isLoading` stays true on a first load, and a screen
 * that only watches for a thrown error shows a spinner that never resolves —
 * or, worse, keeps showing yesterday's rows with no hint they are stale.
 *
 * Every screen therefore checks this alongside `isError`. It is a plain
 * function of `fetchStatus` rather than a hook so the same rule can be applied
 * to a query, tested on its own, and read at a glance.
 */
export function isOfflinePaused(query: { readonly fetchStatus: string }): boolean {
  return query.fetchStatus === 'paused';
}

interface Gateways {
  readonly gateway: YallaGateway | null;
  readonly consoleGateway: ConsoleGateway | null;
}

const GatewayContext = createContext<Gateways>({ gateway: null, consoleGateway: null });

export interface GatewayProviderProps {
  readonly gateway?: YallaGateway | undefined;
  readonly consoleGateway?: ConsoleGateway | undefined;
  readonly children: ReactNode;
}

export function GatewayProvider({ gateway, consoleGateway, children }: GatewayProviderProps) {
  return createElement(
    GatewayContext.Provider,
    { value: { gateway: gateway ?? null, consoleGateway: consoleGateway ?? null } },
    children,
  );
}

export function useGateway(): YallaGateway {
  const { gateway } = useContext(GatewayContext);
  if (!gateway) throw new Error('useGateway: wrap the tree in <GatewayProvider gateway={…}>.');
  return gateway;
}

export function useConsoleGateway(): ConsoleGateway {
  const { consoleGateway } = useContext(GatewayContext);
  if (!consoleGateway) {
    throw new Error('useConsoleGateway: wrap the tree in <GatewayProvider consoleGateway={…}>.');
  }
  return consoleGateway;
}

// --- Keys -------------------------------------------------------------------

export const queryKeys = {
  venues: ['venues'] as const,
  venue: (venueId: string) => ['venue', venueId] as const,
  floor: (branchId: string) => ['floor', branchId] as const,
  availability: (branchId: string, slotUtc: string, partySize: number) =>
    ['availability', branchId, slotUtc, partySize] as const,
  consoleVenues: (query: ListVenuesQuery) => ['console', 'venues', query] as const,
  consoleVenue: (venueId: string) => ['console', 'venue', venueId] as const,
};

// --- Diner: browse ------------------------------------------------------------

/** Venue lists change when an owner edits them: reference data, cached for minutes. */
export function useVenues() {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.venues,
    queryFn: () => gateway.listVenues(),
    staleTime: staleTime.reference,
  });
}

export function useVenue(venueId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.venue(venueId ?? ''),
    queryFn: () => gateway.getVenue(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.reference,
  });
}

// --- Floor ---------------------------------------------------------------------

/** Live table state: stale almost immediately. */
export function useFloorPlan(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.floor(branchId ?? ''),
    queryFn: () => gateway.getFloorPlan(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

export function useTableAvailability(input: {
  readonly branchId: string | undefined;
  readonly slotUtc: string;
  readonly partySize: number;
  /** The branch's IANA zone; the backend asks in wall-clock terms. */
  readonly timeZoneId?: string | undefined;
}) {
  const gateway = useGateway();
  const { branchId, slotUtc, partySize, timeZoneId } = input;
  return useQuery({
    queryKey: queryKeys.availability(branchId ?? '', slotUtc, partySize),
    queryFn: () =>
      gateway.getTableAvailability({ branchId: branchId!, slotUtc, partySize, timeZoneId }),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

/**
 * Invalidate the floor (and any availability) for a branch. Every table-state
 * mutation calls this in its `onSuccess`, and so must the offline queue when a
 * replayed action lands.
 */
export function useInvalidateFloor() {
  const queryClient = useQueryClient();
  return (branchId: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.floor(branchId) });
    void queryClient.invalidateQueries({ queryKey: ['availability', branchId] });
  };
}

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
