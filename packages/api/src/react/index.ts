import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { ConsoleGateway } from '../consoleGateway';
import type { ConsoleVenueDetail, CreateVenueCommand, ListVenuesQuery } from '../contracts/console';
import type { ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import type {
  AbandonTabCommand,
  CompCommand,
  RecordCashPaymentCommand,
  VoidLineCommand,
} from '../contracts/unshipped';
import type { YallaGateway } from '../gateway';
import type { StaffGateway } from '../staffGateway';
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
  readonly staffGateway: StaffGateway | null;
}

const GatewayContext = createContext<Gateways>({
  gateway: null,
  consoleGateway: null,
  staffGateway: null,
});

export interface GatewayProviderProps {
  readonly gateway?: YallaGateway | undefined;
  readonly consoleGateway?: ConsoleGateway | undefined;
  readonly staffGateway?: StaffGateway | undefined;
  readonly children: ReactNode;
}

export function GatewayProvider({
  gateway,
  consoleGateway,
  staffGateway,
  children,
}: GatewayProviderProps) {
  return createElement(
    GatewayContext.Provider,
    {
      value: {
        gateway: gateway ?? null,
        consoleGateway: consoleGateway ?? null,
        staffGateway: staffGateway ?? null,
      },
    },
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

export function useStaffGateway(): StaffGateway {
  const { staffGateway } = useContext(GatewayContext);
  if (!staffGateway) {
    throw new Error('useStaffGateway: wrap the tree in <GatewayProvider staffGateway={…}>.');
  }
  return staffGateway;
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
  editorFloorPlan: (branchId: string) => ['console', 'floorPlan', branchId] as const,
  staffFloor: (branchId: string) => ['staff', 'floor', branchId] as const,
  staffTab: (tabId: string) => ['staff', 'tab', tabId] as const,
  orderQueue: (branchId: string) => ['staff', 'orders', branchId] as const,
  serviceRequests: (branchId: string) => ['staff', 'serviceRequests', branchId] as const,
  staffMenu: (branchId: string) => ['staff', 'menu', branchId] as const,
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

// --- The floor plan editor -----------------------------------------------------

/**
 * The stored plan the editor works on.
 *
 * Reference data, not live state: this is furniture, and it changes when
 * somebody edits it. Refetching on window focus would silently replace a
 * half-drawn room with the server's copy, so it does not.
 */
export function useEditorFloorPlan(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.editorFloorPlan(branchId ?? ''),
    queryFn: () => gateway.getFloorPlan(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * Replace the whole plan atomically.
 *
 * Retry is off, as for every mutation here. This one is not idempotent in any
 * useful sense — a retry after a timeout would replace the room with whatever
 * the editor held at the moment of the first attempt, which may no longer be
 * what is on screen.
 */
export function useSaveFloorPlan() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; command: ReplaceFloorPlanCommand }) =>
      gateway.replaceFloorPlan(input),
    onSuccess: (result, input) => {
      queryClient.setQueryData(queryKeys.editorFloorPlan(input.branchId), result.plan);
      // The room the diner and the staff screens draw has just changed shape.
      void queryClient.invalidateQueries({ queryKey: queryKeys.floor(input.branchId) });
      void queryClient.invalidateQueries({ queryKey: ['availability', input.branchId] });
    },
  });
}

export function useRegenerateTableQr() {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (input: { tableId: string }) => gateway.regenerateTableQr(input),
  });
}

// --- The counter screen ------------------------------------------------------

/**
 * The room, as staff see it.
 *
 * No `refetchInterval` here: polling belongs to the `LiveStream`, which knows
 * about sequences, visibility and gaps. Two independent pollers would fight
 * over the same cache entry, and neither would be the one the screen is
 * reasoning about.
 */
export function useStaffFloor(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffFloor(branchId ?? ''),
    queryFn: () => gateway.getFloor(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

export function useStaffTab(tabId: string | null | undefined) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffTab(tabId ?? ''),
    queryFn: () => gateway.getStaffTab(tabId!),
    enabled: Boolean(tabId),
    staleTime: staleTime.live,
  });
}

/** The incoming orders. Ageing is the panel's whole job, so never stale. */
export function useOrderQueue(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.orderQueue(branchId ?? ''),
    queryFn: () => gateway.listOrderQueue(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
  });
}

export function useServiceRequests(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.serviceRequests(branchId ?? ''),
    queryFn: () => gateway.listServiceRequests(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
  });
}

/**
 * The menu a waiter orders from.
 *
 * Cached hard. A menu that refetches while a waiter is three taps into an order
 * is a grid that moves under their finger, which on this screen means the wrong
 * item added to a real bill.
 */
export function useStaffMenu(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffMenu(branchId ?? ''),
    queryFn: () => gateway.getMenu(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
  });
}

/**
 * Recording cash.
 *
 * A mutation rather than a queued command, and never retried. Both follow from
 * one fact: this device cannot verify the balance it is settling, so a silent
 * second attempt is a second payment.
 */
export function useRecordCashPayment() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: RecordCashPaymentCommand) => gateway.recordCashPayment(command),
    retry: false,
    onSuccess: (_result, command) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(command.tabId) });
    },
  });
}

export function useVoidLine() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: VoidLineCommand) => gateway.voidLine(command),
    retry: false,
    onSuccess: (tab) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
    },
  });
}

export function useCompLine() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: CompCommand) => gateway.compLine(command),
    retry: false,
    onSuccess: (tab) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
    },
  });
}

export function useAbandonTab() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: AbandonTabCommand) => gateway.abandonTab(command),
    retry: false,
    onSuccess: (_result, command) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(command.tabId) });
    },
  });
}

/** Opening a tab, so order entry never has to ask whether there is one. */
export function useOpenTabForTable() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; tableId: string; clientCommandId: string }) =>
      gateway.openTabForTable(input),
    retry: false,
    onSuccess: (tab) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
    },
  });
}
