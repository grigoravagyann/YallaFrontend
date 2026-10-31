import type {
  AwaitingApproval,
  StaffFloor,
  StaffSessionIdentity,
  BranchTakeawayOrders,
  StaffTakeawayOrder,
} from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from '@yalla/i18n';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { staffSession } from '../auth/staffSession';
import type { CommandQueue } from '../commands/useCommandQueue';
import { FloorRail, type FloorRailProps } from '../FloorRail';
import { upcomingBookings } from '../phone/nextHour';
import { PhoneApprove } from '../phone/PhoneApprove';
import { PhoneInstall } from '../phone/PhoneInstall';
import { PhoneMore } from '../phone/PhoneMore';
import { PhoneApprovalList, PhoneNextHour, PhoneTakeawayList } from '../phone/PhoneNowSections';
import { PhoneResults } from '../phone/PhoneResults';
import { PhoneShell, type PhoneTab, type PhoneTabSpec } from '../phone/PhoneShell';
import { PhoneToday } from '../phone/PhoneToday';
import type { useStaffRoster } from '../phone/usePhoneData';
import { connectionChip } from '../StaffHeader';
import type { BranchFormat } from '../useBranchFormat';
import type { ConnectionState } from '@yalla/realtime';
import type { Selection } from './useFloorCommands';
import type { FloorFeatures } from './floorFeatures';
import type { useFloorScreens } from './useFloorScreens';

/** Venue-wide people: My results names the branch for them. */
const VENUE_WIDE_ROLES: ReadonlySet<string> = new Set(['generalManager', 'owner']);

/** What the rail shows on both shells: everything but its frame and its approvals. */
export type FloorRailShared = Omit<
  FloorRailProps,
  'approvals' | 'takeaway' | 'toCall' | 'after' | 'phone' | 'hidden' | 'messagesFirst'
>;

export interface FloorPhoneProps {
  readonly screens: ReturnType<typeof useFloorScreens>;
  readonly identity: StaffSessionIdentity;
  /** What the platform allows here: a tab it has not is not offered. */
  readonly features: FloorFeatures;
  readonly branchId: string;
  readonly active: boolean;
  readonly timeZoneId: string;
  readonly place: string;
  readonly format: BranchFormat;
  readonly minute: Date;
  readonly state: ConnectionState;
  readonly updatedAt: number | null;
  readonly queue: CommandQueue;
  readonly floor: StaffFloor | null;
  readonly onRefresh: () => void;
  readonly onOpenConflicts: () => void;
  readonly setSelection: Dispatch<SetStateAction<Selection | null>>;
  readonly awaitingQuery: UseQueryResult<readonly AwaitingApproval[]>;
  readonly freshRequests: ReadonlySet<string>;
  /** What waits on Now: its tab's count. */
  readonly nowWaiting: number;
  readonly messagesWaiting: number;
  readonly takeawayCounter: BranchTakeawayOrders | null;
  readonly takeawayInUse: boolean;
  readonly takeawayFailed: boolean;
  readonly takeawayToAnswer: readonly StaffTakeawayOrder[];
  readonly rail: FloorRailShared;
  /** Staff-taken bookings to call now (2026-10-31): `PhoneToCallList`, after the door's list. */
  readonly toCall: ReactNode;
  /** "+ New booking" at the top of Now: the New booking sheet, from no table. */
  readonly onNewBooking: () => void;
  readonly onApprovalDecided: (decision: {
    readonly approved: boolean;
    readonly request: AwaitingApproval;
  }) => void;
  readonly onApprovalRefused: (refusal: {
    readonly request: AwaitingApproval;
    readonly text: string;
  }) => void;
  readonly roster: ReturnType<typeof useStaffRoster>;
  readonly onUnpair?: (() => Promise<void>) | undefined;
  readonly notice: ReactNode;
  readonly announcers: ReactNode;
  readonly sheet: ReactNode;
  readonly overlays: ReactNode;
  readonly floorTables: ReactNode;
  readonly messagesInbox: ReactNode;
  readonly takeawayCounterNode: ReactNode;
}

