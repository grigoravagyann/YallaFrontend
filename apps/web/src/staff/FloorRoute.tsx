import {
  TableNotSeatedError,
  isPaymentExceedsRemaining,
  newCommandId,
  tableDetail,
  type AdjustmentKind,
  type AffectedReservation,
  type FloorTable,
  type OrderQueueEntry,
  type OrderStatus,
  type PlaceOrderLine,
  type ReleaseOutcome,
  type ServiceRequest,
  type StaffFloor,
  type StaffSessionIdentity,
  type TabAdjustment,
  type TabLine,
  type TableActionKind,
  type TableActionResult,
  type VoidReason,
} from '@yalla/api';
import {
  isOfflinePaused,
  queryKeys,
  useAbandonTab,
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
  useTabLines,
  useVoidLine,
} from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryFailureNotice } from '../components/QueryFailureNotice';
import { ConflictList } from './ConflictList';
import { useCommandQueue } from './commands/useCommandQueue';
import type { NewCommand, QueuedCommand } from './commands/types';
import { applyFloorChanges } from './live/sequence';
import { createPollingLiveStream } from './live/stream';
import { OrderEntry } from './OrderEntry';
import { OrderQueuePanel } from './OrderQueuePanel';
import { StaffHeader } from './StaffHeader';
import { TableActionPanel } from './TableActionPanel';
import { TableLegend, TableList } from './TableList';
import { TabPanel } from './TabPanel';
import { useBranchFormat } from './useBranchFormat';
import { useCachedMenu } from './useCachedMenu';
import { useConnectionState } from './useConnectionState';
import { seatedMinutes } from './seatedMinutes';

/**
 * The floor screen: the whole product, on a counter.
 *
 * Used standing up, during a Friday rush, by a nineteen-year-old with ten
 * minutes of training, on a tablet, sometimes in daylight. Every layout decision
 * below follows from that and not from taste:
 *
 * - **Everything is one tap from the floor.** The floor is a list of tables by
 *   room; the action panel opens beside it for the tapped table; order entry and the tab open over the floor and close back to
 *   it. There are no nested menus and no navigation, because a waiter carrying
 *   two plates cannot find their way back from a third screen.
 * - **Landscape-first, portrait survivable.** The body is a wrapping flex row,
 *   so portrait stacks the order panel under the floor rather than crushing it.
 * - **Offline is a state the header shows, never an error the floor shows.** The
 *   last floor loaded stays on screen with pending work marked on it.
 *
 * The branch comes from the staff session, never from a route parameter. A
 * waiter has exactly one branch and no way to name another.
 */
export interface FloorRouteProps {
  readonly identity: StaffSessionIdentity;
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
}

/** A tab left open on a table that has been freed. */
interface UnresolvedTab {
  readonly tabId: string;
  readonly tableLabel: string;
  readonly amountDram: number;
}

