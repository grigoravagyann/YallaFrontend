import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { ConsoleGateway } from '../consoleGateway';
import type { ConsoleVenueDetail, CreateVenueCommand, ListVenuesQuery } from '../contracts/console';
import type { ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import type {
  AbandonTabCommand,
  CompCommand,
  ReassignHostCommand,
  RecordCashPaymentCommand,
  VoidLineCommand,
} from '../contracts/ordering';
import type { Menu } from '../contracts/menu';
import type { CreateMenuItemInput, UpdateMenuItemInput } from '../contracts/menuAdmin';
import type { ReservationPolicy, WeeklyHours } from '../contracts/branchSettings';
import type { ManagedBooking } from '../contracts/publicBranch';
import type { ReportQuery, ReportSection } from '../contracts/reports';
import { ReportRangeTooLongError } from '../contracts/errors';
import type { PublicGateway } from '../publicGateway';
import type { ReleaseReservationCommand } from '../staffGateway';
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
 * The current time, as React state rather than a `Date.now()` call in render.
 *
 * Reading the clock during render is impure — two renders of the same props can
 * disagree — so the clock is treated as what it is: an external system a
 * component subscribes to.
 *
 * It lives here, in the data layer's React module, because on both surfaces the
 * question it answers is a question about data: how old is this answer. The
 * phone's bookings list uses it to move a booking from "upcoming" to "past"
 * when its slot passes, and the public branch page uses it to decide whether
 * the free-table count on screen is stale enough to need a timestamp under it.
 * Neither works if the only thing that re-reads the clock is an unrelated
 * re-render.
 *
 * @param intervalMs How often to re-read. Default 30s — fine for slot
 * boundaries and for a one-minute staleness threshold, and cheap enough to
 * leave running.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

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
  readonly publicGateway: PublicGateway | null;
}

const GatewayContext = createContext<Gateways>({
  gateway: null,
  consoleGateway: null,
  staffGateway: null,
  publicGateway: null,
});

export interface GatewayProviderProps {
  readonly gateway?: YallaGateway | undefined;
  readonly consoleGateway?: ConsoleGateway | undefined;
  readonly staffGateway?: StaffGateway | undefined;
  readonly publicGateway?: PublicGateway | undefined;
  readonly children: ReactNode;
}

