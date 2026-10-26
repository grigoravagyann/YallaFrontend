import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffFloor } from '../contracts/service';
import type {
  AbandonTabCommand,
  CompCommand,
  OpenTabForStaffCommand,
  ReassignHostCommand,
  RecordCashPaymentCommand,
  StaffTab,
  VoidLineCommand,
  VoidOrderCommand,
} from '../contracts/ordering';
import type { Menu } from '../contracts/menu';
import {
  APPROVAL_POLL_MS,
  type ConsoleBooking,
  type DecideReservationCommand,
} from '../contracts/approvals';
import type { AdmitTabCommand, RejectTabCommand } from '../contracts/admission';
import type { ReleaseReservationCommand, UndoNoShowCommand } from '../staffGateway';
import type { StaffGateway } from '../staffGateway';
import { staleTime } from '../queryClient';
import { useStaffGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- The counter screen ------------------------------------------------------

/**
 * The room, as staff see it.
 *
 * No `refetchInterval` here: polling belongs to the `LiveStream`, which knows
 * about sequences, visibility and gaps. Two independent pollers would fight
 * over the same cache entry, and neither would be the one the screen is
 * reasoning about.
 */
/**
 * The staff floor. `enabled: false` pauses it and keeps what it last read —
 * the tablet locks over a floor that stays mounted, and a query keyed on no
 * branch would have nothing to show under the gate but a failure.
 */
export function useStaffFloor(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffFloor(branchId ?? ''),
    queryFn: () => gateway.getFloor(branchId!),
    enabled: Boolean(branchId) && enabled,
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

/**
 * Bookings waiting for somebody on the floor to answer.
 *
 * Polled every ten seconds, and **in the background too**, unlike the order
 * queue. A short-notice booking is declined by itself fifteen minutes after
 * it arrives, and the chime that announces a new one is for the waiter who is
 * not looking at the tablet — a poll that stops when the tab is hidden would
 * let the window run out in silence.
 */
export function useAwaitingApproval(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.awaitingApproval(branchId ?? ''),
    queryFn: () => gateway.listAwaitingApproval(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: APPROVAL_POLL_MS,
    refetchIntervalInBackground: true,
  });
}

/**
 * The floor's two answers. Never retried, and the list and the floor are read
 * again on *settle*: a 409 means somebody else answered first or the window
 * closed, and the list on screen is what is stale. The floor because an
 * approved booking now holds its table.
 */
function useFloorDecision(
  branchId: string | undefined,
  decide: (gateway: StaffGateway, command: DecideReservationCommand) => Promise<ConsoleBooking>,
) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: DecideReservationCommand) => decide(gateway, command),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.awaitingApproval(branchId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
    },
  });
}

export function useFloorApproveReservation(branchId: string | undefined) {
  return useFloorDecision(branchId, (gateway, command) => gateway.approveReservation(command));
}

export function useFloorRejectReservation(branchId: string | undefined) {
  return useFloorDecision(branchId, (gateway, command) => gateway.rejectReservation(command));
}

export interface UseStaffMenuOptions {
  /**
   * Re-read on a timer, foreground only. The kitchen board warns about each
   * dish's allergens from this menu, and a pass tablet on a stand never gets
   * a window focus to refresh it by (FT4 review S4).
   */
  readonly refetchIntervalMs?: number | undefined;
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
    ...(options.refetchIntervalMs
      ? { refetchInterval: options.refetchIntervalMs, refetchIntervalInBackground: false }
      : {}),
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

/**
 * What a whole-order void reads again: the lines, the totals (two queries, as
 * for a line's void) and the kitchen queue the order has left. Also after a
 * refusal — the bill was paid, or the order moved on — because either means
 * the tab on screen is out of date.
 */
export function afterOrderVoid(
  queryClient: QueryClient,
  command: Pick<VoidOrderCommand, 'branchId' | 'tabId'>,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tabLines(command.tabId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(command.tabId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(command.branchId) });
}

/**
 * Void a whole order on a tab (the server voids its lines with it). Nothing
 * optimistic, as a line's void: the tab is read again once the server answers.
 * Never retried, and never queued offline: it changes what is owed.
 */
export function useVoidOrder() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, clientCommandId }: VoidOrderCommand) =>
      gateway.setOrderStatus({ orderId, status: 'voided', clientCommandId }),
    retry: false,
    onSettled: (_order, _error, command) => afterOrderVoid(queryClient, command),
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

/**
 * Staff open the tab on a seated table for a party that is not going to scan.
 *
 * The floor is what the tablet finds a tab through — `openTabId` on the table —
 * so it is refetched before the mutation settles, and the panel that asked
 * shows "Take an order" the moment the spinner stops.
 */
export function useOpenTabForStaff() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: OpenTabForStaffCommand) => gateway.openTabForStaff(command),
    retry: false,
    onSuccess: async (tab, command) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
      await queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(command.branchId) });
    },
  });
}

/**
 * The tables waiting for a waiter to let them order, oldest first.
 *
 * Not polled on a clock of its own: the floor's change stream carries a
 * `signal` on every scan that waits, admit and reject, and the floor reads this
 * again on any of them (and on a resync) — so a new card arrives within a poll
 * of the stream, for one request. The interval here is only the backstop for a
 * stream that is not running, and pauses in the background.
 */
export function useTabsAwaitingAdmission(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.tabsAwaitingAdmission(branchId ?? ''),
    queryFn: () => gateway.listTabsAwaitingAdmission(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Admit and Reject. Never retried and never queued — online only, as the
 * server requires; a lost answer is retried by the waiter under the same
 * command id, which answers the tab as it stands. The list, the floor and the
 * tab are read again on *settle*: a 409 means somebody else decided first,
 * and the list on screen is what is stale. The calls too, on a reject, which
 * answers the tab's open calls.
 */
function useAdmissionDecision<C extends { readonly tabId: string }>(
  branchId: string | undefined,
  decide: (gateway: StaffGateway, command: C) => Promise<StaffTab>,
) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: C) => decide(gateway, command),
    retry: false,
    onSuccess: (tab) => {
      queryClient.setQueryData(queryKeys.staffTab(tab.id), tab);
      // The table's flag on the floor already on screen. Not a floor read: the
      // change stream brings the decision's own row (with any status it
      // changed) within a poll, and folds it in (UG review S9).
      queryClient.setQueryData<StaffFloor | null>(queryKeys.staffFloor(branchId ?? ''), (floor) =>
        floor
          ? {
              ...floor,
              details: floor.details.map((detail) =>
                detail.openTabId === tab.id
                  ? { ...detail, openTabAwaitingAdmission: false }
                  : detail,
              ),
            }
          : floor,
      );
    },
    onSettled: (_tab, _error, command) => {
      const branch = branchId ?? '';
      void queryClient.invalidateQueries({ queryKey: queryKeys.tabsAwaitingAdmission(branch) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branch) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(command.tabId) });
    },
  });
}

export function useAdmitTab(branchId: string | undefined) {
  return useAdmissionDecision(branchId, (gateway, command: AdmitTabCommand) =>
    gateway.admitTab(command),
  );
}

export function useRejectTab(branchId: string | undefined) {
  return useAdmissionDecision(branchId, (gateway, command: RejectTabCommand) =>
    gateway.rejectTab(command),
  );
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
/**
 * Undo a no-show marked by mistake (until 05:00 the next morning). Online
 * only and never retried; the floor and the awaiting list are read again.
 */
export function useUndoNoShow(branchId: string | undefined) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: UndoNoShowCommand) => gateway.undoNoShow(command),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.awaitingApproval(branchId ?? '') });
    },
  });
}

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
