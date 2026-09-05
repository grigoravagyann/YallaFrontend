import {
  isEndpointNotWired,
  newCommandId,
  tableDetail,
  type ConsoleUser,
  type OrderQueueEntry,
  type OrderStatus,
  type PlaceOrderLine,
  type ServiceRequest,
  type StaffFloor,
  type TabLine,
  type TableActionKind,
  type TableActionResult,
  type VoidReason,
} from '@yalla/api';
import {
  isOfflinePaused,
  queryKeys,
  useAbandonTab,
  useCompLine,
  useOpenTabForTable,
  useOrderQueue,
  useRecordCashPayment,
  useServiceRequests,
  useStaffFloor,
  useStaffGateway,
  useStaffMenu,
  useStaffTab,
  useVoidLine,
} from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { FloorPlan, Legend, type FloorTable, type Rect } from '@yalla/floorplan';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryFailureNotice } from '../components/QueryFailureNotice';
import { useElementSize } from '../useElementSize';
import { ConflictList } from './ConflictList';
import { useCommandQueue } from './commands/useCommandQueue';
import type { NewCommand, QueuedCommand } from './commands/types';
import { applyFloorChanges } from './live/sequence';
import { createPollingLiveStream } from './live/stream';
import { OrderEntry } from './OrderEntry';
import { OrderQueuePanel } from './OrderQueuePanel';
import { StaffHeader } from './StaffHeader';
import { TableActionPanel } from './TableActionPanel';
import { TabPanel } from './TabPanel';
import { useBranchFormat } from './useBranchFormat';
import { useConnectionState } from './useConnectionState';

/**
 * The floor screen: the whole product, on a counter.
 *
 * Used standing up, during a Friday rush, by a nineteen-year-old with ten
 * minutes of training, on a tablet, sometimes in daylight. Every layout decision
 * below follows from that and not from taste:
 *
 * - **Everything is one tap from the floor.** The action panel opens beside the
 *   tapped table; order entry and the tab open over the floor and close back to
 *   it. There are no nested menus and no navigation, because a waiter carrying
 *   two plates cannot find their way back from a third screen.
 * - **Landscape-first, portrait survivable.** The body is a wrapping flex row,
 *   so portrait stacks the order panel under the floor rather than crushing it.
 * - **Offline is a state the header shows, never an error the floor shows.** The
 *   last floor loaded stays on screen with pending work marked on it.
 *
 * The branch comes from the token's scope, never from a route parameter. A
 * waiter has exactly one branch and no way to name another.
 */
export interface FloorRouteProps {
  readonly user: ConsoleUser;
}

/** The table key an unresolved tab is filed under. Never a real table id. */
const UNRESOLVED_KEY = '__unresolved__';

interface Selection {
  readonly tableId: string;
  readonly anchor: Rect;
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

export function FloorRoute({ user }: FloorRouteProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const queryClient = useQueryClient();
  const gateway = useStaffGateway();
  const [planRef, size] = useElementSize<HTMLDivElement>();

  const branchId = user.scope.branchIds[0];
  const floorQuery = useStaffFloor(branchId);
  const floor = floorQuery.data ?? null;
  const timeZoneId = floor?.plan.timeZoneId ?? 'Asia/Yerevan';
  const format = useBranchFormat(timeZoneId);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [overlay, setOverlay] = useState<'none' | 'conflicts' | 'order' | 'tab'>('none');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unresolved, setUnresolved] = useState<readonly UnresolvedTab[]>([]);
  /**
   * Tab ids learned from transition results.
   *
   * The floor payload carries a session id and no tab id, and there is no
   * lookup by table, so within a session this is the only way the tab panel can
   * find the tab on a table it did not itself seat. Empty is handled: the panel
   * says there is no tab rather than showing somebody else's.
   */
  const [tabIds, setTabIds] = useState<ReadonlyMap<string, string>>(new Map());

  // --- Commands -------------------------------------------------------------