export function GatewayProvider({
  gateway,
  consoleGateway,
  staffGateway,
  publicGateway,
  children,
}: GatewayProviderProps) {
  return createElement(
    GatewayContext.Provider,
    {
      value: {
        gateway: gateway ?? null,
        consoleGateway: consoleGateway ?? null,
        staffGateway: staffGateway ?? null,
        publicGateway: publicGateway ?? null,
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

export function usePublicGateway(): PublicGateway {
  const { publicGateway } = useContext(GatewayContext);
  if (!publicGateway) {
    throw new Error('usePublicGateway: wrap the tree in <GatewayProvider publicGateway={…}>.');
  }
  return publicGateway;
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
  // Under `availability` on purpose: every mutation that already invalidates
  // `['availability', branchId]` invalidates the slot-aware room with it, and
  // one that forgot would leave the drawn room stale after a booking landed.
  slotFloor: (branchId: string, slotUtc: string, partySize: number, timeZoneId: string) =>
    ['availability', branchId, 'slotFloor', slotUtc, partySize, timeZoneId] as const,
  consoleVenues: (query: ListVenuesQuery) => ['console', 'venues', query] as const,
  consoleVenue: (venueId: string) => ['console', 'venue', venueId] as const,
  editorFloorPlan: (branchId: string) => ['console', 'floorPlan', branchId] as const,
  staffFloor: (branchId: string) => ['staff', 'floor', branchId] as const,
  staffTab: (tabId: string) => ['staff', 'tab', tabId] as const,
  orderQueue: (branchId: string) => ['staff', 'orders', branchId] as const,
  serviceRequests: (branchId: string) => ['staff', 'serviceRequests', branchId] as const,
  staffMenu: (branchId: string) => ['staff', 'menu', branchId] as const,
  tabLines: (tabId: string) => ['staff', 'tabLines', tabId] as const,
  adminMenu: (branchId: string) => ['console', 'menu', branchId] as const,
  publicVenue: (venueSlug: string) => ['public', 'venue', venueSlug] as const,
  publicBranch: (venueSlug: string, branchSlug: string) =>
    ['public', 'branch', venueSlug, branchSlug] as const,
  publicMenu: (branchId: string) => ['public', 'menu', branchId] as const,
  managedBooking: (token: string) => ['public', 'booking', token] as const,
  openingHours: (branchId: string) => ['console', 'hours', branchId] as const,
  reservationPolicy: (branchId: string) => ['console', 'policy', branchId] as const,
  /*
   * One key per section, and the section name is in it.
   *
   * Five keys rather than one keyed on the range, because the five sections
   * load, fail and retry independently — a single key would make the slowest
   * report (the menu one, which anti-joins the whole menu) the arrival time of
   * the whole screen, and one erroring section would blank the page.
   */
  report: (section: ReportSection, query: ReportQuery) =>
    [
      'console',
      'report',
      section,
      query.branchId,
      query.from,
      query.to,
      query.rollUpVenue ?? false,
    ] as const,
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

/**
 * Live table state: stale almost immediately.
 *
 * `pollMs` is opt-in at the call site rather than a default, because the three
 * surfaces that read this room have three different reasons not to share one
 * cadence. The counter screen must **not** poll — its `LiveStream` owns
 * refreshing, and a second poller would fight it over the same cache entry. The
 * phone app refetches on focus, which is when a diner is looking. The public
 * branch page is the one that is genuinely left open on a table with nobody
 * touching it, so it asks for an interval.
 */
export function useFloorPlan(branchId: string | undefined, options: { pollMs?: number } = {}) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.floor(branchId ?? ''),
    queryFn: () => gateway.getFloorPlan(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
    ...(options.pollMs
      ? {
          refetchInterval: options.pollMs,
          // A page in a background tab is a page nobody is reading. Polling it
          // spends a stranger's mobile data on a room they cannot see.
          refetchIntervalInBackground: false,
        }
      : {}),
  });
}

/**
 * How long the party-size stepper is allowed to settle before we ask again.
 *
 * A diner going from 2 to 6 taps four times in about a second. Each tap is a
 * different question with a different answer, and asking all four wastes three
 * round trips on a rate-limited anonymous endpoint and lands them out of order
 * often enough to matter. Long enough to coalesce a run of taps, short enough
 * that a deliberate single change still feels immediate.
 */
export const PARTY_SIZE_DEBOUNCE_MS = 300;

/**
 * The value once it has stopped moving.
 *
 * Deliberately not a debounce on the *request*: the query key carries the
 * settled value, so React Query sees one key change and therefore one fetch,
 * and a cached answer for a size the diner passes back through is served
 * instantly rather than refetched.
 */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setSettled(value);
      return;
    }
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

/**
 * The room as it will be at a slot, and the answer for every table in it.
 *
 * The hook both booking surfaces render from. It replaces a pair — `useFloorPlan`
 * for the geometry and `useTableAvailability` for the overlay — where the first
 * asked about *now*: a diner picking Saturday at 20:00 was shown the room as it
 * stood at that moment, with tonight's walk-ins greyed out and 20:00's bookings
 * drawn free. Date, time and party size are all server inputs, so all three
 * belong in the key.
 *
 * `keepPreviousData` matters more here than anywhere else in this file. Changing
 * the time is a new key, and without it the room would blank to a spinner on
 * every adjustment of a control that sits directly above it.
 */
export function useSlotFloor(input: {
  readonly branchId: string | undefined;
  readonly slotUtc: string;
  readonly partySize: number;
  /** The branch's IANA zone; the backend asks in wall-clock terms. */
  readonly timeZoneId?: string | undefined;
  /** Override for tests. `0` disables the wait entirely. */
  readonly debounceMs?: number;
  /**
   * Refresh cadence, opt-in per surface exactly as {@link useFloorPlan}'s is.
   *
   * The public page asks for one because it is the surface genuinely left open
   * on a table with nobody touching it, and a slot an hour out still gains and
   * loses bookings while somebody reads the menu. The phone app does not: it
   * refetches on focus, which is when a diner is actually looking.
   */
  readonly pollMs?: number;
}) {
  const gateway = useGateway();
  const { branchId, slotUtc, timeZoneId, debounceMs = PARTY_SIZE_DEBOUNCE_MS, pollMs } = input;
  const partySize = useSettled(input.partySize, debounceMs);

  return useQuery({
    // The zone is in the key because it decides the wall-clock date and time
    // actually sent. It resolves a beat after the first render, and without it
    // here that first answer — computed in the fallback zone — would be cached
    // and never corrected.
    queryKey: queryKeys.slotFloor(branchId ?? '', slotUtc, partySize, timeZoneId ?? ''),
    queryFn: () => gateway.getSlotFloor({ branchId: branchId!, slotUtc, partySize, timeZoneId }),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
    placeholderData: keepPreviousData,
    ...(pollMs
      ? {
          refetchInterval: pollMs,
          // A page in a background tab is a page nobody is reading. Polling it
          // spends a stranger's mobile data on a room they cannot see.
          refetchIntervalInBackground: false,
        }
      : {}),
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

/**
 * One tab's lines.
 *
 * Its own query rather than part of the tab, because it costs three branch-wide
 * reads and the tab itself is read whenever a panel is open. Enabled only while
 * something is actually showing the bill.
 */
export function useTabLines(input: {
  readonly branchId: string | undefined;
  readonly tabId: string | null | undefined;
  readonly enabled?: boolean | undefined;
}) {
  const gateway = useStaffGateway();
  const { branchId, tabId } = input;
  return useQuery({
    queryKey: queryKeys.tabLines(tabId ?? ''),
    queryFn: () => gateway.getTabLines({ branchId: branchId!, tabId: tabId! }),
    enabled: Boolean(branchId) && Boolean(tabId) && (input.enabled ?? true),
    staleTime: staleTime.live,
  });
}

/**
 * The incoming orders.
 *
 * Ageing is the panel's whole job, and `waitingMinutes` is computed by the
 * server at read time — so a queue that is never refetched shows a five-minute
 * wait for the rest of the shift. Foreground only: a tablet face-down on the
 * counter has nobody reading it.
 */
export function useOrderQueue(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.orderQueue(branchId ?? ''),
    queryFn: () => gateway.listOrderQueue(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
}

export function useServiceRequests(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.serviceRequests(branchId ?? ''),
    queryFn: () => gateway.listServiceRequests(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
}

export interface UseStaffMenuOptions {
  /**
   * A menu this device already has, from durable storage.
   *
   * The reason order entry works with the wifi off. TanStack Query does not
   * *fail* a query it cannot send — it pauses it — so a cold offline launch
   * with no seed shows a grid that never resolves. Seeding from disk means the
   * grid is there before the first request is attempted, and the refetch that
   * follows is an improvement rather than a prerequisite.
   */
  readonly initialData?: Menu | null | undefined;
  /** When the seed was stored, so a fresh copy is still fetched in the background. */
  readonly initialDataUpdatedAt?: number | undefined;
}

/**
 * The menu a waiter orders from.
 *
 * Cached hard. A menu that refetches while a waiter is three taps into an order
 * is a grid that moves under their finger, which on this screen means the wrong
 * item added to a real bill.
 */
export function useStaffMenu(branchId: string | undefined, options: UseStaffMenuOptions = {}) {
  const gateway = useStaffGateway();
  const seed = options.initialData ?? undefined;
  return useQuery({
    queryKey: queryKeys.staffMenu(branchId ?? ''),
    queryFn: () => gateway.getMenu(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    ...(seed
      ? {
          initialData: seed,
          ...(options.initialDataUpdatedAt !== undefined
            ? { initialDataUpdatedAt: options.initialDataUpdatedAt }
            : {}),
        }
      : {}),
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
    // A refusal carries the real balance, so the panel has to be looking at the
    // real tab by the time it renders the message.
    onError: (_error, command) => {
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
    onSuccess: (_lines, command) => {
      // Both: the lines changed and so did the totals, and they are two queries.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tabLines(command.tabId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(command.tabId) });
    },
  });
}

export function useCompLine() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: CompCommand) => gateway.compLine(command),
    retry: false,
    onSuccess: (_adjustment, command) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(command.tabId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tabLines(command.tabId) });
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

/** Asking for the bill. Stops the tab taking new items. */
export function useBeginClosing() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; clientCommandId: string }) => gateway.beginClosing(input),
    retry: false,
    onSuccess: (tab) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
    },
  });
}

export function useReassignHost() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ReassignHostCommand) => gateway.reassignHost(command),
    retry: false,
    onSuccess: (tab) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
    },
  });
}

