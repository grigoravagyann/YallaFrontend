import { isOfflinePaused } from '@yalla/api/react';
import type { ServiceRequest, StaffSessionIdentity, StaffTab } from '@yalla/api';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import type { CommandQueue } from '../commands/useCommandQueue';
import { ConflictList } from '../ConflictList';
import { OrderEntry, type OrderSent } from '../OrderEntry';
import { TabPanel } from '../TabPanel';
import type { CachedMenuResult } from '../useCachedMenu';
import type { CashRefusal } from './useTabActions';
import type { FloorOverlay } from './useTableActions';

type TabActions = Pick<
  ComponentProps<typeof TabPanel>,
  'onVoid' | 'onAdjust' | 'onAskForBill' | 'onCash' | 'onAbandon'
>;

export interface FloorOverlaysProps {
  readonly overlay: FloorOverlay;
  readonly onOverlay: (overlay: FloorOverlay) => void;
  readonly queue: CommandQueue;
  readonly identity: StaffSessionIdentity;
  readonly timeZoneId: string;
  readonly menu: CachedMenuResult;
  readonly tabQuery: UseQueryResult<StaffTab | null>;
  readonly tableLabel: string;
  readonly activeTabId: string | null;
  readonly partySize: number | null;
  readonly orderSent: OrderSent | null;
  /** The order whose confirmation is up: discarded when its draft comes back. */
  readonly orderSendId: string | null;
  readonly onSubmitOrder: ComponentProps<typeof OrderEntry>['onSubmit'];
  readonly onOrderSentDismissed: () => void;
  readonly billRequests: readonly ServiceRequest[];
  readonly cashRefusal: CashRefusal | null;
  readonly tabActions: TabActions;
  readonly openOnCash: boolean;
  readonly onFreeTable: () => void;
  readonly onClose: () => void;
}

/** What opens over the floor: the conflicts, order entry, the tab. */
export function FloorOverlays({
  overlay,
  onOverlay,
  queue,
  identity,
  timeZoneId,
  menu,
  tabQuery,
  tableLabel,
  activeTabId,
  partySize,
  orderSent,
  orderSendId,
  onSubmitOrder,
  onOrderSentDismissed,
  billRequests,
  cashRefusal,
  tabActions,
  openOnCash,
  onFreeTable,
  onClose,
}: FloorOverlaysProps) {
  return (
    <>
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
          onClose={() => onOverlay('none')}
        />
      ) : null}

      {overlay === 'order' ? (
        <OrderEntry
          menu={menu.data}
          menuFromCache={menu.fromCache}
          tab={tabQuery.data ?? null}
          tableLabel={tableLabel}
          timeZoneId={timeZoneId}
          online={queue.online}
          loading={menu.loading}
          menuUnavailable={menu.unavailable}
          noTab={activeTabId === null}
          staffName={identity.fullName}
          partySize={partySize}
          sent={orderSent}
          onSubmit={onSubmitOrder}
          onSentDismiss={({ restored }) => {
            // The draft is back on screen to be changed and sent again; the
            // refused copy would only be a second thing to decide about.
            if (restored && orderSendId !== null) queue.discard(orderSendId);
            onOrderSentDismissed();
          }}
          onClose={onClose}
        />
      ) : null}

      {overlay === 'tab' ? (
        <TabPanel
          tab={tabQuery.data ?? null}
          tableLabel={tableLabel}
          timeZoneId={timeZoneId}
          role={identity.role}
          staffName={identity.fullName}
          partySize={partySize}
          online={queue.online}
          loading={tabQuery.isLoading && !isOfflinePaused(tabQuery)}
          // A paused query is not an empty tab. Saying "no tab is open" for a
          // tab this device simply cannot reach right now would send a waiter
          // off to open a second one.
          offlineUnknown={isOfflinePaused(tabQuery) && !tabQuery.data && activeTabId !== null}
          billRequests={billRequests}
          cashRefusal={
            cashRefusal && cashRefusal.tabId === activeTabId
              ? {
                  remainingDram: cashRefusal.remainingDram,
                  requestedDram: cashRefusal.requestedDram,
                }
              : null
          }
          onVoid={tabActions.onVoid}
          onAdjust={tabActions.onAdjust}
          onAskForBill={tabActions.onAskForBill}
          onCash={tabActions.onCash}
          onAbandon={tabActions.onAbandon}
          openOnCash={openOnCash}
          onOrder={() => onOverlay('order')}
          onFreeTable={onFreeTable}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}