  const onApplied = useCallback(
    (result: TableActionResult) => {
      if (result.tabId) {
        setTabIds((current) => new Map(current).set(result.tableId, result.tabId!));
      }

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
                  tableLabel: result.tableLabel,
                  amountDram: result.outstandingDram!,
                },
              ],
        );
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

      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
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
        void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId ?? '') });
        if (command.subject.tabId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.staffTab(command.subject.tabId),
          });
        }
      }
      if (command.kind === 'acknowledgeServiceRequest') {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.serviceRequests(branchId ?? ''),
        });
      }
    },
    [branchId, queryClient],
  );

  const queue = useCommandQueue({ gateway, floor, onApplied, onLiveRace, onSettled });

  // --- Live updates ---------------------------------------------------------

  useEffect(() => {
    if (!branchId) return;

    const stream = createPollingLiveStream({
      gateway,
      branchId,
      handlers: {
        onChanges: (changes) => {
          // Fold in incrementally; a gap or an unknown table falls through to a
          // full refetch rather than being patched around.
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
          void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
        },
        onError: () => {
          /* The header already reports the connection; a toast per poll would
             be noise on a screen nobody can dismiss things on. */
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
  }, [branchId, gateway, queryClient]);

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

  const activeTabId = activeTableId
    ? (tabIds.get(activeTableId) ?? tableDetail(floor, activeTableId)?.openTabId ?? null)
    : null;
  const tabQuery = useStaffTab(activeTabId);
  /**
   * The menu is fetched when the floor loads, not when order entry opens.
   *
   * Fetching it on demand looks tidier and fails at the worst possible moment:
   * a query the browser cannot send is *paused*, not failed, so a waiter who
   * opens order entry after the wifi drops gets an empty grid that never
   * resolves. Loading it up front means the one thing that has to survive going
   * offline mid-service is already in the cache when it does.
   */
  const menuQuery = useStaffMenu(branchId);
  const openTab = useOpenTabForTable();

  const ordersQuery = useOrderQueue(branchId);
  const requestsQuery = useServiceRequests(branchId);

  const voidLine = useVoidLine();
  const compLine = useCompLine();
  const abandonTab = useAbandonTab();
  const recordCash = useRecordCashPayment();

  const selectedTabId = selection?.tableId
    ? (tabIds.get(selection.tableId) ?? selectedDetail?.openTabId ?? null)
    : null;
  const selectedTabQuery = useStaffTab(selectedTabId);

  // --- Acting ---------------------------------------------------------------

  /**
   * An unresolved tab has no table any more — it was freed — but the money is
   * still owed, so the panel has to be openable from the tab id alone. Filed
   * under a key that cannot collide with a real table id.
   */
  const settleUnresolved = useCallback((tabId: string) => {
    setTabIds((current) => new Map(current).set(UNRESOLVED_KEY, tabId));
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

      const command: NewCommand = {
        id: clientCommandId,
        scope: selection.tableId,
        precondition: { expectedFromStatus: expected, rowVersion: detail?.rowVersion ?? null },
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
          },
        },
      };

      queue.enqueue(command);
      queue.sync();
      setSelection(null);
    },
    [branchId, floor, plan, queue, selection, selectedTabId],
  );

  const advanceOrder = useCallback(
    (order: OrderQueueEntry, next: OrderStatus) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        scope: order.tabId,
        precondition: null,
        subject: { tableId: order.tableId, tableLabel: order.tableLabel, tabId: order.tabId },
        body: {
          kind: 'setOrderStatus',
          command: { orderId: order.orderId, status: next, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId ?? '') });
    },
    [branchId, queryClient, queue],
  );

  const acknowledge = useCallback(
    (request: ServiceRequest) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        scope: request.tabId,
        precondition: null,
        subject: {
          tableId: request.tableId,
          tableLabel: request.tableLabel,
          tabId: request.tabId,
        },
        body: {
          kind: 'acknowledgeServiceRequest',
          command: { requestId: request.id, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branchId ?? '') });
    },
    [branchId, queryClient, queue],
  );

  const submitOrder = useCallback(
    async (lines: readonly PlaceOrderLine[]) => {
      if (!activeTableId || !branchId) return;
      let tabId = activeTabId;

      // No tab yet? Open one in the same flow, without asking. A waiter taking
      // an order has already decided the table is occupied.
      if (!tabId) {
        try {
          const opened = await openTab.mutateAsync({
            branchId,
            tableId: activeTableId,
            clientCommandId: newCommandId(),
          });
          tabId = opened.id;
          setTabIds((current) => new Map(current).set(activeTableId, opened.id));
        } catch {
          setNotice({ kind: 'info', text: t('order.couldNotOpenTab') });
          return;
        }
      }

      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        scope: tabId,
        precondition: null,
        subject: {
          tableId: activeTableId,
          tableLabel: plan?.tables.find((table) => table.id === activeTableId)?.label ?? null,
          tabId,
          itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        },
        body: { kind: 'placeOrder', command: { tabId, clientCommandId, lines } },
      });
      queue.sync();
      setOverlay('none');
      setNotice({
        kind: 'info',
        text: t('order.sent', { count: lines.reduce((sum, line) => sum + line.quantity, 0) }),
      });
    },
    [activeTabId, activeTableId, branchId, openTab, plan, queue, t],
  );

  // --- Render ---------------------------------------------------------------

  const offline = !queue.online;
  const state = useConnectionState({ lastError: floorQuery.error, offline });
  const ordersUnavailable = isEndpointNotWired(ordersQuery.error);
  const branchName = floor?.plan.branchName;

  const unresolvedList = useMemo(
    () => unresolved.filter((entry) => entry.amountDram > 0),
    [unresolved],
  );

  return (
    <div className="floor" data-surface="staff">
      <StaffHeader
        title={t('floor.title')}
        subtitle={branchName ?? (branchId ? t('admin:loading') : t('floor.noBranch'))}
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
          <Legend mode="staff" translate={(key) => t(`common:${key}`)} />

          <div ref={planRef} className="floor-plan-frame">
            {!branchId ? (
              <p className="floor-note">{t('floor.noBranch')}</p>
            ) : plan ? (
              <>
                <FloorPlan
                  plan={plan}
                  mode="staff"
                  viewport={size}
                  selectedTableId={selection?.tableId ?? null}
                  onTableTap={(tableId, anchor) => setSelection({ tableId, anchor })}
                  tableAnnotation={(laid) =>
                    // Pending work is marked on the table itself, not only in
                    // the header. A synced-looking state that is not real is the
                    // one thing this screen must never render.
                    pendingTableIds.has(laid.id) ? t('floor.pendingMark') : null
                  }
                  accessibilityLabel={t('floor.title')}
                />

                {selection && selectedTable ? (
                  <TableActionPanel
                    table={selectedTable}
                    detail={selectedDetail}
                    anchor={selection.anchor}
                    frame={size}
                    timeZoneId={timeZoneId}
                    projectedStatus={queue.projected(selection.tableId)}
                    tab={selectedTabQuery.data ?? null}
                    pending={pendingTableIds.has(selection.tableId)}
                    online={queue.online}
                    onAct={act}
                    onOpenTab={() => {
                      setActiveTableId(selection.tableId);
                      setOverlay('tab');
                      setSelection(null);
                    }}
                    onOrder={() => {
                      setActiveTableId(selection.tableId);
                      setOverlay('order');
                      setSelection(null);
                    }}
                    onClose={() => setSelection(null)}
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
          role={user.role}
          onAdvance={advanceOrder}
          onAcknowledge={acknowledge}
          unavailable={ordersUnavailable}
          loading={ordersQuery.isLoading}
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
          menu={menuQuery.data ?? null}
          tab={tabQuery.data ?? null}
          tableLabel={plan?.tables.find((table) => table.id === activeTableId)?.label ?? ''}
          timeZoneId={timeZoneId}
          online={queue.online}
          unavailable={isEndpointNotWired(menuQuery.error)}
          loading={menuQuery.isLoading && !isOfflinePaused(menuQuery)}
          menuUnavailableOffline={isOfflinePaused(menuQuery) && !menuQuery.data}
          cannotOpenTab={!queue.online && activeTabId === null}
          onSubmit={(lines) => void submitOrder(lines)}
          onClose={() => setOverlay('none')}
        />
      ) : null}

      {overlay === 'tab' ? (
        <TabPanel
          tab={tabQuery.data ?? null}
          tableLabel={plan?.tables.find((table) => table.id === activeTableId)?.label ?? ''}
          timeZoneId={timeZoneId}
          role={user.role}
          online={queue.online}
          unavailable={isEndpointNotWired(tabQuery.error)}
          loading={tabQuery.isLoading && !isOfflinePaused(tabQuery)}
          // A paused query is not an empty tab. Saying "no tab is open" for a
          // tab this device simply cannot reach right now would send a waiter
          // off to open a second one.
          offlineUnknown={isOfflinePaused(tabQuery) && !tabQuery.data && activeTabId !== null}
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
          onComp={(line, reason) => {
            if (!activeTabId) return;
            compLine.mutate({
              tabId: activeTabId,
              lineId: line?.id ?? null,
              reason,
              clientCommandId: newCommandId(),
            });
          }}
          onCash={({ amountDram, tipDram }) => {
            if (!activeTabId) return;
            recordCash.mutate(
              { tabId: activeTabId, amountDram, tipDram, clientCommandId: newCommandId() },
              {
                onSuccess: (result) => {
                  setNotice({
                    kind: 'info',
                    text: result.tabClosed
                      ? t('cash.closed')
                      : t('cash.recorded', { amount: format.dram(amountDram) }),
                  });
                  setUnresolved((current) =>
                    result.tabClosed
                      ? current.filter((entry) => entry.tabId !== activeTabId)
                      : current,
                  );
                },
                onError: () => setNotice({ kind: 'info', text: t('cash.failed') }),
              },
            );
          }}
          onAbandon={(reason) => {
            if (!activeTabId) return;
            abandonTab.mutate({ tabId: activeTabId, reason, clientCommandId: newCommandId() });
            setUnresolved((current) => current.filter((entry) => entry.tabId !== activeTabId));
          }}
          onOrder={() => setOverlay('order')}
          onClose={() => setOverlay('none')}
        />
      ) : null}
    </div>
  );
}
