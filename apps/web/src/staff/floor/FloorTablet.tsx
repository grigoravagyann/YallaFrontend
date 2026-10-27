import type {
  AwaitingApproval,
  BranchTakeawayOrders,
  Menu,
  OrderQueueEntry,
  OrderStatus,
  StaffSessionIdentity,
  StaffTakeawayOrder,
} from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import type { ConnectionState } from '@yalla/realtime';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from '@yalla/i18n';
import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from 'react';
import { ApprovalPanel } from '../ApprovalPanel';
import type { CommandQueue } from '../commands/useCommandQueue';
import { FloorRail, ICONS } from '../FloorRail';
import { kitchenWaiting, OrderQueuePanel } from '../OrderQueuePanel';
import { StaffHeader } from '../StaffHeader';
import { TakeawayRailSection } from '../takeaway/TakeawayAccept';
import type { FloorRailShared } from './FloorPhone';
import type { Selection } from './useFloorCommands';
import type { useFloorScreens } from './useFloorScreens';
import type { FloorFeatures } from './floorFeatures';

type OrderQueuePanelProps = ComponentProps<typeof OrderQueuePanel>;

export interface FloorTabletProps {
  readonly screens: ReturnType<typeof useFloorScreens>;
  readonly identity: StaffSessionIdentity;
  /** What the platform allows here: a view it has not is not offered. */
  readonly features: FloorFeatures;
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly place: string;
  readonly state: ConnectionState;
  readonly updatedAt: number | null;
  readonly queue: CommandQueue;
  readonly onRefresh: () => void;
  readonly onOpenConflicts: () => void;
  readonly setSelection: Dispatch<SetStateAction<Selection | null>>;
  readonly orders: readonly OrderQueueEntry[];
  /** The kitchen board with this tablet's unsent moves applied and marked. */
  readonly board: {
    readonly orders: OrderQueuePanelProps['orders'];
    readonly pendingOrderIds: OrderQueuePanelProps['pendingOrderIds'];
  };
  readonly heldOrders: OrderQueuePanelProps['heldOrders'];
  readonly minute: Date;
  readonly menu: Menu | null;
  readonly onUnknownDish: OrderQueuePanelProps['onUnknownDish'];
  readonly onAdvance: (order: OrderQueueEntry, next: OrderStatus) => void;
  readonly ordersLoading: boolean;
  readonly ordersFailed: boolean;
  readonly takeawayReady: {
    readonly markReady: OrderQueuePanelProps['onTakeawayReady'];
    readonly marking: OrderQueuePanelProps['takeawayMarking'];
  };
  readonly takeawayCounter: BranchTakeawayOrders | null;
  readonly takeawayInUse: boolean;
  readonly takeawayFailed: boolean;
  readonly takeawayToAnswer: readonly StaffTakeawayOrder[];
  readonly messagesWaiting: number;
  /** What waits on the floor's rail: its tab's count. */
  readonly floorWaiting: number;
  readonly panelOpen: boolean;
  readonly messagesFirst: boolean;
  readonly awaitingQuery: UseQueryResult<readonly AwaitingApproval[]>;
  readonly freshRequests: ReadonlySet<string>;
  readonly rail: FloorRailShared;
  readonly onApprovalDecided: ComponentProps<typeof ApprovalPanel>['onDecided'];
  readonly onApprovalRefused: ComponentProps<typeof ApprovalPanel>['onRefused'];
  readonly notice: ReactNode;
  readonly announcers: ReactNode;
  readonly tablePanel: ReactNode;
  readonly overlays: ReactNode;
  readonly floorTables: ReactNode;
  readonly messagesInbox: ReactNode;
  readonly takeawayCounterNode: ReactNode;
}