/**
 * Letting a booking go, with the outcome the waiter chose.
 *
 * Never retried. The server is idempotent on `clientCommandId`, but an
 * automatic retry is the wrong default for a call whose whole subject is
 * whether something goes on a person's record.
 */
export function useReleaseReservation(branchId: string | undefined) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ReleaseReservationCommand) => gateway.releaseReservation(command),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
    },
  });
}

// --- The menu editor, opening hours and the reservation policy ----------------

/**
 * The whole menu for a branch.
 *
 * Reference data with a long stale time and **no refetch on focus**: somebody
 * entering eighty dishes alt-tabs to a spreadsheet constantly, and a list that
 * reordered itself under the cursor on every return is a list that gets the
 * wrong price edited.
 */
export function useAdminMenu(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.adminMenu(branchId ?? ''),
    queryFn: () => gateway.getAdminMenu(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * Every menu mutation invalidates the whole menu, and none of them patches it.
 *
 * Patching would be faster and is the wrong trade here: a reorder changes the
 * display order of rows the response does not mention, and a client that
 * patched one row would show an order the server does not have. The menu is one
 * request.
 */
function useMenuMutation<TInput, TResult>(
  branchId: string | undefined,
  run: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminMenu(branchId ?? '') });
    },
  });
}

export function useCreateCategory(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { name: string; displayOrder: number }) =>
    gateway.createCategory({ branchId: branchId!, ...input }),
  );
}

