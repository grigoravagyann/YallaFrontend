import {
  newCommandId,
  type EnrolledDevice,
  type OrderQueueEntry,
  type OrderStatus,
  type StaffSessionIdentity,
} from '@yalla/api';
import { isOfflinePaused, queryKeys, useOrderQueue, useStaffGateway } from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playChime, primeChime } from './chime';
import { ConflictList } from './ConflictList';
import { useCommandQueue } from './commands/useCommandQueue';
import type { QueuedCommand } from './commands/types';
import { ageOrders, kitchenArrivals, projectOrders } from './kitchenBoard';
import { useMinuteClock } from './useMinuteClock';
import { kitchenWaiting, OrderQueuePanel } from './OrderQueuePanel';
import { StaffHeader } from './StaffHeader';
import { useBranchFormat } from './useBranchFormat';
import { useCachedMenu } from './useCachedMenu';
import { useBehindHeldNotice, useCancelReadsWhileLocked, useHeldMarks } from './useHandover';
import { useConnectionState } from './useConnectionState';

/**
 * The kitchen's screen: the order queue, and nothing else.
 *
 * The kitchen used to be handed the floor, which the server refuses it, so the
 * pass tablet showed a refusal where the tables should have been and the
 * orders squeezed into a side panel. The kitchen has no use for the room. It
 * needs to know what is waiting, how long it has waited, and one tap to say it
 * is ready.
 *
 * So this screen makes only the calls the kitchen is allowed: the branch's
 * orders, advancing one, and the menu — anonymous, read for each dish's
 * allergens. No floor, no floor changes, no tabs, no service requests — a
 * waiter call is a waiter's job, and a screen quietly firing refused reads at
 * the backend is the bug this replaced.
 *
 * It is the one screen that sounds for food: a ticket reaching the kitchen
 * chimes, once per read however many arrived. The waiter's Kitchen tab is the
 * same board and stays quiet — the floor's chime is for bookings, and a
 * waiter's tablet ringing for every ticket would be two sounds for one thing.
 *
 * What it keeps from the floor screen is everything about trust: the same
 * header, the same offline queue for advancing orders (a tap made while the
 * wifi is down lands when it comes back), and the same pause while the tablet
 * is locked.
 */
export interface KitchenRouteProps {
  readonly identity: StaffSessionIdentity;
  /** What the tablet is enrolled to. Null on the mock, which has no enrolment. */
  readonly device: EnrolledDevice | null;
  /** Locked: keep the state, stop talking. Same contract as `FloorRoute`. */
  readonly paused: boolean;
}

/**
 * The branch's time zone is only on the floor plan, which the kitchen cannot
 * read. The floor screen falls back to the same zone before its plan loads.
 */
const TIME_ZONE_ID = 'Asia/Yerevan';

/** How often the kitchen re-reads the menu its allergen warnings come from. */
const MENU_REFRESH_MS = 3 * 60_000;

