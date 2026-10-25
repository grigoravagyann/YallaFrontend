import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ConsoleGateway } from '../consoleGateway';
import type { Booking } from '../contracts/booking';
import {
  preOrderMenu,
  type ClearPreOrderCommand,
  type DuePreOrder,
  type DuePreOrders,
  type OnMyWayResult,
  type PreOrderDraft,
  type PreOrderResult,
  type PreOrderSettings,
  type PreOrderSettingsInput,
  type PreOrderStaffCommand,
  type ReplacePreOrderCommand,
} from '../contracts/preOrder';
import type { BranchMenu } from '../contracts/ordering';
import type {
  AskOnMyWayResult,
  ReportRunningLateCommand,
  RunningLateMinutes,
  RunningLateResult,
} from '../contracts/onMyWay';
import type { ManagedBooking } from '../contracts/publicBranch';
import type { YallaGateway } from '../gateway';
import { afterGuestAnswered, afterVenueAsked } from './messages';
import { ValidationError } from '../errors';
import { staleTime } from '../queryClient';
import { useConsoleGateway, useGateway, usePublicGateway, useStaffGateway } from './gateways';
import { usePublicBranch } from './publicBranch';
import { queryKeys } from './queryKeys';

/**
 * Pre-orders on a booking (2026-10-21): the hooks every surface uses, and
 * what each mutation does to the cache.
 *
 * Every mutation is online only and never retried: the guest's carry a
 * `clientCommandId` that makes a *deliberate* retry safe, and the waiter's are
 * idempotent by state (two tablets, one ticket). Each one puts its answer
 * straight onto what is on screen and reads again, on **settle**, everything
 * that shows the pre-order — a 409 means the screen is what is stale.
 *
 * The cache work is in plain functions (`after…`) so it is tested on a real
 * `QueryClient` without rendering anything.
 */

// --- What each mutation does to the cache ------------------------------------

/**
 * A save or a clear of the diner's own pre-order: onto the cached booking at
 * once, then the booking, the lists and the notification landing read again.
 */
export function afterPreOrderSaved(queryClient: QueryClient, result: PreOrderResult): void {
  queryClient.setQueryData<Booking>(queryKeys.booking(result.reservationId), (booking) =>
    booking ? { ...booking, preOrder: result.preOrder } : booking,
  );
  invalidateBooking(queryClient, result.reservationId);
}

/**
 * "Yes, on my way" from the app: onto the cached booking, then read again.
 * On my way after "running late" is on time after all: the lateness goes.
 */
export function afterOnMyWay(queryClient: QueryClient, result: OnMyWayResult): void {
  queryClient.setQueryData<Booking>(queryKeys.booking(result.reservationId), (booking) =>
    booking
      ? {
          ...booking,
          guestConfirmedOnWayAtUtc: result.guestConfirmedOnWayAtUtc,
          guestRunningLateMinutes: null,
          guestRunningLateAtUtc: null,
        }
      : booking,
  );
  invalidateBooking(queryClient, result.reservationId);
}

/** "I'm running late" from the app (2026-10-22): onto the cached booking, then read again. */
export function afterRunningLate(queryClient: QueryClient, result: RunningLateResult): void {
  queryClient.setQueryData<Booking>(queryKeys.booking(result.reservationId), (booking) =>
    booking
      ? {
          ...booking,
          guestRunningLateMinutes: result.guestRunningLateMinutes,
          guestRunningLateAtUtc: result.guestRunningLateAtUtc,
        }
      : booking,
  );
  invalidateBooking(queryClient, result.reservationId);
}

function invalidateBooking(queryClient: QueryClient, reservationId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.booking(reservationId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reservationState(reservationId) });
  // Guest messages (2026-10-23): every answer is a message in the booking's
  // thread, with a system line beside it.
  afterGuestAnswered(queryClient, reservationId);
}

/** A save or a clear from the manage link: onto the cached link, then read again. */
export function afterManagedPreOrderSaved(
  queryClient: QueryClient,
  token: string,
  result: PreOrderResult,
): void {
  queryClient.setQueryData<ManagedBooking | null>(queryKeys.managedBooking(token), (booking) =>
    booking ? { ...booking, preOrder: result.preOrder } : booking,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token) });
}

/** "Yes, on my way" from the link: the question goes at once. */
export function afterManagedOnMyWay(
  queryClient: QueryClient,
  token: string,
  result: OnMyWayResult,
): void {
  queryClient.setQueryData<ManagedBooking | null>(queryKeys.managedBooking(token), (booking) =>
    booking
      ? {
          ...booking,
          guestConfirmedOnWayAtUtc: result.guestConfirmedOnWayAtUtc,
          onYourWayAsked: false,
        }
      : booking,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token) });
}