export function FloorRoute({ identity, paused }: FloorRouteProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const queryClient = useQueryClient();
  const gateway = useStaffGateway();

  const branchId = identity.branchId;
  const active = !paused;
  const floorQuery = useStaffFloor(active ? branchId : undefined);
  const floor = floorQuery.data ?? null;
  const timeZoneId = floor?.plan.timeZoneId ?? 'Asia/Yerevan';
  const format = useBranchFormat(timeZoneId);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [overlay, setOverlay] = useState<'none' | 'conflicts' | 'order' | 'tab'>('none');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
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
  /** Adjustments this device has applied this session; nothing lists them back. */
  const [sessionAdjustments, setSessionAdjustments] = useState<
    ReadonlyMap<string, readonly TabAdjustment[]>
  >(new Map());
  /**
   * Bill requests this device answered "On my way" to, per tab.
   *
   * The branch's request list drops a request once it is acknowledged, but
   * that is the moment the waiter sets off with the bill — the amount and the
   * tip the table asked for are needed at the table, not before. So they are
   * kept here until cash is taken against them.
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
                { tabId, tableLabel: result.tableLabel, amountDram: result.outstandingDram! },
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

  const queue = useCommandQueue({
    gateway,
    floor,
    onApplied,
    onLiveRace,
    onSettled,
    enabled: active,
  });

  // --- Live updates ---------------------------------------------------------

  /**
   * Whether the change stream's last poll reached the server. The floor query
   * is the other half of the answer: a resync is a request *it* makes, so its
   * own outcome is read directly when the chip is computed below.
   */
  const [streamFailing, setStreamFailing] = useState(false);

  useEffect(() => {
    if (!branchId || !active) return;

    const stream = createPollingLiveStream({
      gateway,
      branchId,
      handlers: {
        onChanges: (changes) => {
          setStreamFailing(false);
          // Fold in incrementally; a gap, an unknown table, or a change whose
          // drawn state cannot be derived falls through to a full refetch
          // rather than being patched around.
          const current = queryClient.getQueryData<StaffFloor | null>(
            queryKeys.staffFloor(branchId),
          );
          if (!current) return;
          const result = applyFloorChanges(current, changes);
          if (result.kind === 'applied') {
            queryClient.setQueryData(queryKeys.staffFloor(branchId), result.floor);
            stream.setSequence(result.floor.lastSequence);
          } else if (result.kind === 'gap') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
          }
        },
        onResync: () => {
          setStreamFailing(false);
          void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
        },
        onError: () => {
          // Reported through the header's chip, which is the one place a
          // waiter looks; a toast per poll would be noise on a screen nobody
          // can dismiss things on.
          setStreamFailing(true);
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
    noticeTimer.current = setTimeout(() => setNotice(null), 6_000);
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [notice]);

  // --- Panels ---------------------------------------------------------------

  const overlayFloor = queue.overlay(floor);
  const plan = overlayFloor?.plan ?? floor?.plan ?? null;
  const pendingTableIds = overlayFloor?.pendingTableIds ?? new Set<string>();

  const selectedTable: FloorTable | undefined = plan?.tables.find(
    (table) => table.id === selection?.tableId,
  );
  const selectedDetail = tableDetail(floor, selection?.tableId);

  /**
   * The tab the overlays are looking at.
   *
   * Straight off the floor read since Backend 8b. The previous version learned
   * tab ids only from transition results, so a tab this device had not itself
   * opened was invisible until somebody seated the table again; that workaround
   * is gone.
   */
  const activeTabId =
    activeTableId === UNRESOLVED_KEY
      ? unresolvedTabId
      : (tableDetail(floor, activeTableId)?.openTabId ?? null);

  const tabQuery = useStaffTab(active ? activeTabId : null);
  const linesQuery = useTabLines({
    branchId,
    tabId: activeTabId,
    enabled: active && overlay === 'tab',
  });

  /**
   * The menu, from disk first and the network second.
   *
   * Not fetched when order entry opens. A query the browser cannot send is
   * *paused*, not failed, so a waiter who opens order entry after the wifi
   * drops would get a grid that never resolves — and on a tablet that was
   * rebooted offline there would be nothing in memory to fall back to either.
   */
  const menu = useCachedMenu(branchId, active);

  const ordersQuery = useOrderQueue(active ? branchId : undefined);
  const requestsQuery = useServiceRequests(active ? branchId : undefined);

  const voidLine = useVoidLine();
  const compLine = useCompLine();
  const abandonTab = useAbandonTab();
  const recordCash = useRecordCashPayment();
  const beginClosing = useBeginClosing();
  const releaseReservation = useReleaseReservation(branchId);
  const openTabForStaff = useOpenTabForStaff();

  const selectedTabId = selectedDetail?.openTabId ?? null;
  const selectedTabQuery = useStaffTab(active ? selectedTabId : null);

  // --- Acting ---------------------------------------------------------------

  /**
   * An unresolved tab has no table any more — it was freed — but the money is
   * still owed, so the panel has to be openable from the tab id alone. Filed
   * under a key that cannot collide with a real table id.
   */
  const settleUnresolved = useCallback((tabId: string) => {
    setUnresolvedTabId(tabId);
    setActiveTableId(UNRESOLVED_KEY);
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
    },
    [branchId, floor, plan, queue, selection, selectedTabId],
  );

  const release = useCallback(
    (reservationId: string, outcome: ReleaseOutcome) => {
      releaseReservation.mutate(
        { reservationId, outcome, clientCommandId: newCommandId() },
        {
          onSuccess: (result) => {
            setNotice({
              kind: 'info',
              // The server says whether it counted, rather than the button
              // being trusted to remember which one it was.
              text: result.countsTowardNoShowThreshold
                ? t('notice.releasedNoShow', { label: result.tableLabel })
                : t('notice.releasedCancelled', { label: result.tableLabel }),
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
          onError: () => setNotice({ kind: 'info', text: t('notice.releaseFailed') }),
        },
      );
    },
    [releaseReservation, t],
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
    },
    [branchId, queryClient, queue],
  );

  const acknowledge = useCallback(
    (request: ServiceRequest) => {
      if (request.reason === 'bill' && request.bill) {
        setAcknowledgedBills((current) => new Map(current).set(request.tabId, request));
      }
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
        body: { kind: 'placeOrder', command: { tabId: activeTabId, clientCommandId, lines } },
      });
      queue.sync();
      setOverlay('none');
      setNotice({ kind: 'info', text: t('order.sent', { count }) });
    },
    [activeTabId, activeTableId, plan, queue, t],
  );

  // --- Render ---------------------------------------------------------------

  const offline = !queue.online;
  // The floor read is the poll that matters: every resync is one of its
  // fetches, and a failed one leaves `isError` set beside the data it kept.
  const state = useConnectionState({
    lastError: floorQuery.error,
    offline,
    polling: streamFailing || floorQuery.isError ? 'failing' : floorQuery.data ? 'ok' : 'unknown',
  });
  const branchName = floor?.plan.branchName;

  const unresolvedList = useMemo(
    () => unresolved.filter((entry) => entry.amountDram > 0),
    [unresolved],
  );

  const activeTabLabel = plan?.tables.find((table) => table.id === activeTableId)?.label ?? '';

  /**
   * The table's latest bill request with an amount on it, still unanswered in
   * the branch list or answered from this device, and not yet paid against.
   */
  const activeBillRequest = useMemo(() => {
    if (!activeTabId) return null;
    const candidates = [
      ...(requestsQuery.data ?? []).filter(
        (request) => request.tabId === activeTabId && request.reason === 'bill',
      ),
      ...(acknowledgedBills.has(activeTabId) ? [acknowledgedBills.get(activeTabId)!] : []),
    ].filter((request) => request.bill !== null && !settledBillIds.has(request.id));
    return candidates.sort((a, b) => b.requestedAtUtc.localeCompare(a.requestedAtUtc))[0] ?? null;
  }, [activeTabId, acknowledgedBills, requestsQuery.data, settledBillIds]);

  return (
    <div className="floor" data-surface="staff">
      <StaffHeader
        title={t('floor.title')}
        subtitle={branchName ?? (branchId ? t('admin:loading') : t('floor.noBranch'))}
        who={identity.fullName}
        state={state}
        pending={queue.pending}
        conflicts={queue.conflicts}
        syncing={queue.syncing}
        online={queue.online}
        onOpenConflicts={() => setOverlay('conflicts')}
        onRefresh={() => void floorQuery.refetch()}
      />

      {notice ? (
        <p className={`floor-notice notice-${notice.kind}`} role="status">
          {notice.text}
        </p>
      ) : null}

      <div className="floor-body">
        <section className="floor-plan-pane">
          <TableLegend />

          <div className="floor-plan-frame">
            {!branchId ? (
              <p className="floor-note">{t('floor.noBranch')}</p>
            ) : plan ? (
              <>
                <TableList
                  tables={plan.tables}
                  selectedTableId={selection?.tableId ?? null}
                  pendingTableIds={pendingTableIds}
                  onSelect={(tableId) => setSelection({ tableId })}
                  seatedFor={(table) => {
                    const minutes = table.occupiedSinceUtc
                      ? seatedMinutes(format.minutesSince(table.occupiedSinceUtc))
                      : null;
                    return minutes === null ? null : t('table.minutes', { count: minutes });
                  }}
                />

                {selection && selectedTable ? (
                  <TableActionPanel
                    table={selectedTable}
                    detail={selectedDetail}
                    timeZoneId={timeZoneId}
                    projectedStatus={queue.projected(selection.tableId)}
                    tab={selectedTabQuery.data ?? null}
                    pending={pendingTableIds.has(selection.tableId)}
                    online={queue.online}
                    affectedReservations={affected.get(selection.tableId) ?? []}
                    releasing={releaseReservation.isPending}
                    onAct={act}
                    onRelease={release}
                    onOpenTab={() => {
                      setActiveTableId(selection.tableId);
                      setOverlay('tab');
                      setSelection(null);
                    }}
                    onStartTab={() => startTab(selection.tableId)}
                    startingTab={openTabForStaff.isPending}
                    onOrder={() => {
                      setActiveTableId(selection.tableId);
                      setOverlay('order');
                      setSelection(null);
                    }}
                    onClose={() => {
                      const tableId = selection.tableId;
                      setSelection(null);
                      // Back to the row it was opened from, not the top of the page.
                      document
                        .querySelector<HTMLElement>(
                          `.table-row[data-table-id="${CSS.escape(tableId)}"]`,
                        )
                        ?.focus();
                    }}
                  />
                ) : null}
              </>
            ) : offline ? (
              <div className="floor-note">
                <QueryFailureNotice offline onRetry={() => void floorQuery.refetch()} />
              </div>
            ) : floorQuery.isLoading ? (
              <p className="floor-note">{t('floor.loading')}</p>
            ) : (
              <div className="floor-note">
                <QueryFailureNotice
                  error={floorQuery.error}
                  onRetry={() => void floorQuery.refetch()}
                />
              </div>
            )}
          </div>

          {unresolvedList.length > 0 ? (
            <section className="unresolved" aria-label={t('unresolved.title')}>
              <h2>{t('unresolved.title')}</h2>
              <p className="table-note">{t('unresolved.body')}</p>
              <ul>
                {unresolvedList.map((entry) => (
                  <li key={entry.tabId}>
                    <span>
                      {t('table.title', { label: entry.tableLabel })} ·{' '}
                      {format.dram(entry.amountDram)}
                    </span>
                    <button
                      type="button"
                      className="button"
                      onClick={() => settleUnresolved(entry.tabId)}
                    >
                      {t('unresolved.settle')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>

        <OrderQueuePanel
          orders={ordersQuery.data ?? []}
          requests={requestsQuery.data ?? []}
          timeZoneId={timeZoneId}
          role={identity.role}
          onAdvance={advanceOrder}
          onAcknowledge={acknowledge}
          loading={ordersQuery.isLoading && !isOfflinePaused(ordersQuery)}
          failed={ordersQuery.isError || (isOfflinePaused(ordersQuery) && !ordersQuery.data)}
        />
      </div>

      {overlay === 'conflicts' ? (
        <ConflictList
          conflicts={queue.state.conflicts}
          timeZoneId={timeZoneId}
          onDiscard={queue.discard}
          onApplyAnyway={(id) => {
            queue.applyAnyway(id);
            queue.sync();
          }}
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
          onSubmit={submitOrder}
          onClose={() => setOverlay('none')}
        />
      ) : null}

      {overlay === 'tab' ? (
        <TabPanel
          tab={tabQuery.data ?? null}
          lines={linesQuery.data ?? []}
          linesLoading={linesQuery.isLoading && !isOfflinePaused(linesQuery)}
          linesKnown={linesQuery.data !== undefined}
          adjustments={activeTabId ? (sessionAdjustments.get(activeTabId) ?? []) : []}
          tableLabel={activeTabLabel}
          timeZoneId={timeZoneId}
          role={identity.role}
          online={queue.online}
          loading={tabQuery.isLoading && !isOfflinePaused(tabQuery)}
          // A paused query is not an empty tab. Saying "no tab is open" for a
          // tab this device simply cannot reach right now would send a waiter
          // off to open a second one.
          offlineUnknown={isOfflinePaused(tabQuery) && !tabQuery.data && activeTabId !== null}
          billRequest={activeBillRequest?.bill ?? null}
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
            voidLine.mutate({
              tabId: activeTabId,
              lineId: line.id,
              reason,
              clientCommandId: newCommandId(),
              ...(detail ? { detail } : {}),
            });
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
            compLine.mutate(
              { tabId, ...input, clientCommandId: newCommandId() },
              {
                // Nothing lists a tab's adjustments back, so the only copy of
                // this row is the one the response just handed us.
                onSuccess: (adjustment) =>
                  setSessionAdjustments((current) =>
                    new Map(current).set(tabId, [...(current.get(tabId) ?? []), adjustment]),
                  ),
              },
            );
          }}
          onAskForBill={() => {
            if (!activeTabId) return;
            beginClosing.mutate({ tabId: activeTabId, clientCommandId: newCommandId() });
          }}
          onCash={({ amountDram, tipDram }) => {
            if (!activeTabId) return;
            const tabId = activeTabId;
            const billRequestId = activeBillRequest?.id ?? null;
            setCashRefusal(null);
            recordCash.mutate(
              { tabId, amountDram, tipDram, clientCommandId: newCommandId() },
              {
                onSuccess: (result) => {
                  // The request this cash answered is done with, whether or not
                  // anyone tapped "On my way" for it.
                  if (billRequestId) {
                    setSettledBillIds((current) => new Set(current).add(billRequestId));
                  }
                  setAcknowledgedBills((current) => {
                    if (!current.has(tabId)) return current;
                    const next = new Map(current);
                    next.delete(tabId);
                    return next;
                  });
                  setNotice({
                    kind: 'info',
                    text: result.tabClosed
                      ? t('cash.closed')
                      : t('cash.recorded', { amount: format.dram(amountDram) }),
                  });
                  setUnresolved((current) =>
                    result.tabClosed ? current.filter((entry) => entry.tabId !== tabId) : current,
                  );
                },
                onError: (error) => {
                  // The refusal carries the real balance. Shown against the
                  // bill, and never retried: the hook has `retry: false` and
                  // this handler adds nothing that would send it again.
                  if (isPaymentExceedsRemaining(error)) {
                    setCashRefusal({
                      tabId,
                      remainingDram: error.remainingDram,
                      requestedDram: error.requestedDram,
                    });
                    return;
                  }
                  setNotice({ kind: 'info', text: t('cash.failed') });
                },
              },
            );
          }}
          onAbandon={(reason) => {
            if (!activeTabId) return;
            const tabId = activeTabId;
            abandonTab.mutate({ tabId, reason, clientCommandId: newCommandId() });
            setUnresolved((current) => current.filter((entry) => entry.tabId !== tabId));
          }}
          onOrder={() => setOverlay('order')}
          onClose={() => setOverlay('none')}
        />
      ) : null}
    </div>
  );
}
