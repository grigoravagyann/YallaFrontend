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
import type { ConsoleBooking, DecideReservationCommand } from '../contracts/approvals';
import type { ManagedBooking } from '../contracts/publicBranch';
import type { ReportQuery, ReportSection } from '../contracts/reports';
import type { CreateStaffInput, UpdateStaffInput } from '../contracts/staff';
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
  // Its own key, not `consoleVenue`'s: the two reads answer different shapes
  // for different callers, and `useVenueCommand` writes a `ConsoleVenueDetail`
  // into `consoleVenue` on every platform command — a shared key would hand
  // the venue section a platform body the next time the admin suspended one.
  managedVenue: (venueId: string) => ['console', 'managedVenue', venueId] as const,
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
  pendingReservations: (branchId: string) => ['console', 'pendingReservations', branchId] as const,
  staff: (venueId: string) => ['console', 'staff', venueId] as const,
  devices: (branchId: string) => ['console', 'devices', branchId] as const,
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

/*
 * `useFloorPlan` was here, and it is deliberately gone.
 *
 * It fetched the room **as it is now**, and it is what both booking surfaces
 * drew the floor plan from while asking the availability endpoint about a slot
 * three days out — so a diner picking Saturday at 20:00 saw tonight's walk-ins
 * greyed out and Saturday's bookings drawn free. `useSlotFloor` below replaced
 * it, and after that it had no callers at all.
 *
 * Leaving an unused public hook exported would have been the whole bug's
 * re-entry point: the next screen that needs "a floor plan" would reach for the
 * one named `useFloorPlan`, get now-shaped state, and reintroduce a defect that
 * took five prompts to notice. A surface that genuinely wants the room as it
 * stands right now wants the *staff* floor — `useStaffFloor` — and should say
 * so at the call site.
 */

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
 * The hook both booking surfaces render from. It replaced a pair — a now-shaped
 * floor read for the geometry and `useTableAvailability` for the overlay —
 * where the first asked about *now*: a diner picking Saturday at 20:00 was
 * shown the room as it stood at that moment, with tonight's walk-ins greyed out
 * and 20:00's bookings drawn free. Date, time and party size are all server
 * inputs, so all three belong in the key.
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
   * Refresh cadence, opt-in per surface rather than a default.
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
      void queryClient.invalidateQueries({ queryKey: ['console', 'readiness'] });
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
      // The list, never the link.
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff(venueId ?? '') });
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

export function useDevices(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.devices(branchId ?? ''),
    queryFn: () => gateway.listDevices(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
  });
}

/**
 * Mint an enrolment code.
 *
 * A mutation rather than a query, and deliberately uncached: the code is
 * returned once, only its hash is stored, and caching it would put a live
 * credential in a place a later render could read. "Regenerate" is another
 * call, which is what it genuinely is.
 */
export function useCreateEnrolmentCode() {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (branchId: string) => gateway.createEnrolmentCode(branchId),
  });
}

export function useRevokeDevice() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; deviceId: string }) => gateway.revokeDevice(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices(input.branchId) });
      void queryClient.invalidateQueries({ queryKey: ['console', 'readiness'] });
    },
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

// --- Bookings waiting for approval ------------------------------------------

/**
 * The branch's pending bookings. Short-lived: a booking waits for a person,
 * and the person is usually looking at this list because somebody just booked.
 */
export function usePendingReservations(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.pendingReservations(branchId ?? ''),
    queryFn: () => gateway.listPendingReservations(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

/**
 * Both decisions invalidate the list on *settle*, not only on success. A 409
 * means somebody else decided first, and the list this person is looking at
 * is what is stale — refreshing it is the useful half of the refusal.
 */
function useDecideReservation(
  branchId: string | undefined,
  decide: (gateway: ConsoleGateway, command: DecideReservationCommand) => Promise<ConsoleBooking>,
) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: DecideReservationCommand) => decide(gateway, command),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pendingReservations(branchId ?? ''),
      });
    },
  });
}

export function useApproveReservation(branchId: string | undefined) {
  return useDecideReservation(branchId, (gateway, command) => gateway.approveReservation(command));
}

export function useRejectReservation(branchId: string | undefined) {
  return useDecideReservation(branchId, (gateway, command) => gateway.rejectReservation(command));
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

export function useManagedBooking(
  token: string | undefined,
  slugs: { readonly venueSlug: string; readonly branchSlug: string },
) {
  const gateway = usePublicGateway();
  return useQuery({
    queryKey: queryKeys.managedBooking(token ?? ''),
    // The slugs come from the manage URL; the endpoint does not send them back
    // and the page needs them to link home.
    queryFn: () => gateway.getManagedBooking({ token: token!, ...slugs }),
    enabled: Boolean(token),
    staleTime: staleTime.frequent,
  });
}

/**
 * Cancelling from the signed link.
 *
 * Retry is off, as everywhere. Safety on a deliberate retry comes from the
 * domain rather than from a command id — cancelling an already-cancelled
 * booking is not an error and returns it as it stands. The result replaces the
 * cached booking rather than invalidating it, so the page shows the cancelled
 * state without a second round trip on a connection that was already bad enough
 * to make somebody press the button twice.
 */
export function useCancelManagedBooking(
  token: string | undefined,
  slugs: { readonly venueSlug: string; readonly branchSlug: string },
) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      gateway.cancelManagedBooking({ token: token!, ...slugs, reason }),
    retry: false,
    onSuccess: (booking: ManagedBooking) => {
      queryClient.setQueryData(queryKeys.managedBooking(token ?? ''), booking);
    },
  });
}
