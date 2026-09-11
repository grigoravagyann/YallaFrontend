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
import { useCallback, useEffect, useState } from 'react';
import { ConflictList } from './ConflictList';
import { useCommandQueue } from './commands/useCommandQueue';
import type { QueuedCommand } from './commands/types';
import { OrderQueuePanel } from './OrderQueuePanel';
import { StaffHeader } from './StaffHeader';
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
 * orders, and advancing one. No floor, no floor changes, no tabs, no service
 * requests — a waiter call is a waiter's job, and a screen quietly firing
 * refused reads at the backend is the bug this replaced.
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

export function KitchenRoute({ identity, device, paused }: KitchenRouteProps) {
  const { t } = useTranslation(['staff', 'common']);
  const queryClient = useQueryClient();
  const gateway = useStaffGateway();
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const branchId = identity.branchId;
  const active = !paused;
  // Polled by the hook itself, foreground only, exactly as on the floor screen.
  const ordersQuery = useOrderQueue(active ? branchId : undefined);

  const onSettled = useCallback(
    (command: QueuedCommand) => {
      if (command.kind === 'setOrderStatus') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
      }
    },
    [branchId, queryClient],
  );

  const queue = useCommandQueue({ gateway, floor: null, onSettled, enabled: active });

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
        scope: order.tabId,
        precondition: null,
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

  const state = useConnectionState({ lastError: ordersQuery.error, offline: !queue.online });

  return (
    <div className="floor" data-surface="staff">
      <StaffHeader
        title={t('kitchen.title')}
        subtitle={
          device
            ? t('floor.branch', { venue: device.venueName, branch: device.branchName })
            : branchId
              ? ''
              : t('floor.noBranch')
        }
        who={identity.fullName}
        state={state}
        pending={queue.pending}
        conflicts={queue.conflicts}
        syncing={queue.syncing}
        online={queue.online}
        onOpenConflicts={() => setConflictsOpen(true)}
        onRefresh={() => void refetch()}
      />

      <div className="floor-body kitchen-body">
        <OrderQueuePanel
          orders={ordersQuery.data ?? []}
          requests={null}
          timeZoneId={TIME_ZONE_ID}
          role={identity.role}
          onAdvance={advanceOrder}
          loading={ordersQuery.isLoading && !isOfflinePaused(ordersQuery)}
          failed={ordersQuery.isError || (isOfflinePaused(ordersQuery) && !ordersQuery.data)}
        />
      </div>

      {conflictsOpen ? (
        <ConflictList
          conflicts={queue.state.conflicts}
          timeZoneId={TIME_ZONE_ID}
          onDiscard={queue.discard}
          onApplyAnyway={(id) => {
            queue.applyAnyway(id);
            queue.sync();
          }}
          onClose={() => setConflictsOpen(false)}
        />
      ) : null}
    </div>
  );
}