export function useUpdateCategory(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(
    branchId,
    (input: { categoryId: string; name?: string | undefined; displayOrder?: number | undefined }) =>
      gateway.updateCategory({ branchId: branchId!, ...input }),
  );
}

export function useDeleteCategory(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { categoryId: string }) =>
    gateway.deleteCategory({ branchId: branchId!, ...input }),
  );
}

export function useCreateMenuItem(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (item: CreateMenuItemInput) =>
    gateway.createMenuItem({ branchId: branchId!, item }),
  );
}

export function useUpdateMenuItem(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { itemId: string; patch: UpdateMenuItemInput }) =>
    gateway.updateMenuItem({ branchId: branchId!, ...input }),
  );
}

export function useSetMenuItemAvailability(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { itemId: string; isAvailable: boolean }) =>
    gateway.setMenuItemAvailability({ branchId: branchId!, ...input }),
  );
}

export function useDeleteMenuItem(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMenuMutation(branchId, (input: { itemId: string }) =>
    gateway.deleteMenuItem({ branchId: branchId!, ...input }),
  );
}

/**
 * One photo upload.
 *
 * Not a query mutation with cache side effects: a photo is attached to an item
 * by a separate call, and an upload that invalidated the menu would redraw the
 * table under a form somebody is still filling in.
 */
export function useUploadPhoto(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (input: {
      file: Blob;
      fileName: string;
      onProgress?: ((fraction: number) => void) | undefined;
      signal?: AbortSignal | undefined;
    }) => gateway.uploadPhoto({ branchId: branchId!, ...input }),
    retry: false,
  });
}

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
 * How long a report answer stays fresh.
 *
 * Longer than anything else in this file, and deliberately: a report over a
 * closed range — yesterday, last week — cannot change, and re-running a query
 * that scans a month of sittings because somebody switched tabs is expensive
 * for nobody's benefit. Even "this week" moves slowly enough that a minute-old
 * answer is not misleading.
 */
const REPORT_STALE_MS = 5 * 60_000;

/**
 * One report section.
 *
 * Every section on the screen calls this with the same range and its own
 * section name, so each gets its own cache entry, its own loading state and its
 * own error. That is the whole design: reports are slow queries and an owner
 * who wants tonight's covers should not wait on the menu anti-join, nor lose
 * the page when it fails.
 *
 * `enabled` is off without a branch, so a manager whose branch list has not
 * arrived yet issues no request rather than one for the empty string.
 */
function useReport<T>(
  section: ReportSection,
  query: ReportQuery | null,
  run: (gateway: ConsoleGateway, query: ReportQuery) => Promise<T>,
) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.report(section, query ?? EMPTY_REPORT_QUERY),
    queryFn: () => run(gateway, query!),
    enabled: query !== null,
    staleTime: REPORT_STALE_MS,
    refetchOnWindowFocus: false,
    /*
     * A range too long for the server to run will be too long however many
     * times it is asked, and the screen shows the limit rather than spinning.
     * Everything else retries as usual.
     */
    retry: (failureCount, error) =>
      error instanceof ReportRangeTooLongError ? false : failureCount < 2,
  });
}

const EMPTY_REPORT_QUERY: ReportQuery = { branchId: '', from: '', to: '' };

export function useOccupancyReport(query: ReportQuery | null) {
  return useReport('occupancy', query, (gateway, q) => gateway.getOccupancyReport(q));
}

