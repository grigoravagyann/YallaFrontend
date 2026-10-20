import {
  ApiError,
  LineAlreadyPaidError,
  isOffline,
  TableNotSeatedError,
  isPaymentExceedsRemaining,
  ReservationNotStartedError,
  newCommandId,
  noShowUndoableUntil,
  tableDetail,
  type AdjustmentKind,
  type AffectedReservation,
  type EnrolledDevice,
  type FloorTable,
  type OrderQueueEntry,
  type OrderStatus,
  type PlaceOrderLine,
  type ReleaseOutcome,
  type ServiceRequest,
  type StaffFloor,
  type StaffSessionIdentity,
  type TabLine,
  type TableActionKind,
  type TableActionResult,
  type VoidReason,
} from '@yalla/api';
import {
  isOfflinePaused,
  queryKeys,
  useAbandonTab,
  useAwaitingApproval,
  useBeginClosing,
  useCompLine,
  useOpenTabForStaff,
  useOrderQueue,
  useRecordCashPayment,
  useReleaseReservation,
  useServiceRequests,
  useStaffFloor,
  useStaffGateway,
  useStaffTab,
  useNow,
  useTabsAwaitingAdmission,
  useVoidLine,
} from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryFailureNotice } from '../components/QueryFailureNotice';
import {
  AdmissionSection,
  wasHeldForLateParty,
  type AdmissionOutcome,
  type AdmissionSubject,
} from './AdmissionPanel';
import { ApprovalPanel, useRequestArrivals } from './ApprovalPanel';
import { branchToday, decidedNotice } from './approvalRequests';
import { primeChime } from './chime';
import { ConflictList } from './ConflictList';
import { useCommandQueue } from './commands/useCommandQueue';
import type { CommandRefusal, NewCommand, OrderRefusal, QueuedCommand } from './commands/types';
import { applyFloorChanges } from './live/sequence';
import { createPollingLiveStream } from './live/stream';
import { FloorRail, type UnresolvedTab } from './FloorRail';
import type { CashOutcome } from './CashKeypad';
import { OrderEntry, type OrderSent } from './OrderEntry';
import { ageOrders, projectOrders } from './kitchenBoard';
import { useMinuteClock } from './useMinuteClock';
import { useBehindHeldNotice, useCancelReadsWhileLocked, useHeldMarks } from './useHandover';
import { kitchenWaiting, OrderQueuePanel } from './OrderQueuePanel';
import { StaffHeader, type StaffView } from './StaffHeader';
import { TableActionPanel } from './TableActionPanel';
import { tableCardText } from './tableCard';
import { TableList } from './TableList';
import { TabPanel } from './TabPanel';
import { useBranchFormat } from './useBranchFormat';
import { useCachedMenu } from './useCachedMenu';
import { useConnectionState } from './useConnectionState';
import { UndoNoShowNotice, type UndoableNoShow } from './UndoNoShowNotice';

/**
 * The floor screen: the whole product, on a counter.
 *
 * Used standing up, during a Friday rush, by a nineteen-year-old with ten
 * minutes of training, on a tablet, sometimes in daylight. Every layout decision
 * below follows from that and not from taste:
 *
 * - **Everything is one tap from the floor.** The floor is a grid of tables,
 *   filtered by room; the action panel opens over it for the tapped table;
 *   order entry and the tab open over the floor and close back to it. Beside
 *   it, the "Now" rail holds whatever a person is waiting on. There are no
 *   nested menus, because a waiter carrying two plates cannot find their way
 *   back from a third screen. The one other screen is the kitchen board, a tab
 *   in the top bar, and the floor keeps its state while it shows.
 * - **Landscape tablet only** (floor-tablet HANDOFF §3).
 * - **Offline is a state the header shows, never an error the floor shows.** The
 *   last floor loaded stays on screen with pending work marked on it.
 *
 * The branch comes from the staff session, never from a route parameter. A
 * waiter has exactly one branch and no way to name another.
 */
export interface FloorRouteProps {
  readonly identity: StaffSessionIdentity;
  /** What the tablet is enrolled to: the venue's name for the top bar. Null on the mock. */
  readonly device?: EnrolledDevice | null | undefined;
  /**
   * The tablet is locked and the PIN screen is over this one.
   *
   * The tree stays mounted — a half-entered order is React state in here, and
   * losing it every time somebody put the tablet down is how locking gets
   * turned off — but it stops talking: no queries, no live stream, no replay,
   * because there is no session token behind any of them.
   */
  readonly paused: boolean;
}

/** The table key an unresolved tab is filed under. Never a real table id. */
const UNRESOLVED_KEY = '__unresolved__';

interface Selection {
  readonly tableId: string;
}

interface Notice {
  readonly kind: 'race' | 'warning' | 'info';
  readonly text: string;
  /** What a table action was sent to do — not yet what the server did. */
  readonly acted?: boolean;
  /** A no-show just marked: the notice offers to undo it (`UndoNoShowNotice`). */
  readonly undo?: UndoableNoShow;
  /**
   * A booking at this table was cancelled by its guest's no-show block
   * (change-stream signal 4): worded when shown, as the stream's handler has
   * no translations of its own.
   */
  readonly blockCancelledAt?: string;
}

/** How long a notice stays: long enough to read at arm's length. */
const NOTICE_MS = 6_000;
/** A notice offering an undo stays longer: noticing the mistake takes a moment. */
const UNDO_NOTICE_MS = 15_000;

/**
 * An order's refusal as the order screen words it. A queued order is only
 * ever refused with its own reasons (`sync.ts`); anything else reads "other".
 */
function orderRefusalOf(refusal: CommandRefusal | undefined): OrderRefusal {
  return refusal && refusal.kind !== 'notFound' && refusal.kind !== 'forbidden'
    ? refusal
    : { kind: 'other' };
}

/** The minute an instant falls in, so a poll every few seconds re-renders once a minute. */
function minuteOf(at: number): number {
  return at - (at % 60_000);
}