/** "I'm running late" from the link: the question goes at once. */
export function afterManagedRunningLate(
  queryClient: QueryClient,
  token: string,
  result: RunningLateResult,
): void {
  queryClient.setQueryData<ManagedBooking | null>(queryKeys.managedBooking(token), (booking) =>
    booking
      ? {
          ...booking,
          guestRunningLateMinutes: result.guestRunningLateMinutes,
          onYourWayAsked: false,
        }
      : booking,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token) });
}

/**
 * The venue's "Ask: are you coming?" (2026-10-22) — `result` the answer, or
 * `null` on a refusal (answered already, asked a moment ago: the screen is
 * stale). The rail's card takes the ask at once; the rail, the floor (the
 * table panel's next booking) and the awaiting list are read again.
 */
export function afterAskOnMyWay(
  queryClient: QueryClient,
  branchId: string,
  result: AskOnMyWayResult | null,
): void {
  if (result) {
    queryClient.setQueryData<DuePreOrders>(queryKeys.duePreOrders(branchId), (rail) =>
      rail
        ? {
            ...rail,
            items: rail.items.map((item) =>
              item.reservationId === result.reservationId
                ? { ...item, staffAskedOnMyWayAtUtc: result.staffAskedOnMyWayAtUtc }
                : item,
            ),
          }
        : rail,
    );
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.duePreOrders(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.awaitingApproval(branchId) });
  // Guest messages (2026-10-23): the ask is a message in the booking's thread.
  afterVenueAsked(queryClient, branchId, result?.reservationId ?? null);
}

/**
 * The waiter's Send or Not coming — `card` the answer, or `null` on a refusal.
 * The card replaces its old self on the rail, and the rail, the floor, the
 * kitchen queue and the party's tab (a send can open one) are read again.
 */
export function afterPreOrderAction(
  queryClient: QueryClient,
  branchId: string,
  card: DuePreOrder | null,
): void {
  if (card) {
    queryClient.setQueryData<DuePreOrders>(queryKeys.duePreOrders(branchId), (rail) =>
      rail
        ? {
            ...rail,
            items: rail.items.map((item) =>
              item.reservationId === card.reservationId ? card : item,
            ),
          }
        : rail,
    );
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.duePreOrders(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
  // Guest messages (2026-10-23): "not coming" may be written into the thread.
  afterVenueAsked(queryClient, branchId, card?.reservationId ?? null);
  if (card?.tabId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tabLines(card.tabId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(card.tabId) });
  }
}

/** The console's save: the answer cached, and the menu read again (each dish carries the flag). */
export function afterPreOrderSettingsSaved(
  queryClient: QueryClient,
  branchId: string,
  settings: PreOrderSettings,
): void {
  queryClient.setQueryData(queryKeys.preOrderSettings(branchId), settings);
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminMenu(branchId) });
}

/**
 * At most a minute between reads of the rail; never hammering a past due time.
 * The server's `nextDueAtUtc` is always in its future, so a tablet whose clock
 * runs ahead reads it as past and would read again at once, get the same time
 * back, and loop: five seconds is the floor.
 */
const RAIL_MAX_POLL_MS = 60_000;
const RAIL_MIN_POLL_MS = 5_000;

/**
 * When to read the rail again: just after `nextDueAtUtc` (the next card's
 * time — no event says a time passed), and at least once a minute as a safety
 * net. The change stream's `preOrderChanged` and `bookingChanged` signals are
 * the main trigger; the tablet invalidates `duePreOrders` on them.
 */
export function duePreOrdersPollMs(
  rail: DuePreOrders | null | undefined,
  now: number = Date.now(),
): number {
  const next = rail?.nextDueAtUtc ? Date.parse(rail.nextDueAtUtc) : Number.NaN;
  if (!Number.isFinite(next)) return RAIL_MAX_POLL_MS;
  return Math.min(RAIL_MAX_POLL_MS, Math.max(RAIL_MIN_POLL_MS, next - now + 500));
}

// --- The diner app ------------------------------------------------------------

/*
 * Each of the app's hooks is its options, built from a gateway and a query
 * client, and a one-line hook over them. The diner app's own hooks
 * (`apps/diner/src/data/preOrderQueries.ts`) are the same one line over the
 * same options, through the app's `useGateway` — which its screen tests
 * replace, and which this module's internal one is not — so the two cannot
 * drift: there is one definition of each query and mutation, here.
 */