export function useReservationReport(query: ReportQuery | null) {
  return useReport('reservations', query, (gateway, q) => gateway.getReservationReport(q));
}

export function useRevenueReport(query: ReportQuery | null) {
  return useReport('revenue', query, (gateway, q) => gateway.getRevenueReport(q));
}

export function useMenuReport(query: ReportQuery | null) {
  return useReport('menu', query, (gateway, q) => gateway.getMenuReport(q));
}

export function useStaffReport(query: ReportQuery | null) {
  return useReport('staff', query, (gateway, q) => gateway.getStaffReport(q));
}

/**
 * Fetch one section's CSV, as the server wrote it.
 *
 * A mutation rather than a query because it is an action somebody takes, and
 * because its result is a file rather than state: caching it would hold a Blob
 * of a report nobody is looking at any more.
 */
export function useExportReport() {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (input: ReportQuery & { section: ReportSection }) => gateway.exportReport(input),
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
    },
  });
}

// --- The public branch page ---------------------------------------------------

/**
 * How often the page re-reads the room while somebody is looking at it.
 *
 * Forty-five seconds is a compromise between two real costs. Shorter and a page
 * left open on a table is a request every few seconds from a phone on mobile
 * data, for a number that changes when a party sits down — minutes apart, not
 * seconds. Longer and the count on screen is stale enough to send four people
 * to a venue with two tables.
 */
export const PUBLIC_REFRESH_MS = 45_000;

/**
 * The venue-level chooser.
 *
 * Reference data with a live number attached, so it takes the live cadence: the
 * per-branch free counts are the only reason this screen beats a phone call.
 */
export function usePublicVenue(venueSlug: string | undefined) {
  const gateway = usePublicGateway();
  return useQuery({
    queryKey: queryKeys.publicVenue(venueSlug ?? ''),
    queryFn: () => gateway.resolveVenue(venueSlug!),
    enabled: Boolean(venueSlug),
    staleTime: staleTime.live,
    refetchInterval: PUBLIC_REFRESH_MS,
    // A page in a background tab is a page nobody is reading. Refetching it
    // spends a stranger's mobile data on a number they cannot see.
    refetchIntervalInBackground: false,
  });
}

/**
 * The branch page's own data: the venue header, the counts, the hours.
 *
 * `refetchOnWindowFocus` is on (the client default) and load-bearing here
 * rather than incidental — someone comes back to this tab after ten minutes in
 * a chat, and the first thing they look at is the number that was true when
 * they left.
 */
export function usePublicBranch(input: {
  readonly venueSlug: string | undefined;
  readonly branchSlug: string | undefined;
}) {
  const gateway = usePublicGateway();
  const { venueSlug, branchSlug } = input;
  return useQuery({
    queryKey: queryKeys.publicBranch(venueSlug ?? '', branchSlug ?? ''),
    queryFn: () => gateway.resolveBranch({ venueSlug: venueSlug!, branchSlug: branchSlug! }),
    enabled: Boolean(venueSlug) && Boolean(branchSlug),
    staleTime: staleTime.live,
    refetchInterval: PUBLIC_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * The menu, with photos.
 *
 * Cached hard and never refetched on focus: a menu is reference data, the
 * photos are the heaviest thing on the page, and re-fetching it when somebody
 * returns to the tab would re-run the image loads for no new information.
 */
export function usePublicMenu(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.publicMenu(branchId ?? ''),
    queryFn: () => gateway.getBranchMenuDetail(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

export function useManagedBooking(token: string | undefined) {
  const gateway = usePublicGateway();
  return useQuery({
    queryKey: queryKeys.managedBooking(token ?? ''),
    queryFn: () => gateway.getManagedBooking(token!),
    enabled: Boolean(token),
    staleTime: staleTime.frequent,
  });
}

/**
 * Cancelling from the signed link.
 *
 * Retry is off, as everywhere: the `commandId` is what makes a *deliberate*
 * retry safe, not a licence for an automatic one. The result replaces the
 * cached booking rather than invalidating it, so the page shows the cancelled
 * state without a second round trip on a connection that was already bad enough
 * to make somebody press the button twice.
 */
export function useCancelManagedBooking(token: string | undefined) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commandId: string) => gateway.cancelManagedBooking({ token: token!, commandId }),
    retry: false,
    onSuccess: (booking: ManagedBooking) => {
      queryClient.setQueryData(queryKeys.managedBooking(token ?? ''), booking);
    },
  });
}