/** The floor tablet (floor-tablet HANDOFF): the top bar, the floor beside its rail, the kitchen. */
export function FloorTablet({
  screens,
  identity,
  features,
  branchId,
  timeZoneId,
  place,
  state,
  updatedAt,
  queue,
  onRefresh,
  onOpenConflicts,
  setSelection,
  orders,
  board,
  heldOrders,
  minute,
  menu,
  onUnknownDish,
  onAdvance,
  ordersLoading,
  ordersFailed,
  takeawayReady,
  takeawayCounter,
  takeawayInUse,
  takeawayFailed,
  takeawayToAnswer,
  messagesWaiting,
  floorWaiting,
  panelOpen,
  messagesFirst,
  awaitingQuery,
  freshRequests,
  rail,
  onApprovalDecided,
  onApprovalRefused,
  notice,
  announcers,
  tablePanel,
  overlays,
  floorTables,
  messagesInbox,
  takeawayCounterNode,
}: FloorTabletProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const { view: asked, setView, navigate, onMessagesPath } = screens;
  // A view the platform has switched off since (or a link into one) is the floor.
  const view = asked === 'takeaway' && !features.takeaway && !takeawayInUse ? 'floor' : asked;

  return (
    <div className="floor" data-surface="staff">
      <StaffHeader
        title={
          view === 'kitchen'
            ? t('kitchen.title')
            : view === 'takeaway'
              ? t('takeaway.title')
              : view === 'messages'
                ? t('messages.title')
                : t('floor.title')
        }
        place={place}
        timeZoneId={timeZoneId}
        who={identity.fullName}
        state={state}
        updatedAt={updatedAt}
        // A command waiting for its person is not waiting to sync: it is on
        // the conflicts chip, and counted there alone.
        pending={queue.pending - queue.held.length}
        // Held commands need a decision too: whose name they go under.
        conflicts={queue.conflicts + queue.held.length}
        online={queue.online}
        onOpenConflicts={onOpenConflicts}
        onRefresh={onRefresh}
        view={view}
        kitchenWaiting={kitchenWaiting(orders)}
        // The counter's tab once the branch has a takeaway order today (or it
        // is on screen): a venue that never took one is not shown an empty tab.
        takeawayWaiting={
          takeawayCounter && (takeawayInUse || view === 'takeaway')
            ? takeawayCounter.sentCount + takeawayCounter.readyCount
            : undefined
        }
        messagesWaiting={messagesWaiting}
        floorWaiting={floorWaiting}
        onSelectView={(next) => {
          setSelection(null);
          setView(next);
          if (next === 'messages' && !onMessagesPath) navigate('/staff/messages');
          if (next !== 'messages' && onMessagesPath) navigate('/staff');
        }}
      />

      {notice}

      {announcers}

      {view === 'kitchen' ? (
        // The kitchen board as the kitchen sees it, from the floor's own queue
        // and orders. Quiet: the floor's chime is for bookings.
        <div className="kitchen-body">
          <OrderQueuePanel
            orders={board.orders}
            now={minute}
            pendingOrderIds={board.pendingOrderIds}
            heldOrders={heldOrders}
            onUnknownDish={onUnknownDish}
            menu={menu}
            timeZoneId={timeZoneId}
            role={identity.role}
            onAdvance={onAdvance}
            loading={ordersLoading}
            failed={ordersFailed}
            onTakeawayReady={takeawayReady.markReady}
            takeawayMarking={takeawayReady.marking}
            online={queue.online}
          />
        </div>
      ) : null}

      {view === 'takeaway' && branchId ? (
        <div className="kitchen-body">{takeawayCounterNode}</div>
      ) : null}

      {view === 'messages' && branchId ? <div className="kitchen-body">{messagesInbox}</div> : null}

      {/* Hidden, not unmounted, while the kitchen shows: a half-typed decline,
          an answer in flight and its notice all live in here, and a trip to
          the kitchen must not cost any of them. */}
      <div className="ft-body" hidden={view !== 'floor'} data-panel={panelOpen || undefined}>
        <section className="ft-floor" aria-label={t('floor.tables')}>
          {floorTables}
        </section>

        {/* The table's panel takes the rail's place, as on the Table artboard;
            the rail stays mounted under it (hidden), so an answer in flight,
            a half-typed decline and the countdowns are all still there when
            the panel closes. */}
        {tablePanel}

        <FloorRail
          hidden={panelOpen}
          {...rail}
          messagesFirst={messagesFirst}
          takeaway={
            branchId && (features.takeaway || takeawayInUse) ? (
              <TakeawayRailSection
                branchId={branchId}
                orders={takeawayToAnswer}
                timeZoneId={timeZoneId}
                online={queue.online}
                failed={takeawayInUse && takeawayFailed}
                icon={ICONS.bag}
              />
            ) : null
          }
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
                fresh={freshRequests}
                onDecided={onApprovalDecided}
                onRefused={onApprovalRefused}
              />
            ) : null
          }
        />
      </div>

      {overlays}
    </div>
  );
}