/**
 * The dishes the pre-order picker offers at a branch: the diner menu narrowed
 * to `isAvailable && availableForPreOrder`, no empty category left. Shares the
 * menu's cache entry with the public page's menu; a short stale time, since a
 * dish selling out is exactly what this screen must not miss.
 */
export function preOrderMenuOptions(gateway: YallaGateway, branchId: string | null | undefined) {
  return {
    queryKey: queryKeys.publicMenu(branchId ?? ''),
    queryFn: () => gateway.getBranchMenuDetail(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.frequent,
    select: (menu: BranchMenu | null) => (menu ? preOrderMenu(menu) : null),
  };
}

export function usePreOrderMenu(branchId: string | null | undefined) {
  return useQuery(preOrderMenuOptions(useGateway(), branchId));
}

/**
 * Save the diner's own pre-order — the whole list. Never retried; the same
 * `clientCommandId` on a deliberate retry answers the pre-order as it stands.
 * Errors read with `preOrderFailure`.
 */
export function replacePreOrderOptions(queryClient: QueryClient, gateway: YallaGateway) {
  return {
    mutationFn: (command: ReplacePreOrderCommand) => gateway.replacePreOrder(command),
    retry: false,
    onSuccess: (result: PreOrderResult) => afterPreOrderSaved(queryClient, result),
    onError: (_error: unknown, command: ReplacePreOrderCommand) =>
      invalidateBooking(queryClient, command.reservationId),
  };
}

export function useReplacePreOrder() {
  return useMutation(replacePreOrderOptions(useQueryClient(), useGateway()));
}

/** Remove it. As {@link replacePreOrderOptions}. */
export function clearPreOrderOptions(queryClient: QueryClient, gateway: YallaGateway) {
  return {
    mutationFn: (command: ClearPreOrderCommand) => gateway.clearPreOrder(command),
    retry: false,
    onSuccess: (result: PreOrderResult) => afterPreOrderSaved(queryClient, result),
    onError: (_error: unknown, command: ClearPreOrderCommand) =>
      invalidateBooking(queryClient, command.reservationId),
  };
}

export function useClearPreOrder() {
  return useMutation(clearPreOrderOptions(useQueryClient(), useGateway()));
}

/**
 * "Yes, on my way", from the booking screen, the feed row or the push's
 * action. `onAnswered` runs after the cache work on a success — the app reads
 * its notifications feed again there, whose keys are its own.
 */
export function confirmOnMyWayOptions(
  queryClient: QueryClient,
  gateway: YallaGateway,
  onAnswered?: () => void,
) {
  return {
    mutationFn: (reservationId: string) => gateway.confirmOnMyWay(reservationId),
    retry: false,
    onSuccess: (result: OnMyWayResult) => {
      afterOnMyWay(queryClient, result);
      onAnswered?.();
    },
    onError: (_error: unknown, reservationId: string) =>
      invalidateBooking(queryClient, reservationId),
  };
}

export function useConfirmOnMyWay() {
  return useMutation(confirmOnMyWayOptions(useQueryClient(), useGateway()));
}

/**
 * "I'm running late" — 10, 15 or 30 minutes (2026-10-22), from the booking
 * screen or the feed row. `onAnswered` as for {@link confirmOnMyWayOptions}.
 * Errors: `OnMyWayNotOpenError` outside the window.
 */
export function reportRunningLateOptions(
  queryClient: QueryClient,
  gateway: YallaGateway,
  onAnswered?: () => void,
) {
  return {
    mutationFn: (command: ReportRunningLateCommand) => gateway.reportRunningLate(command),
    retry: false,
    onSuccess: (result: RunningLateResult) => {
      afterRunningLate(queryClient, result);
      onAnswered?.();
    },
    onError: (_error: unknown, command: ReportRunningLateCommand) =>
      invalidateBooking(queryClient, command.reservationId),
  };
}

export function useReportRunningLate() {
  return useMutation(reportRunningLateOptions(useQueryClient(), useGateway()));
}

// --- The manage link ------------------------------------------------------------

/**
 * The pre-order picker's menu for a manage link. The link publishes no branch
 * id, so the branch is read by the booking's slugs (`resolveBranch`, not
 * polled) and its menu narrowed as {@link usePreOrderMenu} narrows it.
 */
export function useManagedPreOrderMenu(
  booking: Pick<ManagedBooking, 'venueSlug' | 'branchSlug'> | null | undefined,
) {
  const branch = usePublicBranch({
    venueSlug: booking?.venueSlug || undefined,
    branchSlug: booking?.branchSlug || undefined,
    live: false,
  });
  const menu = usePreOrderMenu(branch.data?.id);
  return { branch, menu };
}

/** Save the pre-order from the link. The link's cached booking takes the answer. */
export function useReplaceManagedPreOrder(token: string | undefined) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PreOrderDraft & { readonly clientCommandId: string }) =>
      gateway.replaceManagedPreOrder({ ...command, token: token! }),
    retry: false,
    onSuccess: (result: PreOrderResult) =>
      afterManagedPreOrderSaved(queryClient, token ?? '', result),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token ?? '') }),
  });
}