export function KitchenRoute({ identity, device, paused }: KitchenRouteProps) {
  const { t } = useTranslation(['staff', 'common']);
  const queryClient = useQueryClient();
  const gateway = useStaffGateway();
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const branchId = identity.branchId;
  const active = !paused;
  // Polled by the hook itself, foreground only, exactly as on the floor screen.
  const ordersQuery = useOrderQueue(branchId, active);
  // The dishes' allergens, for the warnings on each line. Cached like the
  // floor's, so a warning survives the wifi going.
  // Re-read every few minutes: a pass tablet on a stand never gets the window
  // focus that would refresh it, and a dish changed since must still warn.
  const menu = useCachedMenu(branchId, active, MENU_REFRESH_MS);
  const [notice, setNotice] = useState<string | null>(null);

  const onSettled = useCallback(
    (command: QueuedCommand) => {
      if (command.kind === 'setOrderStatus') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
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
  const queue = useCommandQueue({ gateway, floor: null, onSettled, enabled: active, actor });
  const heldMarks = useHeldMarks(queue);
  useBehindHeldNotice(queue, identity.staffMemberId, (command, name) =>
    setNotice(t('notice.behindHeld', { label: command.subject.tableLabel ?? '', name })),
  );
  useCancelReadsWhileLocked(paused, branchId);

  // The floor screen's live stream refreshes on reconnect; the queue is this
  // screen's only live read, so it is the one refreshed.
  const { refetch } = ordersQuery;
  useEffect(() => {
    if (!active) return;
    const onOnline = () => void refetch();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [active, refetch]);

  const advanceOrder = useCallback(
    (order: OrderQueueEntry, next: OrderStatus) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        // A held pre-order ticket has no tab yet: its own id keeps its moves in order.
        scope: order.tabId ?? order.orderId,
        precondition: null,
        subject: { tableId: null, tableLabel: order.tableLabel, tabId: order.tabId },
        body: {
          kind: 'setOrderStatus',
          command: { orderId: order.orderId, status: next, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
      if (next === 'ready') {
        setNotice(
          t(queue.online ? 'kitchen.readyNotice' : 'kitchen.readyQueued', {
            label: order.tableLabel,
          }),
        );
      }
    },
    [branchId, queryClient, queue, t],
  );

  // A notice is read at arm's length and then goes; nothing here needs dismissing.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Browsers allow sound only after a gesture, and suspend it again when the
  // tablet sleeps. Every tap wakes the chime, as on the floor.
  useEffect(() => {
    const wake = () => primeChime();
    document.addEventListener('pointerdown', wake);
    return () => document.removeEventListener('pointerdown', wake);
  }, []);

  const arrival = useKitchenArrivals(ordersQuery.data);

  // A tap made offline shows where it put the ticket, and says it is not sent.
  // Offline the last read's minutes would freeze; they carry on from it.
  const minute = useMinuteClock();
  const sinceRead = ordersQuery.dataUpdatedAt
    ? Math.max(0, Math.floor((minute.getTime() - ordersQuery.dataUpdatedAt) / 60_000))
    : 0;
  const board = useMemo(
    () => projectOrders(ageOrders(ordersQuery.data ?? [], sinceRead), queue.state.queue),
    [ordersQuery.data, queue.state.queue, sinceRead],
  );

  // The queue is this screen's only live read, so its polls are the
  // connection: answered means live, a failure means reconnecting.
  const state = useConnectionState({
    lastError: ordersQuery.error,
    offline: !queue.online,
    polling: ordersQuery.isError ? 'failing' : ordersQuery.data ? 'ok' : 'unknown',
  });

  return (
    <div className="floor" data-surface="staff">
      {/* The floor's own bar. The kitchen is refused the floor, so its bar
          offers the kitchen alone. */}
      <StaffHeader
        title={t('kitchen.title')}
        place={
          device
            ? t('floor.branch', { venue: device.venueName, branch: device.branchName })
            : branchId
              ? ''
              : t('floor.noBranch')
        }
        timeZoneId={TIME_ZONE_ID}
        who={identity.fullName}
        state={state}
        updatedAt={ordersQuery.dataUpdatedAt || null}
        // A command waiting for its person is counted on the conflicts chip alone.
        pending={queue.pending - queue.held.length}
        // Held commands need a decision too: whose name they go under.
        conflicts={queue.conflicts + queue.held.length}
        online={queue.online}
        onOpenConflicts={() => setConflictsOpen(true)}
        onRefresh={() => void refetch()}
        refreshLabel={t('connection.refreshQueue')}
        view="kitchen"
        kitchenWaiting={kitchenWaiting(board.orders)}
      />

      {notice && !paused ? (
        <p className="floor-notice notice-info is-wide" role="status">
          {notice}
        </p>
      ) : null}

      {/* New tickets, said once for a screen reader as the chime sounds. */}
      <p className="visually-hidden" role="status">
        {arrival}
      </p>

      <div className="kitchen-body">
        <OrderQueuePanel
          orders={board.orders}
          pendingOrderIds={board.pendingOrderIds}
          heldOrders={heldMarks.orders}
          onUnknownDish={menu.refetch}
          menu={menu.data}
          timeZoneId={TIME_ZONE_ID}
          role={identity.role}
          onAdvance={advanceOrder}
          loading={ordersQuery.isLoading && !isOfflinePaused(ordersQuery)}
          failed={ordersQuery.isError || (isOfflinePaused(ordersQuery) && !ordersQuery.data)}
          sounds
        />
      </div>

      {conflictsOpen ? (
        <ConflictList
          conflicts={queue.state.conflicts}
          held={queue.held}
          queue={queue.state.queue}
          recent={queue.recent}
          online={queue.online}
          actorId={identity.staffMemberId}
          role={identity.role}
          timeZoneId={TIME_ZONE_ID}
          backTo="kitchen"
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
          onClose={() => setConflictsOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The chime for tickets reaching the kitchen, and the sentence a screen reader
 * hears with it. Once per read, however many arrived together: two tickets
 * sent in the same breath are one sound, not a chord.
 */
function useKitchenArrivals(orders: readonly OrderQueueEntry[] | undefined): string {
  const { t } = useTranslation('staff');
  const format = useBranchFormat(TIME_ZONE_ID);
  const seen = useRef<ReadonlySet<string> | null>(null);
  const [arrival, setArrival] = useState({ seq: 0, text: '' });

  useEffect(() => {
    if (!orders) return;
    const next = kitchenArrivals(seen.current, orders);
    seen.current = next.seen;
    if (next.arrived.length === 0) return;
    setArrival((current) => ({
      seq: current.seq + 1,
      // With the time, so the same table arriving twice in a row is new words
      // to a screen reader, and is said again (FT4 review N4).
      text: t('kitchen.arrived', {
        time: format.time(new Date().toISOString()),
        labels: next.arrived.map((order) => order.tableLabel).join(', '),
      }),
    }));
  }, [orders, t, format]);

  useEffect(() => {
    if (arrival.seq === 0) return;
    void playChime();
  }, [arrival.seq]);

  return arrival.text;
}