/** The phone (staff phone spec, "Phone layout for /staff"): the floor's screens in the phone's frame. */
export function FloorPhone({
  screens,
  identity,
  branchId,
  active,
  timeZoneId,
  place,
  format,
  minute,
  state,
  updatedAt,
  queue,
  floor,
  onRefresh,
  onOpenConflicts,
  setSelection,
  awaitingQuery,
  freshRequests,
  nowWaiting,
  messagesWaiting,
  takeawayCounter,
  takeawayInUse,
  takeawayFailed,
  takeawayToAnswer,
  rail,
  toCall,
  onNewBooking,
  onApprovalDecided,
  onApprovalRefused,
  roster,
  onUnpair,
  notice,
  announcers,
  sheet,
  overlays,
  floorTables,
  messagesInbox,
  takeawayCounterNode,
}: FloorPhoneProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const {
    navigate,
    onMessagesPath,
    setView,
    manager,
    phoneTab,
    setPhoneTab,
    moreScreen,
    setMoreScreen,
    approving,
    setApproving,
    setMessageSubject,
  } = screens;

  const selectTab = (next: PhoneTab) => {
    setSelection(null);
    setApproving(null);
    setMoreScreen(null);
    // The Messages tab again, from a conversation: back to the list.
    if (next === 'messages' && phoneTab === 'messages') setMessageSubject(null);
    setPhoneTab(next);
    setView(next === 'messages' ? 'messages' : next === 'takeaway' ? 'takeaway' : 'floor');
    if (next === 'messages' && !onMessagesPath) navigate('/staff/messages');
    if (next !== 'messages' && onMessagesPath) navigate('/staff');
    document.querySelector<HTMLElement>('.ph-main')?.scrollTo?.({ top: 0 });
  };
  const openTable = (tableId: string) => {
    setApproving(null);
    setPhoneTab('floor');
    setView('floor');
    if (onMessagesPath) navigate('/staff');
    setSelection({ tableId });
  };
  const openApproval = (request: AwaitingApproval) => {
    setSelection(null);
    setApproving(request);
  };

  const takeawayCount = takeawayCounter
    ? takeawayCounter.sentCount + takeawayCounter.readyCount
    : 0;
  // A manager's bar has Today first, and no room left for the counter: it
  // is a row in More, and Now's takeaway rows open it all the same.
  const takeawayTab = (takeawayInUse || phoneTab === 'takeaway') && !manager;
  const tabs: PhoneTabSpec[] = [
    ...(manager ? [{ key: 'today' as const }] : []),
    { key: 'now', count: nowWaiting },
    { key: 'floor' },
    { key: 'messages', count: messagesWaiting },
    ...(takeawayTab ? [{ key: 'takeaway' as const, count: takeawayCount }] : []),
    { key: 'more' },
  ];

  const chip = connectionChip({
    state,
    online: queue.online,
    pending: queue.pending - queue.held.length,
    updatedAt,
    now: minute.getTime(),
    t,
    time: format.time,
  });

  const approvingNow = approving
    ? (awaitingQuery.data?.find((request) => request.id === approving.id) ?? null)
    : null;

  const screenTitle = approving
    ? t('phone.approve.title')
    : moreScreen === 'notifications'
      ? t('phone.install.settingsTitle')
      : moreScreen === 'results'
        ? t('phone.results.title')
        : phoneTab === 'today'
          ? t('phone.today.title')
          : phoneTab === 'floor'
            ? t('floor.title')
            : phoneTab === 'messages'
              ? t('messages.title')
              : phoneTab === 'takeaway'
                ? t('takeaway.title')
                : phoneTab === 'more'
                  ? t('phone.tabs.more')
                  : t('rail.title');

  return (
    <PhoneShell
      title={screenTitle}
      place={place}
      who={identity.fullName}
      chip={chip}
      chipLabel={t('connection.chip.name', {
        chip: chip.text,
        action: t('connection.refresh'),
      })}
      onRefresh={onRefresh}
      conflicts={queue.conflicts + queue.held.length}
      onOpenConflicts={onOpenConflicts}
      tabs={tabs}
      current={approving || moreScreen ? null : phoneTab}
      onTab={selectTab}
      back={
        approving
          ? { onBack: () => setApproving(null) }
          : moreScreen
            ? { onBack: () => setMoreScreen(null) }
            : undefined
      }
      notice={notice}
      announcers={announcers}
      sheet={sheet}
      onCloseSheet={() => setSelection(null)}
      overlays={overlays}
    >
      {approving && branchId ? (
        <PhoneApprove
          // A fresh card per booking: a reason typed for one never carries over.
          key={approving.id}
          branchId={branchId}
          request={approvingNow ?? approving}
          waiting={approvingNow !== null}
          timeZoneId={timeZoneId}
          online={queue.online}
          onDecided={onApprovalDecided}
          onRefused={onApprovalRefused}
          onDone={() => setApproving(null)}
        />
      ) : null}

      {/* Now and the floor stay mounted under the other screens, as the
          tablet's floor does under its kitchen: a half-typed answer and the
          countdowns are still there on the way back. */}
      <div className="ph-screen ph-now" hidden={approving !== null || phoneTab !== 'now'}>
        {/* A booking by hand, first on Now: the guest is on the phone (2026-10-31). */}
        <div className="ph-new-booking">
          <button type="button" className="ft-btn ft-btn-primary" onClick={onNewBooking}>
            {t('newBooking.openPhone')}
          </button>
        </div>
        <FloorRail
          phone
          {...rail}
          toCall={toCall}
          takeaway={
            <PhoneTakeawayList
              orders={takeawayToAnswer}
              failed={takeawayInUse && takeawayFailed}
              onOpen={() => selectTab('takeaway')}
            />
          }
          approvals={
            <PhoneApprovalList
              requests={awaitingQuery.data ?? []}
              timeZoneId={timeZoneId}
              loading={awaitingQuery.isLoading && !isOfflinePaused(awaitingQuery)}
              failed={
                awaitingQuery.isError || (isOfflinePaused(awaitingQuery) && !awaitingQuery.data)
              }
              fresh={freshRequests}
              onOpen={openApproval}
            />
          }
          after={
            <PhoneNextHour
              rows={upcomingBookings(floor, minute)}
              timeZoneId={timeZoneId}
              onOpenTable={openTable}
            />
          }
        />
      </div>

      <section
        className="ph-screen ph-floor"
        aria-label={t('floor.tables')}
        hidden={approving !== null || phoneTab !== 'floor'}
      >
        {floorTables}
      </section>

      {!approving && phoneTab === 'messages' ? (
        <div className="ph-screen ph-messages">{messagesInbox}</div>
      ) : null}

      {!approving && phoneTab === 'takeaway' ? (
        <div className="ph-screen ph-takeaway">{takeawayCounterNode}</div>
      ) : null}

      {!approving && phoneTab === 'today' && branchId ? (
        <PhoneToday
          branchId={branchId}
          timeZoneId={timeZoneId}
          active={active}
          onOpenApprovals={() => {
            const first = awaitingQuery.data?.[0];
            if (first) openApproval(first);
            else selectTab('now');
          }}
          onOpenMessages={() => selectTab('messages')}
        />
      ) : null}

      {!approving && phoneTab === 'more' && moreScreen === 'notifications' ? (
        <div className="ph-screen ph-notifications">
          <PhoneInstall />
        </div>
      ) : null}

      {!approving && phoneTab === 'more' && moreScreen === 'results' ? (
        <PhoneResults
          // An owner or a general manager has no home branch: they name this one.
          branchId={VENUE_WIDE_ROLES.has(identity.role) && branchId ? branchId : undefined}
          timeZoneId={timeZoneId}
          active={active}
        />
      ) : null}

      {!approving && phoneTab === 'more' && moreScreen === null ? (
        <PhoneMore
          identity={identity}
          place={place}
          roster={roster.data}
          rosterFailed={roster.isError}
          manager={manager}
          onOpenToday={() => selectTab('today')}
          onOpenTakeaway={!takeawayTab && takeawayInUse ? () => selectTab('takeaway') : undefined}
          onLock={() => void staffSession?.signOut()}
          onOpenNotifications={() => setMoreScreen('notifications')}
          // The kitchen has no results of its own (the server refuses it).
          onOpenResults={identity.role === 'kitchen' ? undefined : () => setMoreScreen('results')}
          onUnpair={onUnpair}
        />
      ) : null}
    </PhoneShell>
  );
}