/** Remove it from the link. */
export function useClearManagedPreOrder(token: string | undefined) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientCommandId: string) =>
      gateway.clearManagedPreOrder({ token: token!, clientCommandId }),
    retry: false,
    onSuccess: (result: PreOrderResult) =>
      afterManagedPreOrderSaved(queryClient, token ?? '', result),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token ?? '') }),
  });
}

/** "Yes, on my way" from the link, when the booking's `onYourWayAsked`. */
export function useConfirmManagedOnMyWay(token: string | undefined) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.confirmManagedOnMyWay({ token: token! }),
    retry: false,
    onSuccess: (result: OnMyWayResult) => afterManagedOnMyWay(queryClient, token ?? '', result),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token ?? '') }),
  });
}

/** "I'm running late" from the link (2026-10-22). Takes the minutes. */
export function useReportManagedRunningLate(token: string | undefined) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: RunningLateMinutes) =>
      gateway.reportManagedRunningLate({ token: token!, minutes }),
    retry: false,
    onSuccess: (result: RunningLateResult) =>
      afterManagedRunningLate(queryClient, token ?? '', result),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(token ?? '') }),
  });
}

// --- The floor tablet -------------------------------------------------------------

/**
 * The "Հիմա" rail's pre-order cards. Read again just after `nextDueAtUtc`, at
 * least once a minute in the foreground, and — by the tablet — on the change
 * stream's `preOrderChanged` and `bookingChanged` (invalidate
 * `queryKeys.duePreOrders(branchId)`).
 */
export function useDuePreOrders(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.duePreOrders(branchId ?? ''),
    queryFn: () => gateway.listDuePreOrders(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: (query) => duePreOrdersPollMs(query.state.data),
    refetchIntervalInBackground: false,
  });
}

/**
 * The waiter's two actions' mutation options, apart from the hook so the
 * network rule is tested on a real `QueryClient`.
 */
export function preOrderActionOptions(
  queryClient: QueryClient,
  branchId: string,
  act: (command: PreOrderStaffCommand) => Promise<DuePreOrder>,
) {
  return {
    mutationFn: act,
    retry: false,
    // Online only, never queued. The tablet's client pauses an offline write
    // and sends it on reconnect; a tap made as the wifi dropped would then be
    // a kitchen ticket nobody saw go. It fails here instead.
    networkMode: 'always' as const,
    onSuccess: (card: DuePreOrder) => afterPreOrderAction(queryClient, branchId, card),
    onError: () => afterPreOrderAction(queryClient, branchId, null),
  };
}

function usePreOrderAction(
  branchId: string | undefined,
  act: (command: PreOrderStaffCommand) => Promise<DuePreOrder>,
) {
  const queryClient = useQueryClient();
  return useMutation(preOrderActionOptions(queryClient, branchId ?? '', act));
}

/** "Coming → Send to kitchen". Online only. Errors read with `preOrderActionFailure`. */
export function useSendPreOrder(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return usePreOrderAction(branchId, (command) => gateway.sendPreOrder(command));
}

/** "Not coming / no answer". Online only; the card stays and Send stays allowed. */
export function useMarkPreOrderNotComing(branchId: string | undefined) {
  const gateway = useStaffGateway();
  return usePreOrderAction(branchId, (command) => gateway.markPreOrderNotComing(command));
}

/** The ask's mutation options, apart from the hook so the network rule is tested. */
export function askOnMyWayOptions(
  queryClient: QueryClient,
  branchId: string,
  ask: (reservationId: string) => Promise<AskOnMyWayResult>,
) {
  return {
    mutationFn: ask,
    retry: false,
    // Online only, never queued: a push that went out minutes after the tap
    // would ask a guest who has since sat down.
    networkMode: 'always' as const,
    onSuccess: (result: AskOnMyWayResult) => afterAskOnMyWay(queryClient, branchId, result),
    onError: () => afterAskOnMyWay(queryClient, branchId, null),
  };
}