export function FloorRoute({ identity, device = null, paused }: FloorRouteProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const queryClient = useQueryClient();
  const gateway = useStaffGateway();

  const branchId = identity.branchId;
  const active = !paused;
  // Paused, not dropped: under the PIN gate the last floor stays in the tree,
  // rather than a query keyed on nothing rendering a failure behind the gate.
  const floorQuery = useStaffFloor(branchId, active);
  const floor = floorQuery.data ?? null;
  const timeZoneId = floor?.plan.timeZoneId ?? 'Asia/Yerevan';
  const format = useBranchFormat(timeZoneId);

  const [view, setView] = useState<StaffView>('floor');
  /** The room chip that is on; null for every room. */
  const [room, setRoom] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [overlay, setOverlay] = useState<'none' | 'conflicts' | 'order' | 'tab'>('none');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  /**
   * The tab an overlay was opened on, held while it is open.
   *
   * The floor drops a tab the moment it is paid in full — the table stays
   * occupied with no tab — and the next floor read or change poll would blank
   * the bill, and its "paid" card, under the waiter's hands. Only that gap is
   * filled: while the floor names a tab for the table, that one is used.
   */
  const [overlayTabId, setOverlayTabId] = useState<string | null>(null);
  /**
   * The order just sent from order entry, while its confirmation is up. What
   * became of it is read off the queue, so the card follows it from "on its
   * way" (or "kept on the tablet") to "the kitchen has it" or "refused".
   */
  const [orderSend, setOrderSend] = useState<{
    readonly id: string;
    readonly count: number;
    readonly atUtc: string;
  } | null>(null);
  /** The tab overlay was opened from the table panel's "Take cash": keypad first. */
  const [cashFirst, setCashFirst] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unresolved, setUnresolved] = useState<readonly UnresolvedTab[]>([]);
  /**
   * The tab on a table that has since been freed.
   *
   * The floor's own `openTabId` is the source for everything else — it arrives
   * on a cold read now — but a freed table has no tab id and the money is still
   * owed, so the "needs resolving" list keeps its own.
   */
  const [unresolvedTabId, setUnresolvedTabId] = useState<string | null>(null);
  /** Bookings stranded by a table going out of service, per table. */
  const [affected, setAffected] = useState<ReadonlyMap<string, readonly AffectedReservation[]>>(
    new Map(),
  );
  /** The last cash refusal, with the balance the server reported. */
  const [cashRefusal, setCashRefusal] = useState<{
    tabId: string;
    remainingDram: number;
    requestedDram: number;
  } | null>(null);
  /**
   * Bill requests this device answered "On my way" to, by request id.
   *
   * The branch's request list drops a request once it is acknowledged, but
   * that is the moment the waiter sets off with the bill — the amount and the
   * tip the table asked for are needed at the table, not before. So they are
   * kept here until cash is taken against them. By request, not by tab: two
   * people at one table can each have asked.
   */
  const [acknowledgedBills, setAcknowledgedBills] = useState<ReadonlyMap<string, ServiceRequest>>(
    new Map(),
  );
  /** Bill requests cash has been recorded against on this device: handled. */
  const [settledBillIds, setSettledBillIds] = useState<ReadonlySet<string>>(new Set());

  // --- Commands -------------------------------------------------------------

  const onApplied = useCallback(
    (result: TableActionResult) => {
      // A freed table with money owed. The table is freed anyway — the diners
      // have left — and the tab surfaces here so it is not simply lost.
      if (result.outstandingDram !== null && result.outstandingDram > 0 && result.tabId) {
        const tabId = result.tabId;
        setUnresolved((current) =>
          current.some((entry) => entry.tabId === tabId)
            ? current
            : [
                ...current,
                {
                  tabId,
                  tableId: result.tableId,
                  tableLabel: result.tableLabel,
                  amountDram: result.outstandingDram!,
                },
              ],
        );
      }

      // Bookings this table still had. Kept against the table so the panel can
      // show them the next time it is opened, and never cancelled here.
      if (result.affectedReservations.length > 0) {
        setAffected((current) => new Map(current).set(result.tableId, result.affectedReservations));
      }

      // Warnings accompany a success and never block it. Surfaced after the
      // fact because the action has already happened and the waiter chose it.
      const warning = result.warnings[0];
      if (warning) {
        setNotice({
          kind: 'warning',
          text:
            warning.code === 'outstanding-balance' && result.outstandingDram !== null
              ? t('notice.freedWithBalance', {
                  label: result.tableLabel,
                  amount: format.dram(result.outstandingDram),
                })
              : warning.code === 'upcoming-reservation'
                ? t('notice.seatedOverBooking', { label: result.tableLabel })
                : warning.message,
        });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
    },
    [branchId, format, queryClient, t],
  );

  const onLiveRace = useCallback(
    (entry: Parameters<NonNullable<Parameters<typeof useCommandQueue>[0]['onLiveRace']>>[0]) => {
      const label = entry.observed?.tableLabel || entry.command.subject.tableLabel || '';
      // Brief and specific, and the floor redraws behind it. Not a crash
      // screen, not a retry: this is a normal Friday.
      setNotice({
        kind: 'race',
        text: entry.observed?.changedBy
          ? t('notice.raceNamed', { label, name: entry.observed.changedBy })
          : t('notice.race', { label }),
      });
      setSelection(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
    },
    [branchId, queryClient, t],
  );

  /**
   * A command landed. Refetch whatever list it belongs in.
   *
   * Keyed off the command rather than off a timer, so an order placed offline
   * appears in the panel the moment it actually reaches the kitchen and not a
   * poll interval later.
   */
  const onSettled = useCallback(
    (command: QueuedCommand) => {
      if (command.kind === 'placeOrder' || command.kind === 'setOrderStatus') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
        if (command.subject.tabId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.staffTab(command.subject.tabId),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.tabLines(command.subject.tabId),
          });
        }
      }
      if (command.kind === 'acknowledgeServiceRequest') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branchId) });
      }
    },
    [branchId, queryClient],
  );

  // Who is signed in: stamped on every command, and the person whose queued
  // commands are sent (`commands/conflictPolicy.ts`).
  const actor = useMemo(
    () => ({ staffMemberId: identity.staffMemberId, name: identity.fullName }),
    [identity.staffMemberId, identity.fullName],
  );
  const queue = useCommandQueue({
    gateway,
    floor,
    onApplied,
    onLiveRace,
    onSettled,
    enabled: active,
    actor,
  });
  const heldMarks = useHeldMarks(queue);
  useBehindHeldNotice(queue, identity.staffMemberId, (command, name) =>
    setNotice({
      kind: 'warning',
      text: t('notice.behindHeld', { label: command.subject.tableLabel ?? '', name }),
    }),
  );
  useCancelReadsWhileLocked(paused, branchId);

  // --- Live updates ---------------------------------------------------------

  /**
   * Whether the change stream's last poll reached the server. The floor query
   * is the other half of the answer: a resync is a request *it* makes, so its
   * own outcome is read directly when the chip is computed below.
   */
  const [streamFailing, setStreamFailing] = useState(false);
  /** The minute the change stream last answered: the chip's "Live · 18:42". */
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  /**
   * The exact instant of the last answer, kept without a render per poll, and
   * copied out when the polls start failing: "the data is N min old" counted
   * from the minute it was floored to said "1 min" four seconds in.
   */
  const lastAnswer = useRef<number | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);

  useEffect(() => {
    if (!branchId || !active) return;

    const stream = createPollingLiveStream({
      gateway,
      branchId,
      handlers: {
        onChanges: (changes) => {
          lastAnswer.current = Date.now();
          setStreamFailing(false);
          setStaleSince(null);
          setAnsweredAt(minuteOf(lastAnswer.current));
          // Fold in incrementally; a gap, an unknown table, or a change whose
          // drawn state cannot be derived falls through to a full refetch
          // rather than being patched around.
          const current = queryClient.getQueryData<StaffFloor | null>(
            queryKeys.staffFloor(branchId),
          );
          if (!current) return;
          // A scan waiting to be let in, admitted or turned away: the rail's
          // list is read again, and the tab it names — the table itself is
          // folded in below, never a whole-floor read (review S9: a flood of
          // phantom scans must not cost every tablet a floor read each).
          const signalled = changes.filter((change) => change.signal);
          if (signalled.length > 0) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.tabsAwaitingAdmission(branchId),
            });
            // A booking cancelled by its guest's no-show block may have been
            // waiting for an answer here: the card goes with it.
            const blockCancelled = signalled.find(
              (change) => change.signal === 'bookingCancelledByBlock',
            );
            if (blockCancelled) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.awaitingApproval(branchId),
              });
              // Said once, briefly: the next booking here is gone.
              setNotice({ kind: 'info', text: '', blockCancelledAt: blockCancelled.tableLabel });
            }
            for (const change of signalled) {
              if (change.tabId) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(change.tabId) });
              }
            }
          }
          const result = applyFloorChanges(current, changes);
          if (result.kind === 'applied') {
            queryClient.setQueryData(queryKeys.staffFloor(branchId), result.floor);
            stream.setSequence(result.floor.lastSequence);
          } else if (result.kind === 'gap') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
          }
        },
        onResync: () => {
          lastAnswer.current = Date.now();
          setStreamFailing(false);
          setStaleSince(null);
          setAnsweredAt(minuteOf(lastAnswer.current));
          // The floor read again, and the stream goes on from the sequence it
          // answered at: without it the stream stays at 0, never reads a
          // change, and asks for the whole floor on every poll (guest record
          // QA, 2026-10-20 — the signals never reached the tablet).
          void queryClient
            .invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) })
            .then(() => {
              const floor = queryClient.getQueryData<StaffFloor | null>(
                queryKeys.staffFloor(branchId),
              );
              if (floor) stream.setSequence(floor.lastSequence);
            });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.tabsAwaitingAdmission(branchId),
          });
        },
        onError: () => {
          // Reported through the header's chip, which is the one place a
          // waiter looks; a toast per poll would be noise on a screen nobody
          // can dismiss things on.
          setStreamFailing(true);
          setStaleSince((since) => since ?? lastAnswer.current);
        },
      },
    });

    stream.start();

    const onVisibility = () => {
      stream.setForeground(document.visibilityState === 'visible');
    };
    const onOnline = () => stream.refresh();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      stream.stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [active, branchId, gateway, queryClient]);

  // A notice is transient. It stays long enough to read at arm's length and
  // then goes, because nothing on this screen should need dismissing.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(
      () => setNotice(null),
      notice.undo ? UNDO_NOTICE_MS : NOTICE_MS,
    );
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [notice]);

  // A refusal lands in the conflicts chip. A "seated" toast still up beside it
  // would claim what the server just refused, so it goes.
  const conflictCount = queue.state.conflicts.length;
  const seenConflicts = useRef(conflictCount);
  useEffect(() => {
    if (conflictCount > seenConflicts.current) {
      setNotice((current) => (current?.acted ? null : current));
    }
    seenConflicts.current = conflictCount;
  }, [conflictCount]);

  // --- Panels ---------------------------------------------------------------

  const overlayFloor = queue.overlay(floor);
  const plan = overlayFloor?.plan ?? floor?.plan ?? null;
  const pendingTableIds = overlayFloor?.pendingTableIds ?? new Set<string>();

  const selectedTable: FloorTable | undefined = plan?.tables.find(
    (table) => table.id === selection?.tableId,
  );
  const selectedDetail = tableDetail(floor, selection?.tableId);
  const panelOpen = Boolean(selection && selectedTable);

  /**
   * The tab the overlays are looking at.
   *
   * Straight off the floor read since Backend 8b. The previous version learned
   * tab ids only from transition results, so a tab this device had not itself
   * opened was invisible until somebody seated the table again; that workaround
   * is gone.
   */
  const floorTabId =
    activeTableId === UNRESOLVED_KEY
      ? unresolvedTabId
      : (tableDetail(floor, activeTableId)?.openTabId ?? null);
  // The floor's tab while it lists one — a new tab opened on the table while
  // the overlay is up is the one to act on — and the pinned one once the floor
  // drops it on payment.
  const activeTabId =
    overlay === 'tab' || overlay === 'order' ? (floorTabId ?? overlayTabId) : floorTabId;
  const activePartySize =
    activeTableId === UNRESOLVED_KEY
      ? null
      : (tableDetail(floor, activeTableId)?.partySize ?? null);

  // The tab with its lines and adjustments: one read, one moment.
  const tabQuery = useStaffTab(active ? activeTabId : null);

  /**
   * The menu, from disk first and the network second.
   *
   * Not fetched when order entry opens. A query the browser cannot send is
   * *paused*, not failed, so a waiter who opens order entry after the wifi
   * drops would get a grid that never resolves — and on a tablet that was
   * rebooted offline there would be nothing in memory to fall back to either.
   */
  const menu = useCachedMenu(branchId, active);
  const minute = useMinuteClock();

  const ordersQuery = useOrderQueue(branchId, active);
  const requestsQuery = useServiceRequests(branchId, active);
  /** Bookings waiting for somebody here to say yes or no. Polled, chimed. */
  const awaitingQuery = useAwaitingApproval(branchId, active);
  const awaiting = useRequestArrivals(awaitingQuery.data, timeZoneId);
  /** Tables that scanned with no verified number, waiting to be let in. */
  const admissionQuery = useTabsAwaitingAdmission(branchId, active);
  const waitingTables = useMemo(() => admissionQuery.data ?? [], [admissionQuery.data]);

  // Browsers allow sound only after a gesture, and suspend it again when the
  // tablet sleeps or the tab is hidden. Every tap on the floor wakes the
  // chime — not only the first — so the next request is heard, not only seen.
  useEffect(() => {
    const wake = () => primeChime();
    document.addEventListener('pointerdown', wake);
    return () => document.removeEventListener('pointerdown', wake);
  }, []);

  const voidLine = useVoidLine();
  const compLine = useCompLine();
  const abandonTab = useAbandonTab();
  const recordCash = useRecordCashPayment();
  const beginClosing = useBeginClosing();
  const releaseReservation = useReleaseReservation(branchId);
  const openTabForStaff = useOpenTabForStaff();

  const selectedTabId = selectedDetail?.openTabId ?? null;
  const selectedTabQuery = useStaffTab(active ? selectedTabId : null);
  /** The clock a late booking is judged by (whether the scan took a held table). */
  const clockMs = useNow(30_000).getTime();

  /**
   * The selected table's tab, when it waits to be let in: from the rail's list
   * (which knows whether rejecting frees the table), or from the floor's own
   * flag before the list has caught up.
   */
  const selectedAdmission = useMemo((): AdmissionSubject | null => {
    if (!selection) return null;
    const listed = waitingTables.find((entry) => entry.tableId === selection.tableId);
    const held = wasHeldForLateParty(selectedDetail ?? undefined, clockMs);
    if (listed) return { ...listed, heldForLateParty: held };
    if (!selectedDetail?.openTabAwaitingAdmission || !selectedTabId) return null;
    return {
      tabId: selectedTabId,
      tableLabel: selectedDetail.label,
      sittingSeatedByScan: null,
      heldForLateParty: held,
    };
  }, [selection, selectedDetail, selectedTabId, waitingTables, clockMs]);
  /** Whether a waiting table was held for a late booking before the scan took it. */
  const heldForLateParty = useCallback(
    (tableId: string) =>
      wasHeldForLateParty(
        floorQuery.data?.details.find((detail) => detail.tableId === tableId),
        clockMs,
      ),
    [floorQuery.data, clockMs],
  );

  const admissionDecided = useCallback(
    (outcome: AdmissionOutcome) =>
      setNotice({
        kind: 'info',
        text:
          outcome.kind === 'admitted'
            ? t('admission.admittedNotice', { label: outcome.tableLabel })
            : outcome.heldAgain
              ? t('admission.rejectedHeldNotice', { label: outcome.tableLabel })
              : outcome.tableFreed
                ? t('admission.rejectedFreedNotice', { label: outcome.tableLabel })
                : t('admission.rejectedNotice', { label: outcome.tableLabel }),
      }),
    [t],
  );

  // --- Acting ---------------------------------------------------------------

  /**
   * An unresolved tab has no table any more — it was freed — but the money is
   * still owed, so the panel has to be openable from the tab id alone. Filed
   * under a key that cannot collide with a real table id.
   */
  const settleUnresolved = useCallback((tabId: string) => {
    setUnresolvedTabId(tabId);
    setOverlayTabId(tabId);
    setActiveTableId(UNRESOLVED_KEY);
    setCashFirst(false);
    setOverlay('tab');
  }, []);

  const act = useCallback(
    (kind: TableActionKind, input?: { partySize?: number }) => {
      if (!branchId || !selection) return;
      const detail = tableDetail(floor, selection.tableId);
      const table = plan?.tables.find((candidate) => candidate.id === selection.tableId);

      // One id per tap, reused on every retry. Generated here and nowhere else.
      const clientCommandId = newCommandId();

      // The precondition is the status the table will be in once everything
      // already queued for it has been applied — not the status the server last
      // reported, which a queued seat may already have superseded.
      const expected = queue.projected(selection.tableId) ?? detail?.physicalStatus ?? 'free';

      /**
       * The version is only sent when the queue has nothing else pending for
       * this table.
       *
       * A version captured from the floor describes the table *before* the
       * commands ahead of this one land, and each of those changes it. Sending
       * it would refuse a chain the waiter deliberately built — seat, then free
       * — as though the table had been used by somebody else. The status
       * projection above handles the chain; the version guards the case it
       * cannot, which is the single unqueued tap.
       */
      const chained = queue.projected(selection.tableId) !== (detail?.physicalStatus ?? null);
      const rowVersion = chained ? null : (detail?.rowVersion ?? null);

      const command: NewCommand = {
        id: clientCommandId,
        scope: selection.tableId,
        precondition: { expectedFromStatus: expected, rowVersion },
        subject: {
          tableId: selection.tableId,
          tableLabel: table?.label ?? null,
          tabId: selectedTabId,
        },
        body: {
          kind,
          command: {
            kind,
            branchId,
            tableId: selection.tableId,
            clientCommandId,
            ...(input?.partySize !== undefined ? { partySize: input.partySize } : {}),
            ...(kind === 'seatHeldParty' && detail?.nextReservationId
              ? { reservationId: detail.nextReservationId }
              : {}),
            ...(kind === 'seatReservation' && detail?.nextReservationId
              ? { reservationId: detail.nextReservationId }
              : {}),
          },
        },
      };

      queue.enqueue(command);
      queue.sync();
      setSelection(null);

      const label = table?.label ?? '';
      const done = actedNotice(
        t,
        kind,
        label,
        input?.partySize ?? detail?.nextReservationPartySize,
      );
      if (done) {
        setNotice({
          kind: 'info',
          // Offline it is on the tablet, not on the server: said, so nobody
          // expects the kitchen or the other tablet to know yet.
          text: queue.online ? done : t('notice.acted.queued', { text: done }),
          acted: true,
        });
      }
    },
    [branchId, floor, plan, queue, selection, selectedTabId, t],
  );

  const release = useCallback(
    (reservationId: string, outcome: ReleaseOutcome) => {
      // When the booking was due, read before the release takes it off the floor.
      const startUtc =
        floor?.details.find((detail) => detail.nextReservationId === reservationId)
          ?.nextReservationStartUtc ?? null;
      releaseReservation.mutate(
        { reservationId, outcome, clientCommandId: newCommandId() },
        {
          onSuccess: (result) => {
            // A no-show marked by mistake can be undone until 05:00 the next
            // morning: offered while that holds on this clock, and the server
            // has the last word. Not on a replay's other outcome.
            const undoable =
              result.outcome === 'noShow' &&
              (startUtc === null ||
                Date.now() < noShowUndoableUntil(startUtc, timeZoneId).getTime());
            setNotice({
              kind: 'info',
              // The server says whether it counted, rather than the button
              // being trusted to remember which one it was.
              text: result.countsTowardNoShowThreshold
                ? t('notice.releasedNoShow', { label: result.tableLabel })
                : t('notice.releasedCancelled', { label: result.tableLabel }),
              ...(undoable
                ? { undo: { reservationId: result.reservationId, tableLabel: result.tableLabel } }
                : {}),
            });
            setAffected((current) => {
              const next = new Map(current);
              for (const [tableId, bookings] of current) {
                next.set(
                  tableId,
                  bookings.filter((booking) => booking.reservationId !== reservationId),
                );
              }
              return next;
            });
          },
          onError: (error) => {
            // Refused, so nothing changed: the panel's "let go" was optimistic
            // and goes with it, and the floor shows the table as it is.
            setSelection(null);
            if (error instanceof ReservationNotStartedError) {
              // Only a booking whose time has come can be a no-show; the hold
              // stays. Said with the time it is due (FT2 wire).
              const label =
                floor?.plan.tables.find(
                  (table) => tableDetail(floor, table.id)?.nextReservationId === reservationId,
                )?.label ?? '';
              setNotice({
                kind: 'warning',
                text: t('notice.releaseNotDue', {
                  label,
                  time: error.startUtc ? format.time(error.startUtc) : '—',
                }),
              });
              return;
            }
            setNotice({ kind: 'info', text: t('notice.releaseFailed') });
          },
        },
      );
    },
    [floor, format, releaseReservation, t, timeZoneId],
  );

  /**
   * A tab for the party that is not going to scan. The panel stays open: once
   * the floor refetch lands it shows "Take an order" in place of this button.
   */
  const startTab = useCallback(
    (tableId: string) => {
      if (!branchId) return;
      const tableLabel = floor?.plan.tables.find((table) => table.id === tableId)?.label ?? '';
      openTabForStaff.mutate(
        { branchId, tableId, clientCommandId: newCommandId() },
        {
          onSuccess: () =>
            setNotice({ kind: 'info', text: t('notice.tabStarted', { label: tableLabel }) }),
          onError: (error) =>
            setNotice({
              kind: 'info',
              text:
                error instanceof TableNotSeatedError
                  ? t('notice.tabNotSeated', { label: tableLabel })
                  : t('notice.startTabFailed'),
            }),
        },
      );
    },
    [branchId, floor, openTabForStaff, t],
  );

  const advanceOrder = useCallback(
    (order: OrderQueueEntry, next: OrderStatus) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        scope: order.tabId,
        precondition: null,
        // `KitchenOrderView` carries no table id. The label is what the rail
        // shows and what a conflict entry needs; a lookup by label could name
        // the wrong table, so there is deliberately no id here.
        subject: { tableId: null, tableLabel: order.tableLabel, tabId: order.tabId },
        body: {
          kind: 'setOrderStatus',
          command: { orderId: order.orderId, status: next, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
      if (next === 'served') {
        setNotice({
          kind: 'info',
          text: t('rail.ready.servedNotice', { label: order.tableLabel }),
        });
      }
      if (next === 'ready') {
        setNotice({
          kind: 'info',
          text: t(queue.online ? 'kitchen.readyNotice' : 'kitchen.readyQueued', {
            label: order.tableLabel,
          }),
        });
      }
    },
    [branchId, queryClient, queue, t],
  );

  /**
   * The staff acknowledgement, through the queue like every other command —
   * the same call "On my way" makes.
   */
  const sendAcknowledge = useCallback(
    (request: ServiceRequest) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        scope: request.tabId,
        precondition: null,
        subject: { tableId: null, tableLabel: request.tableLabel, tabId: request.tabId },
        body: {
          kind: 'acknowledgeServiceRequest',
          command: { requestId: request.id, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branchId) });
    },
    [branchId, queryClient, queue],
  );

  const acknowledge = useCallback(
    (request: ServiceRequest) => {
      if (request.reason === 'bill' && request.bill) {
        setAcknowledgedBills((current) => new Map(current).set(request.id, request));
      }
      sendAcknowledge(request);
      setNotice({
        kind: 'info',
        // Offline it waits in the queue: the guest has seen nothing yet.
        text: t(queue.online ? 'rail.calls.ackNotice' : 'rail.calls.ackQueued', {
          label: request.tableLabel,
        }),
      });
    },
    [queue.online, sendAcknowledge, t],
  );

  const submitOrder = useCallback(
    (lines: readonly PlaceOrderLine[]) => {
      if (!activeTabId) {
        // There is no way for a waiter to open a tab: `POST /api/tabs/open`
        // takes the QR token printed on the table. Said plainly rather than
        // queueing an order against a tab id that does not exist.
        setNotice({ kind: 'info', text: t('order.noTab') });
        return;
      }

      const clientCommandId = newCommandId();
      const count = lines.reduce((sum, line) => sum + line.quantity, 0);
      queue.enqueue({
        id: clientCommandId,
        scope: activeTabId,
        precondition: null,
        subject: {
          tableId: activeTableId,
          tableLabel: plan?.tables.find((table) => table.id === activeTableId)?.label ?? null,
          tabId: activeTabId,
          itemCount: count,
        },
        body: {
          kind: 'placeOrder',
          command: { tabId: activeTabId, clientCommandId, lines, shape: 2 },
        },
      });
      queue.sync();
      // Order entry stays up and says what became of it.
      setOrderSend({ id: clientCommandId, count, atUtc: new Date().toISOString() });
    },
    [activeTabId, activeTableId, plan, queue, t],
  );

  const orderSent = useMemo((): OrderSent | null => {
    if (!orderSend) return null;
    const conflict = queue.state.conflicts.find((entry) => entry.command.id === orderSend.id);
    const waiting = queue.state.queue.some((command) => command.id === orderSend.id);
    return {
      count: orderSend.count,
      atUtc: orderSend.atUtc,
      state: conflict ? 'refused' : waiting ? (queue.online ? 'sending' : 'saved') : 'sent',
      refusal: conflict ? orderRefusalOf(conflict.refusal) : null,
    };
  }, [orderSend, queue.state, queue.online]);

  const closeOverlay = useCallback(() => {
    setCashFirst(false);
    setOrderSend(null);
    setOverlay('none');
  }, []);

  // --- Render ---------------------------------------------------------------

  const offline = !queue.online;
  // The floor read is the poll that matters: every resync is one of its
  // fetches, and a failed one leaves `isError` set beside the data it kept.
  const state = useConnectionState({
    lastError: floorQuery.error,
    offline,
    polling: streamFailing || floorQuery.isError ? 'failing' : floorQuery.data ? 'ok' : 'unknown',
  });
  const branchName = floor?.plan.branchName ?? device?.branchName;
  const place = branchName
    ? device
      ? t('floor.branch', { venue: device.venueName, branch: branchName })
      : branchName
    : branchId
      ? t('admin:loading')
      : t('floor.noBranch');

  const unresolvedList = useMemo(
    () => unresolved.filter((entry) => entry.amountDram > 0),
    [unresolved],
  );

  /** What each freed table still owes, for its card. */
  const debts = useMemo(
    () => new Map(unresolvedList.map((entry) => [entry.tableId, entry.amountDram])),
    [unresolvedList],
  );

  const activeTabLabel = plan?.tables.find((table) => table.id === activeTableId)?.label ?? '';

  /**
   * The tab's bill requests with an amount on them — still unanswered in the
   * branch list, or answered from this device — and not yet paid against,
   * newest first.
   *
   * One per person: a new request from somebody replaces their earlier one
   * (the server drops the superseded one from its list; a copy this device
   * kept after "On my way" is dropped here the same way).
   */
  const billRequestsFor = useCallback(
    (tabId: string | null): readonly ServiceRequest[] => {
      if (!tabId) return [];
      const byId = new Map<string, ServiceRequest>();
      for (const request of [
        ...(requestsQuery.data ?? []).filter(
          (candidate) => candidate.tabId === tabId && candidate.reason === 'bill',
        ),
        ...[...acknowledgedBills.values()].filter((candidate) => candidate.tabId === tabId),
      ]) {
        if (request.bill !== null && !settledBillIds.has(request.id) && !byId.has(request.id)) {
          byId.set(request.id, request);
        }
      }
      const newestFirst = [...byId.values()].sort((a, b) =>
        b.requestedAtUtc.localeCompare(a.requestedAtUtc),
      );
      const seen = new Set<string>();
      return newestFirst.filter((request) => {
        const who = request.requestedByParticipantId;
        if (who === null) return true;
        if (seen.has(who)) return false;
        seen.add(who);
        return true;
      });
    },
    [acknowledgedBills, requestsQuery.data, settledBillIds],
  );
  const activeBillRequests = useMemo(
    () => billRequestsFor(activeTabId),
    [activeTabId, billRequestsFor],
  );

  /** "9 tables occupied · 34 guests", from the floor read. */
  const occupiedTables = plan?.tables.filter((table) => table.state === 'occupied') ?? [];
  const guests = occupiedTables.reduce(
    (sum, table) => sum + (tableDetail(floor, table.id)?.partySize ?? 0),
    0,
  );
  const summary = [
    t('rail.occupied', { count: occupiedTables.length }),
    guests > 0 ? t('floor.card.party', { count: guests }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // The board with this tablet's unsent moves applied and marked, as the
  // kitchen's own screen draws it.
  // Offline the last read's minutes would freeze; they carry on from it.
  const sinceRead = ordersQuery.dataUpdatedAt
    ? Math.max(0, Math.floor((minute.getTime() - ordersQuery.dataUpdatedAt) / 60_000))
    : 0;
  const board = projectOrders(ageOrders(ordersQuery.data ?? [], sinceRead), queue.state.queue);
  const orders = ordersQuery.data ?? [];
  const ordersLoading = ordersQuery.isLoading && !isOfflinePaused(ordersQuery);
  const ordersFailed = ordersQuery.isError || (isOfflinePaused(ordersQuery) && !ordersQuery.data);
  const now = new Date();

  return (
    <div className="floor" data-surface="staff">
      <StaffHeader
        title={view === 'kitchen' ? t('kitchen.title') : t('floor.title')}
        place={place}
        timeZoneId={timeZoneId}
        who={identity.fullName}
        state={state}
        updatedAt={
          Math.max(
            (streamFailing || floorQuery.isError ? staleSince : answeredAt) ?? 0,
            floorQuery.dataUpdatedAt,
          ) || null
        }
        // A command waiting for its person is not waiting to sync: it is on
        // the conflicts chip, and counted there alone.
        pending={queue.pending - queue.held.length}
        // Held commands need a decision too: whose name they go under.
        conflicts={queue.conflicts + queue.held.length}
        online={queue.online}
        onOpenConflicts={() => setOverlay('conflicts')}
        onRefresh={() => void floorQuery.refetch()}
        view={view}
        kitchenWaiting={kitchenWaiting(orders)}
        floorWaiting={
          (awaitingQuery.data?.length ?? 0) +
          waitingTables.length +
          (requestsQuery.data?.length ?? 0)
        }
        onSelectView={(next) => {
          setSelection(null);
          setView(next);
        }}
      />

      {/* Never over the PIN gate: a notice that lands as the tablet locks is
          somebody else's news, and the next person should not read it. */}
      {notice?.undo && !paused && branchId ? (
        <UndoNoShowNotice
          // A fresh one per no-show: a tap on the last one never carries over.
          key={notice.undo.reservationId}
          branchId={branchId}
          noShow={notice.undo}
          text={notice.text}
          online={queue.online}
          wide={view === 'kitchen'}
          timeZoneId={timeZoneId}
          onSettled={setNotice}
        />
      ) : notice && !paused ? (
        <p
          className={`floor-notice notice-${notice.kind}${view === 'kitchen' ? ' is-wide' : ''}`}
          role="status"
        >
          {notice.blockCancelledAt !== undefined
            ? t('notice.bookingCancelledByBlock', { label: notice.blockCancelledAt })
            : notice.text}
        </p>
      ) : null}

      {/* New booking requests, said once for a screen reader. Here rather than
          in the rail, so it is heard with the rail folded or the kitchen on
          screen; always in the tree, so a reader is listening before it speaks. */}
      <p className="visually-hidden" role="status" data-testid="approval-announcer">
        {awaiting.announcement}
      </p>

      {view === 'kitchen' ? (
        // The kitchen board as the kitchen sees it, from the floor's own queue
        // and orders. Quiet: the floor's chime is for bookings.
        <div className="kitchen-body">
          <OrderQueuePanel
            orders={board.orders}
            pendingOrderIds={board.pendingOrderIds}
            heldOrders={heldMarks.orders}
            onUnknownDish={menu.refetch}
            menu={menu.data}
            timeZoneId={timeZoneId}
            role={identity.role}
            onAdvance={advanceOrder}
            loading={ordersLoading}
            failed={ordersFailed}
          />
        </div>
      ) : null}

      {/* Hidden, not unmounted, while the kitchen shows: a half-typed decline,
          an answer in flight and its notice all live in here, and a trip to
          the kitchen must not cost any of them. */}
      <div className="ft-body" hidden={view === 'kitchen'} data-panel={panelOpen || undefined}>
        <section className="ft-floor" aria-label={t('floor.tables')}>
          {!branchId ? (
            <p className="floor-note">{t('floor.noBranch')}</p>
          ) : plan ? (
            <>
              <TableList
                tables={plan.tables}
                selectedTableId={selection?.tableId ?? null}
                pendingTableIds={pendingTableIds}
                heldTables={heldMarks.tables}
                onSelect={(tableId) => setSelection({ tableId })}
                room={room}
                onRoom={setRoom}
                describe={(table) => {
                  const debt = debts.get(table.id);
                  return tableCardText({
                    table,
                    detail: tableDetail(floor, table.id),
                    debt: debt ? format.dram(debt) : null,
                    now,
                    t,
                    time: format.time,
                    minutesSince: format.minutesSince,
                  });
                }}
              />
            </>
          ) : offline ? (
            <div className="floor-note">
              <QueryFailureNotice offline onRetry={() => void floorQuery.refetch()} />
            </div>
          ) : floorQuery.isLoading || paused ? (
            <p className="floor-note">{t('floor.loading')}</p>
          ) : (
            <div className="floor-note">
              <QueryFailureNotice
                error={floorQuery.error}
                onRetry={() => void floorQuery.refetch()}
              />
            </div>
          )}
        </section>

        {/* The table's panel takes the rail's place, as on the Table artboard;
            the rail stays mounted under it (hidden), so an answer in flight,
            a half-typed decline and the countdowns are all still there when
            the panel closes. */}
        {selection && selectedTable ? (
          <TableActionPanel
            // A fresh panel per table: a question opened, a reason picked or a
            // party counted on one table never carries over to the next.
            key={selection.tableId}
            table={selectedTable}
            detail={selectedDetail}
            timeZoneId={timeZoneId}
            projectedStatus={queue.projected(selection.tableId)}
            tab={selectedTabQuery.data ?? null}
            billRequest={billRequestsFor(selectedTabId)[0] ?? null}
            pending={pendingTableIds.has(selection.tableId)}
            online={queue.online}
            affectedReservations={affected.get(selection.tableId) ?? []}
            // The table read carries no guest record; the awaiting list does,
            // for a next booking that still waits for an answer.
            nextBookingRecord={
              awaitingQuery.data?.find(
                (request) => request.id === selectedDetail?.nextReservationId,
              )?.guestRecord ?? null
            }
            releasing={releaseReservation.isPending}
            onAct={act}
            onRelease={release}
            onOpenTab={() => {
              setActiveTableId(selection.tableId);
              setOverlayTabId(selectedTabId);
              setCashFirst(false);
              setOverlay('tab');
              setSelection(null);
            }}
            onCash={() => {
              setActiveTableId(selection.tableId);
              setOverlayTabId(selectedTabId);
              setCashFirst(true);
              setOverlay('tab');
              setSelection(null);
            }}
            admission={selectedAdmission}
            branchId={branchId}
            onAdmissionDecided={admissionDecided}
            onStartTab={() => startTab(selection.tableId)}
            startingTab={openTabForStaff.isPending}
            onOrder={() => {
              setActiveTableId(selection.tableId);
              setOverlayTabId(selectedTabId);
              setOverlay('order');
              setSelection(null);
            }}
            onClose={() => {
              const tableId = selection.tableId;
              setSelection(null);
              // Back to the card it was opened from, not the top of the page.
              document
                .querySelector<HTMLElement>(`.table-row[data-table-id="${CSS.escape(tableId)}"]`)
                ?.focus();
            }}
          />
        ) : null}

        <FloorRail
          hidden={panelOpen}
          summary={summary}
          requests={requestsQuery.data ?? []}
          requestsFailed={
            requestsQuery.isError || (isOfflinePaused(requestsQuery) && !requestsQuery.data)
          }
          requestsLoading={requestsQuery.isLoading && !isOfflinePaused(requestsQuery)}
          orders={orders}
          ordersLoading={ordersLoading}
          ordersFailed={ordersFailed}
          timeZoneId={timeZoneId}
          onAcknowledge={acknowledge}
          onAdvance={advanceOrder}
          admissions={
            branchId ? (
              <AdmissionSection
                branchId={branchId}
                waiting={waitingTables}
                timeZoneId={timeZoneId}
                loading={admissionQuery.isLoading && !isOfflinePaused(admissionQuery)}
                failed={
                  admissionQuery.isError ||
                  (isOfflinePaused(admissionQuery) && !admissionQuery.data)
                }
                online={queue.online}
                onDecided={admissionDecided}
                heldForLateParty={heldForLateParty}
              />
            ) : null
          }
          unresolved={unresolvedList}
          onSettle={settleUnresolved}
          approvals={
            branchId ? (
              <ApprovalPanel
                branchId={branchId}
                requests={awaitingQuery.data ?? []}
                timeZoneId={timeZoneId}
                loading={awaitingQuery.isLoading && !isOfflinePaused(awaitingQuery)}
                failed={
                  awaitingQuery.isError || (isOfflinePaused(awaitingQuery) && !awaitingQuery.data)
                }
                online={queue.online}
                fresh={awaiting.fresh}
                onDecided={({ approved, request }) =>
                  setNotice({
                    kind: 'info',
                    // Dated like the card when the booking is not for today.
                    text: decidedNotice(
                      request,
                      approved,
                      t,
                      format.time,
                      branchToday(timeZoneId, (iso) => format.dayAndTime(iso).date, new Date()),
                    ),
                  })
                }
                onRefused={({ request, text }) =>
                  setNotice({
                    kind: 'warning',
                    text: `${t('table.title', { label: request.tableLabel })} · ${text}`,
                  })
                }
              />
            ) : null
          }
        />
      </div>

      {overlay === 'conflicts' ? (
        <ConflictList
          conflicts={queue.state.conflicts}
          held={queue.held}
          queue={queue.state.queue}
          recent={queue.recent}
          online={queue.online}
          actorId={identity.staffMemberId}
          role={identity.role}
          timeZoneId={timeZoneId}
          backTo="floor"
          onDiscard={queue.discard}
          onApplyAnyway={(id) => {
            queue.applyAnyway(id);
            queue.sync();
          }}
          onClaim={(id) => {
            queue.claim(id);
            queue.sync();
          }}
          onDrop={queue.drop}
          onClose={() => setOverlay('none')}
        />
      ) : null}

      {overlay === 'order' ? (
        <OrderEntry
          menu={menu.data}
          menuFromCache={menu.fromCache}
          tab={tabQuery.data ?? null}
          tableLabel={activeTabLabel}
          timeZoneId={timeZoneId}
          online={queue.online}
          loading={menu.loading}
          menuUnavailable={menu.unavailable}
          noTab={activeTabId === null}
          staffName={identity.fullName}
          partySize={activePartySize}
          sent={orderSent}
          onSubmit={submitOrder}
          onSentDismiss={({ restored }) => {
            // The draft is back on screen to be changed and sent again; the
            // refused copy would only be a second thing to decide about.
            if (restored && orderSend) queue.discard(orderSend.id);
            setOrderSend(null);
          }}
          onClose={closeOverlay}
        />
      ) : null}

      {overlay === 'tab' ? (
        <TabPanel
          tab={tabQuery.data ?? null}
          tableLabel={activeTabLabel}
          timeZoneId={timeZoneId}
          role={identity.role}
          staffName={identity.fullName}
          partySize={activePartySize}
          online={queue.online}
          loading={tabQuery.isLoading && !isOfflinePaused(tabQuery)}
          // A paused query is not an empty tab. Saying "no tab is open" for a
          // tab this device simply cannot reach right now would send a waiter
          // off to open a second one.
          offlineUnknown={isOfflinePaused(tabQuery) && !tabQuery.data && activeTabId !== null}
          billRequests={activeBillRequests}
          cashRefusal={
            cashRefusal && cashRefusal.tabId === activeTabId
              ? {
                  remainingDram: cashRefusal.remainingDram,
                  requestedDram: cashRefusal.requestedDram,
                }
              : null
          }
          onVoid={(line: TabLine, reason: VoidReason, detail?: string) => {
            if (!activeTabId) return;
            voidLine.mutate(
              {
                tabId: activeTabId,
                lineId: line.id,
                reason,
                clientCommandId: newCommandId(),
                ...(detail ? { detail } : {}),
              },
              {
                onSuccess: () =>
                  setNotice({ kind: 'info', text: t('tab.notice.voided', { name: line.name }) }),
                onError: (error) =>
                  setNotice({
                    kind: 'warning',
                    text:
                      error instanceof LineAlreadyPaidError
                        ? t('tab.notice.lineAlreadyPaid')
                        : t('tab.notice.failed'),
                  }),
              },
            );
          }}
          onAdjust={(input: {
            lineId: string | null;
            kind: AdjustmentKind;
            percent: number | null;
            amountDram: number | null;
            reason: string;
          }) => {
            if (!activeTabId) return;
            const tabId = activeTabId;
            const lineName = input.lineId
              ? tabQuery.data?.lines.find((line) => line.id === input.lineId)?.name
              : undefined;
            compLine.mutate(
              { tabId, ...input, clientCommandId: newCommandId() },
              {
                // The tab's own read lists it once the refetch lands.
                onSuccess: (adjustment) => {
                  setNotice({
                    kind: 'info',
                    text: lineName
                      ? t('tab.notice.comped', { name: lineName })
                      : t('tab.notice.discounted', {
                          amount: format.dram(adjustment.reductionDram),
                        }),
                  });
                },
                onError: () => setNotice({ kind: 'warning', text: t('tab.notice.failed') }),
              },
            );
          }}
          onAskForBill={() => {
            if (!activeTabId) return;
            beginClosing.mutate({ tabId: activeTabId, clientCommandId: newCommandId() });
          }}
          onCash={async ({
            amountDram,
            tipDram,
            clientCommandId,
            billRequest: request,
          }): Promise<CashOutcome> => {
            if (!activeTabId) return { kind: 'failed' };
            const tabId = activeTabId;
            // A "my share" request is one person's money, so the cash is theirs
            // and the server credits their share. The whole bill names nobody:
            // whoever hands it over is paying for the table.
            const payer = request?.bill?.scope === 'mine' ? request.requestedByParticipantId : null;
            // Whether this device already answered it with "On my way".
            const acknowledgedHere = request ? acknowledgedBills.has(request.id) : false;
            setCashRefusal(null);
            try {
              const result = await recordCash.mutateAsync({
                tabId,
                amountDram,
                tipDram,
                // The keypad's: the same on a retry, so a lost answer replays.
                clientCommandId,
                ...(payer ? { participantId: payer } : {}),
              });
              if (request) {
                // Only the request this cash answered is done with, whether
                // or not anyone tapped "On my way" for it. The others at the
                // table are still waiting.
                setSettledBillIds((current) => new Set(current).add(request.id));
                // With it go this device's copies of the same person's
                // earlier requests on the tab: they were already replaced,
                // and must not resurface as the newest once this one is gone.
                const answered = (candidate: ServiceRequest) =>
                  candidate.id === request.id ||
                  (request.requestedByParticipantId !== null &&
                    candidate.tabId === request.tabId &&
                    candidate.requestedByParticipantId === request.requestedByParticipantId &&
                    candidate.requestedAtUtc <= request.requestedAtUtc);
                setAcknowledgedBills((current) => {
                  const next = new Map(
                    [...current].filter(([, candidate]) => !answered(candidate)),
                  );
                  return next.size === current.size ? current : next;
                });
                // And answered on the server when nobody has yet, so a
                // reload or the other tablet does not show it again.
                const stillOpen = (
                  queryClient.getQueryData<readonly ServiceRequest[]>(
                    queryKeys.serviceRequests(branchId),
                  ) ?? []
                ).some(
                  (candidate) =>
                    candidate.id === request.id && candidate.acknowledgedAtUtc === null,
                );
                if (stillOpen && !acknowledgedHere) sendAcknowledge(request);
              }
              setUnresolved((current) =>
                result.tabClosed ? current.filter((entry) => entry.tabId !== tabId) : current,
              );
              // The keypad's own card says what was taken and the change.
              return { kind: 'recorded', tabClosed: result.tabClosed };
            } catch (error) {
              // The refusal carries the real balance. Shown against the bill,
              // and never retried: the hook has `retry: false` and nothing
              // here sends it again.
              if (isPaymentExceedsRemaining(error)) {
                setCashRefusal({
                  tabId,
                  remainingDram: error.remainingDram,
                  requestedDram: error.requestedDram,
                });
                return { kind: 'refused' };
              }
              // Only an answer from the server means nothing was taken. No
              // answer — offline, a timeout, a server fault — may have landed:
              // read the tab again so the waiter checks it before retrying.
              if (isServerRefusal(error)) return { kind: 'failed' };
              void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(tabId) });
              return { kind: 'unknown' };
            }
          }}
          onAbandon={(reason) => {
            if (!activeTabId) return;
            const tabId = activeTabId;
            abandonTab.mutate(
              { tabId, reason, clientCommandId: newCommandId() },
              {
                onSuccess: (result) =>
                  setNotice({
                    kind: 'info',
                    text: t('tab.notice.markedUnpaid', {
                      amount: format.dram(result.writtenOffDram),
                    }),
                  }),
                onError: () => setNotice({ kind: 'warning', text: t('tab.notice.failed') }),
              },
            );
            setUnresolved((current) => current.filter((entry) => entry.tabId !== tabId));
          }}
          openOnCash={cashFirst}
          onOrder={() => setOverlay('order')}
          onFreeTable={() => {
            // Back to the table's own panel, where freeing it is one more tap
            // behind its confirm. A tab settled from "Needs resolving" has no
            // table left to free.
            const tableId = activeTableId;
            closeOverlay();
            if (tableId && tableId !== UNRESOLVED_KEY) setSelection({ tableId });
          }}
          onClose={closeOverlay}
        />
      ) : null}
    </div>
  );
}

/**
 * The server answered, and said no. Not a dropped connection, a timeout or a
 * 5xx, after any of which the write may still have happened.
 */
function isServerRefusal(error: unknown): boolean {
  return error instanceof ApiError && !isOffline(error) && error.status < 500;
}

/**
 * What a table action just did, for the notice: the Table artboard's toasts,
 * without their undo — every action is a command on its way to the server,
 * and not every one has an inverse the server would accept.
 */
function actedNotice(
  t: TFunction,
  kind: TableActionKind,
  label: string,
  partySize: number | null | undefined,
): string | null {
  switch (kind) {
    case 'seatWalkIn':
    case 'seatHeldParty':
      return partySize
        ? t('notice.acted.seated', { label, count: partySize })
        : t('notice.acted.seatedBooking', { label });
    case 'seatReservation':
      return t('notice.acted.seatedBooking', { label });
    case 'hold':
      return t('notice.acted.held', { label });
    case 'releaseHold':
      return t('notice.acted.holdReleased', { label });
    case 'outOfService':
      return t('notice.acted.outOfService', { label });
    case 'returnToService':
      return t('notice.acted.returned', { label });
    case 'freeTable':
      return t('notice.acted.freed', { label });
  }
}