/**
 * "Ask: are you coming?" (2026-10-22). Takes the reservation id. Enable it
 * with `askOnMyWayBlock`; errors: `AskOnMyWayTooEarlyError`,
 * `AskOnMyWayNotOpenError`, `GuestAlreadyAnsweredError`,
 * `AskOnMyWayAskedRecentlyError` (its `nextAllowedAtUtc`). `notified: false`
 * on the answer means nobody can be pushed: call.
 */
export function useAskOnMyWay(branchId: string | undefined) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation(
    askOnMyWayOptions(queryClient, branchId ?? '', (reservationId) =>
      gateway.askOnMyWay(reservationId),
    ),
  );
}

// --- The console ------------------------------------------------------------------

/** The branch's pre-order settings. Reference data; read once per visit. */
export function usePreOrderSettings(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.preOrderSettings(branchId ?? ''),
    queryFn: () => gateway.getPreOrderSettings(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * What one surface changes in the branch's settings: the rest is taken as the
 * server has it now. The Policy card changes the switch and the minutes, a
 * dish's row its own exclusion.
 */
export type PreOrderSettingsChange = (fresh: PreOrderSettings) => PreOrderSettingsInput;

function refusedDishList(error: unknown): boolean {
  return (
    error instanceof ValidationError &&
    error.violations.some((violation) => violation.field === 'excludedMenuItemIds')
  );
}

/**
 * The save, against the settings as the server has them **now**.
 *
 * The PUT carries all three and no version, and both writers build it from a
 * cache that can be minutes old: a manager switching a dish off would put back
 * the minutes another manager just changed (review S6). So the settings are
 * read again right before the PUT and only the surface's own field is changed
 * on that — the window shrinks from minutes to the read's round trip. The
 * backend has no version to send; none is invented here.
 *
 * A dish in the list that is no longer on the menu (deleted since, here or in
 * another tab) is refused 422 `excludedMenuItemIds`, and would be on every
 * save after it (review S5). Then the settings and the menu are read again and
 * the save is tried once more, with only dishes still on the menu. Once: a
 * second refusal is the answer.
 */
export async function savePreOrderSettingsFresh(
  queryClient: QueryClient,
  gateway: ConsoleGateway,
  branchId: string,
  change: PreOrderSettingsChange,
): Promise<PreOrderSettings> {
  const read = () =>
    queryClient.fetchQuery({
      queryKey: queryKeys.preOrderSettings(branchId),
      queryFn: () => gateway.getPreOrderSettings(branchId),
      staleTime: 0,
    });
  // The three fields and nothing else: a change may hand back the read whole.
  const save = ({ acceptsPreOrders, minutesBefore, excludedMenuItemIds }: PreOrderSettingsInput) =>
    gateway.savePreOrderSettings({
      branchId,
      settings: { acceptsPreOrders, minutesBefore, excludedMenuItemIds },
    });

  try {
    return await save(change(await read()));
  } catch (error) {
    if (!refusedDishList(error)) throw error;
    const [fresh, menu] = await Promise.all([
      read(),
      queryClient.fetchQuery({
        queryKey: queryKeys.adminMenu(branchId),
        queryFn: () => gateway.getAdminMenu(branchId),
        staleTime: 0,
      }),
    ]);
    const onMenu = new Set(menu.flatMap((category) => category.items.map((item) => item.id)));
    const next = change(fresh);
    return save({
      ...next,
      excludedMenuItemIds: next.excludedMenuItemIds.filter((id) => onMenu.has(id)),
    });
  }
}

/**
 * Save all three, read fresh first ({@link savePreOrderSettingsFresh}): the
 * mutation takes what this surface changes, not a body. A 422 names
 * `minutesBefore` or `excludedMenuItemIds` (`ValidationError`); on any
 * failure the settings are read again, so the screen shows the server's.
 */
export function useSavePreOrderSettings(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: PreOrderSettingsChange) =>
      savePreOrderSettingsFresh(queryClient, gateway, branchId!, change),
    retry: false,
    onSuccess: (settings: PreOrderSettings) =>
      afterPreOrderSettingsSaved(queryClient, branchId ?? '', settings),
    onError: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.preOrderSettings(branchId ?? ''),
      }),
  });
}
