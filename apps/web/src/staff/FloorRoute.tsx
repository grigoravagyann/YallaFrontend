import {
  staffMayWrite,
  tableDetail,
  type AffectedReservation,
  type BookingToCall,
  type ConversationSubjectRef,
  type EnrolledDevice,
  type FloorTable,
  type ServiceRequest,
  type StaffSessionIdentity,
} from '@yalla/api';
import {
  isOfflinePaused,
  queryKeys,
  useNow,
  useStaffFloor,
  useStaffGateway,
  useStaffTab,
} from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryFailureNotice } from '../components/QueryFailureNotice';
import { AdmissionSection, wasHeldForLateParty, type AdmissionSubject } from './AdmissionPanel';
import { primeChime } from './chime';
import { ICONS, type UnresolvedTab } from './FloorRail';
import { ageOrders, projectOrders } from './kitchenBoard';
import { MessagesInbox } from './messages/MessagesInbox';
import { MessagesRailSection } from './messages/MessagesRailSection';
import { useStaffRoster } from './phone/usePhoneData';
import { PreOrderSection, preOrderForTable, preOrderNeedsAction } from './PreOrderPanel';
import { usePushUpkeep } from './pwa/usePushUpkeep';
import { TableActionPanel } from './TableActionPanel';
import { tableCardText } from './tableCard';
import { TableList } from './TableList';
import { TakeawayCounter } from './takeaway/TakeawayCounter';
import { useTakeawayReady } from './takeaway/useTakeawayReady';
import { floorFeatures } from './floor/floorFeatures';
import { NoShowSection, type MarkedNoShow } from './UndoNoShowNotice';
import { arrivingBookings, dueNowCount, seatingReservationIds } from './withoutTable';
import { WithoutTableSection } from './WithoutTablePanel';
import { NewBookingSheet } from './booking/NewBookingSheet';
import { PhoneToCallList } from './phone/PhoneNowSections';
import { ToCallSection } from './ToCallPanel';
import { useStaffBooking } from './floor/useStaffBooking';
import { useBranchFormat } from './useBranchFormat';
import { useConnectionState } from './useConnectionState';
import { billRequestsForTab } from './floor/billRequests';
import { FloorNotice } from './floor/FloorNotice';
import { FloorOverlays } from './floor/FloorOverlays';
import { FloorPhone, type FloorRailShared } from './floor/FloorPhone';
import { FloorTablet } from './floor/FloorTablet';
import { useConflictNotices, useNoticeTimeout, type Notice } from './floor/notices';
import { useFloorCommands, type Selection } from './floor/useFloorCommands';
import { useFloorLiveStream } from './floor/useFloorLiveStream';
import { useFloorQueries } from './floor/useFloorQueries';
import { useFloorScreens } from './floor/useFloorScreens';
import { useOrderSend } from './floor/useOrderSend';
import { useOutcomeNotices } from './floor/useOutcomeNotices';
import { useServiceCalls } from './floor/useServiceCalls';
import { useStaffDeepLink } from './floor/useStaffDeepLink';
import { useTabActions, type CashRefusal } from './floor/useTabActions';
import { UNRESOLVED_KEY, useTableActions, type FloorOverlay } from './floor/useTableActions';
import { useTableTransfer } from './floor/useTableTransfer';

export { FLOOR_REFRESH_MS } from './floor/useFloorLiveStream';

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
 *
 * One component draws the tablet and the phone, so a swap between them keeps
 * every piece of state: it all lives here, in the hooks under `floor/`, and
 * `floor/FloorTablet` and `floor/FloorPhone` only draw it.
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
  /**
   * "Unpair this phone" in the phone's More screen, after its confirm: given
   * only on a paired phone (`kind` 2). Rejects when the server could not be
   * reached, and More says so.
   */
  readonly onUnpair?: (() => Promise<void>) | undefined;
}

export function FloorRoute({ identity, device = null, paused, onUnpair }: FloorRouteProps) {
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

  /** What the platform allows here (2026-10-27): what the floor draws and asks. */
  const features = floorFeatures(identity);
  /** The screen on show, its address, and the phone's tabs and screens. */
  const screens = useFloorScreens(identity.role);
  const {
    location,
    navigate,
    onMessagesPath,
    view,
    setView,
    phone,
    phoneTab,
    setPhoneTab,
    setMoreScreen,
    setApproving,
    messageSubject,
    setMessageSubject,
  } = screens;
  /** The room chip that is on; null for every room. */
  const [room, setRoom] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [overlay, setOverlay] = useState<FloorOverlay>('none');
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
  /** The tab overlay was opened from the table panel's "Take cash": keypad first. */
  const [cashFirst, setCashFirst] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** No-shows marked from this tablet, undoable from the rail until their window closes (S5). */
  const [markedNoShows, setMarkedNoShows] = useState<readonly MarkedNoShow[]>([]);
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
  const [cashRefusal, setCashRefusal] = useState<CashRefusal | null>(null);
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

  // --- Commands and live updates ----------------------------------------------

  const { queue, heldMarks } = useFloorCommands({
    identity,
    gateway,
    queryClient,
    floor,
    paused,
    format,
    t,
    setNotice,
    setUnresolved,
    setAffected,
    setSelection,
  });
  const { streamFailing, answeredAt, staleSince } = useFloorLiveStream({
    branchId,
    active,
    gateway,
    queryClient,
    floorSequence: floorQuery.data?.lastSequence,
    floorReadAt: floorQuery.dataUpdatedAt,
    setNotice,
  });
  useNoticeTimeout(notice, setNotice);
  useConflictNotices(queue.state.conflicts, setNotice, t);

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

  const {
    menu,
    minute,
    ordersQuery,
    requestsQuery,
    awaitingQuery,
    awaiting,
    withoutTableQuery,
    admissionQuery,
    waitingTables,
    preOrdersQuery,
    duePreOrders,
    takeawayQuery,
    takeawayCounter,
    takeawayInUse,
    inboxQuery,
    inbox,
    reminderClock,
    reminders,
  } = useFloorQueries(branchId, active, timeZoneId, features);
  /** Bookings taken by hand (2026-10-31): the sheet, and whom to call now. */
  const staffBooking = useStaffBooking(branchId, active);
  const canWriteMessages = staffMayWrite(identity.role, {
    waitersCanWrite: inbox?.waitersCanWrite ?? true,
  });
  const openConversation = useCallback(
    (subject: ConversationSubjectRef | null) => {
      setSelection(null);
      setApproving(null);
      setMessageSubject(subject);
      setView('messages');
      setPhoneTab('messages');
      if (!onMessagesPath) navigate('/staff/messages');
    },
    [navigate, onMessagesPath, setApproving, setMessageSubject, setPhoneTab, setView],
  );

  useStaffDeepLink({
    location,
    navigate,
    active,
    phone,
    t,
    awaiting: awaitingQuery,
    inbox,
    inboxFailed: inboxQuery.isError,
    floor,
    floorFailed: floorQuery.isError,
    setSelection,
    setApproving,
    setMoreScreen,
    setView,
    setPhoneTab,
    setMessageSubject,
    setNotice,
  });

  // The browser's push subscription kept the server's, and the language the
  // pushes are written in kept the app's.
  usePushUpkeep(active);

  const takeawayToAnswer = useMemo(
    () => (takeawayCounter?.active ?? []).filter((order) => order.status === 'sent'),
    [takeawayCounter],
  );

  // Browsers allow sound only after a gesture, and suspend it again when the
  // tablet sleeps or the tab is hidden. Every tap on the floor wakes the
  // chime — not only the first — so the next request is heard, not only seen.
  useEffect(() => {
    const wake = () => primeChime();
    document.addEventListener('pointerdown', wake);
    return () => document.removeEventListener('pointerdown', wake);
  }, []);

  const say = useCallback((text: string) => setNotice({ kind: 'info', text }), []);
  const takeawayTime = useCallback((iso: string) => format.time(iso), [format]);
  // The Kitchen tab's "Ready" on a takeaway ticket: online only, never queued.
  const takeawayReady = useTakeawayReady(branchId, say, takeawayTime);

  const selectedTabId = selectedDetail?.openTabId ?? null;
  const selectedTabQuery = useStaffTab(active ? selectedTabId : null);
  /** The clock a late booking is judged by (whether the scan took a held table). */
  const clockMs = useNow(30_000).getTime();
  // Each until its window closes, on this clock; the server has the last word.
  const undoableNoShows = markedNoShows.filter(
    (entry) => Date.parse(entry.undoableUntilUtc) > clockMs,
  );

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

  const { preOrderDone, admissionDecided, approvalDecided, approvalRefused } = useOutcomeNotices(
    t,
    format,
    timeZoneId,
    setNotice,
  );

  /** Whose shift it is: the phone's More ("My shift"). A phone's roster is its own person. */
  const roster = useStaffRoster(branchId, phone && active && phoneTab === 'more');

  // --- Acting ---------------------------------------------------------------

  const {
    releaseReservation,
    openTabForStaff,
    settleUnresolved,
    act,
    seatBooking,
    undoSettled,
    release,
    startTab,
    advanceOrder,
  } = useTableActions({
    branchId,
    floor,
    plan,
    queue,
    selection,
    selectedTabId,
    timeZoneId,
    format,
    queryClient,
    t,
    setNotice,
    setSelection,
    setUnresolvedTabId,
    setOverlayTabId,
    setActiveTableId,
    setCashFirst,
    setOverlay,
    setMarkedNoShows,
    setAffected,
  });
  const { claiming, claim, sendAcknowledge, acknowledge } = useServiceCalls({
    identity,
    queue,
    queryClient,
    t,
    setNotice,
    setAcknowledgedBills,
  });
  const {
    transferTab,
    setTransferWantedFor,
    transferTargets,
    transferTargetsFailed,
    transferNotYours,
    transfer,
  } = useTableTransfer({ branchId, selectedTabId, t, setNotice, setSelection });
  const { orderSend, setOrderSend, submitOrder, orderSent } = useOrderSend({
    activeTabId,
    activeTableId,
    plan,
    queue,
    t,
    setNotice,
  });

  const closeOverlay = useCallback(() => {
    setCashFirst(false);
    setOrderSend(null);
    setOverlay('none');
  }, [setOrderSend]);

  const tabActions = useTabActions({
    branchId,
    activeTabId,
    tab: tabQuery.data,
    acknowledgedBills,
    sendAcknowledge,
    format,
    queryClient,
    t,
    setNotice,
    setCashRefusal,
    setSettledBillIds,
    setAcknowledgedBills,
    setUnresolved,
  });

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
  const updatedAt =
    Math.max(
      (streamFailing || floorQuery.isError ? staleSince : answeredAt) ?? 0,
      floorQuery.dataUpdatedAt,
    ) || null;

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

  /** The tab's bill requests with an amount on them, newest first (`billRequestsForTab`). */
  const billRequestsFor = useCallback(
    (tabId: string | null) =>
      billRequestsForTab(tabId, requestsQuery.data, acknowledgedBills, settledBillIds),
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
  /**
   * Bookings made by time only at the door (2026-10-29): soon or started, and
   * not being seated from here this moment — a seat in the queue takes its
   * booking off the list at once, and a refused one brings it back.
   */
  const seating = useMemo(() => seatingReservationIds(queue.state), [queue.state]);
  const arriving = useMemo(
    () => arrivingBookings(withoutTableQuery.data, minute, seating),
    [withoutTableQuery.data, minute, seating],
  );
  /** What waits on Now (the phone) or the floor's rail (the tablet): its tab's count. */
  const nowWaiting =
    (awaitingQuery.data?.length ?? 0) +
    dueNowCount(arriving, minute) +
    staffBooking.toCall.length +
    waitingTables.length +
    duePreOrders.filter(preOrderNeedsAction).length +
    (requestsQuery.data?.length ?? 0);
  const messagesWaiting = inbox?.unreadTotal ?? floor?.messages?.unreadTotal ?? 0;

  const noticeNode = (
    <FloorNotice
      notice={notice}
      paused={paused}
      branchId={branchId}
      online={queue.online}
      wide={!phone && view !== 'floor'}
      timeZoneId={timeZoneId}
      time={format.time}
      onUndoSettled={undoSettled}
    />
  );

  const announcers = (
    <>
      {/* New booking requests, said once for a screen reader. Here rather than
          in the rail, so it is heard with the rail folded or the kitchen on
          screen; always in the tree, so a reader is listening before it speaks. */}
      <p className="visually-hidden" role="status" data-testid="approval-announcer">
        {awaiting.announcement}
      </p>
      <p className="visually-hidden" role="status" data-testid="message-reminder-announcer">
        {reminders.announcement}
      </p>
    </>
  );

  const takeawayCounterNode = branchId ? (
    <TakeawayCounter
      branchId={branchId}
      counter={takeawayCounter}
      timeZoneId={timeZoneId}
      online={queue.online}
      loading={takeawayQuery.isLoading && !isOfflinePaused(takeawayQuery)}
      failed={takeawayQuery.isError || (isOfflinePaused(takeawayQuery) && !takeawayQuery.data)}
      onRetry={() => void takeawayQuery.refetch()}
    />
  ) : null;

  const messagesInbox = (stacked: boolean) =>
    branchId ? (
      <MessagesInbox
        branchId={branchId}
        messagesOff={!features.messages}
        inbox={inbox}
        loading={inboxQuery.isLoading && !isOfflinePaused(inboxQuery)}
        failed={inboxQuery.isError || (isOfflinePaused(inboxQuery) && !inboxQuery.data)}
        error={inboxQuery.error}
        onRetry={() => void inboxQuery.refetch()}
        selected={messageSubject}
        onSelect={setMessageSubject}
        staffName={identity.fullName}
        timeZoneId={timeZoneId}
        online={queue.online}
        active={active}
        now={reminderClock}
        stacked={stacked}
        onBack={() => setMessageSubject(null)}
      />
    ) : null;

  const floorTables = (
    <>
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
              const detail = tableDetail(floor, table.id);
              return {
                ...tableCardText({
                  table,
                  detail,
                  debt: debt ? format.dram(debt) : null,
                  now,
                  t,
                  time: format.time,
                  minutesSince: format.minutesSince,
                }),
                // The next booking's thread and the sitting party's: either badges.
                messages:
                  (detail?.nextReservationUnreadMessages ?? 0) +
                  (detail?.sittingUnreadMessages ?? 0),
              };
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
          <QueryFailureNotice error={floorQuery.error} onRetry={() => void floorQuery.refetch()} />
        </div>
      )}
    </>
  );

  /** The tapped table's panel: beside the floor on the tablet, a bottom sheet on the phone. */
  const tablePanel = (variant: 'rail' | 'sheet') =>
    selection && selectedTable ? (
      <TableActionPanel
        // A fresh panel per table: a question opened, a reason picked or a
        // party counted on one table never carries over to the next.
        key={selection.tableId}
        table={selectedTable}
        tableService={features.tableService}
        detail={selectedDetail}
        timeZoneId={timeZoneId}
        projectedStatus={queue.projected(selection.tableId)}
        tab={selectedTabQuery.data ?? null}
        billRequest={billRequestsFor(selectedTabId)[0] ?? null}
        pending={pendingTableIds.has(selection.tableId)}
        online={queue.online}
        affectedReservations={affected.get(selection.tableId) ?? []}
        // The floor's own (wire §0a), or the awaiting list's for a next
        // booking that still waits for an answer, from a server before it.
        nextBookingRecord={
          selectedDetail?.nextReservationGuestRecord ??
          awaitingQuery.data?.find((request) => request.id === selectedDetail?.nextReservationId)
            ?.guestRecord ??
          null
        }
        releasing={releaseReservation.isPending}
        onAct={act}
        onRelease={release}
        // A booking by hand for this table (2026-10-31): the sheet, the table chosen.
        onBookTable={() => {
          staffBooking.openSheet(selection.tableId);
          setSelection(null);
        }}
        // The table's next booking, when staff took it and it is time to call:
        // "Coming" and "Not coming" in place of the automatic question.
        nextBookingToCall={
          staffBooking.toCall.find(
            (row) => row.reservationId === selectedDetail?.nextReservationId,
          ) ?? null
        }
        onGuestNotComing={(row) =>
          release(row.reservationId, 'guestCancelled', {
            startUtc: row.startUtc,
            guestName: row.guestName,
          })
        }
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
        // The booking's pre-order, while it is on the rail: the same card.
        preOrder={preOrderForTable(
          duePreOrders,
          selection.tableId,
          selectedDetail?.nextReservationId,
          selectedDetail?.physicalStatus === 'occupied',
        )}
        onPreOrderDone={preOrderDone}
        nextBookingAwaiting={
          awaitingQuery.data?.some((request) => request.id === selectedDetail?.nextReservationId) ??
          false
        }
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
          // On the phone the floor under the sheet is inert until the
          // sheet has gone, so the focus waits for that render.
          const back = () =>
            document
              .querySelector<HTMLElement>(`.table-row[data-table-id="${CSS.escape(tableId)}"]`)
              ?.focus();
          if (variant === 'sheet') setTimeout(back, 0);
          else back();
        }}
        transferTargets={transferTargets}
        transferTargetsFailed={transferTargetsFailed}
        transferNotYours={transferNotYours}
        onWantTransfer={() => {
          if (!selectedTabId) return;
          // Read afresh each time it opens: who holds how many tables moves.
          void queryClient.invalidateQueries({
            queryKey: queryKeys.transferTargets(selectedTabId),
          });
          setTransferWantedFor(selectedTabId);
        }}
        onTransfer={(target, onDone) => {
          if (selectedTabId) transfer(selectedTabId, selectedTable.label, target, onDone);
        }}
        transferring={transferTab.isPending}
        actorName={identity.fullName}
        variant={variant}
        onMessageGuest={
          variant === 'sheet'
            ? (reservationId: string) =>
                openConversation({ kind: 'reservation', id: reservationId })
            : undefined
        }
      />
    ) : null;

  /** "Call the guest" (2026-10-31): the staff-taken bookings in their window, on the rail or on Now. */
  const toCallSection = (variant: 'rail' | 'phone') => {
    const props = {
      branchId,
      rows: staffBooking.toCall,
      timeZoneId,
      online: queue.online,
      loading: staffBooking.toCallQuery.isLoading && !isOfflinePaused(staffBooking.toCallQuery),
      failed:
        staffBooking.toCallQuery.isError ||
        (isOfflinePaused(staffBooking.toCallQuery) && !staffBooking.toCallQuery.data),
      onNotComing: (row: BookingToCall) =>
        release(row.reservationId, 'guestCancelled', {
          startUtc: row.startUtc,
          guestName: row.guestName,
        }),
    };
    return variant === 'phone' ? (
      <PhoneToCallList {...props} />
    ) : (
      <ToCallSection {...props} variant="rail" />
    );
  };

  /** The New booking sheet, while it is open: over the floor, on either shell. */
  const bookingSheet = staffBooking.sheet ? (
    <NewBookingSheet
      // A fresh sheet per opening: nothing typed for one table carries to the next.
      key={staffBooking.sheet.tableId ?? 'any'}
      branchId={branchId}
      timeZoneId={timeZoneId}
      online={queue.online}
      me={identity.fullName}
      preselectedTableId={staffBooking.sheet.tableId}
      preselectedTableLabel={
        plan?.tables.find((table) => table.id === staffBooking.sheet?.tableId)?.label ?? null
      }
      variant={phone ? 'phone' : 'tablet'}
      onClose={staffBooking.closeSheet}
    />
  ) : null;

  /** The rail as both shells draw it, but for its frame, its approvals and its takeaway. */
  const rail: FloorRailShared = {
    summary,
    requests: requestsQuery.data ?? [],
    requestsFailed:
      requestsQuery.isError || (isOfflinePaused(requestsQuery) && !requestsQuery.data),
    requestsLoading: requestsQuery.isLoading && !isOfflinePaused(requestsQuery),
    orders,
    ordersLoading,
    ordersFailed,
    timeZoneId,
    onAcknowledge: acknowledge,
    onClaim: queue.online ? (request) => claim(request) : undefined,
    claiming,
    selfStaffMemberId: identity.staffMemberId,
    onAdvance: advanceOrder,
    withoutTable: branchId ? (
      <WithoutTableSection
        bookings={arriving}
        tables={plan?.tables ?? []}
        timeZoneId={timeZoneId}
        now={minute}
        onSeat={seatBooking}
        onRelease={(booking, outcome) => release(booking.id, outcome, booking)}
        releasing={releaseReservation.isPending}
        online={queue.online}
      />
    ) : null,
    noShows: branchId ? (
      <NoShowSection
        branchId={branchId}
        marked={undoableNoShows}
        online={queue.online}
        timeZoneId={timeZoneId}
        onSettled={(noShow, outcome) => undoSettled(noShow.reservationId, outcome)}
      />
    ) : null,
    preOrders: branchId ? (
      <PreOrderSection
        branchId={branchId}
        items={duePreOrders}
        timeZoneId={timeZoneId}
        loading={preOrdersQuery.isLoading && !isOfflinePaused(preOrdersQuery)}
        failed={preOrdersQuery.isError || (isOfflinePaused(preOrdersQuery) && !preOrdersQuery.data)}
        online={queue.online}
        onDone={preOrderDone}
      />
    ) : null,
    admissions: branchId ? (
      <AdmissionSection
        branchId={branchId}
        waiting={waitingTables}
        timeZoneId={timeZoneId}
        loading={admissionQuery.isLoading && !isOfflinePaused(admissionQuery)}
        failed={admissionQuery.isError || (isOfflinePaused(admissionQuery) && !admissionQuery.data)}
        online={queue.online}
        onDecided={admissionDecided}
        heldForLateParty={heldForLateParty}
      />
    ) : null,
    unresolved: unresolvedList,
    onSettle: settleUnresolved,
    messages: branchId ? (
      <MessagesRailSection
        branchId={branchId}
        items={inbox?.items ?? []}
        remindAfterMinutes={inbox?.remindAfterMinutes ?? 3}
        now={reminderClock}
        // Switched off at the branch: the rail reads, and replies nowhere.
        canWrite={canWriteMessages && features.messages}
        staffName={identity.fullName}
        timeZoneId={timeZoneId}
        online={queue.online}
        failed={inboxQuery.isError && !inboxQuery.data}
        icon={ICONS.chat}
        onReply={openConversation}
        onOpenInbox={() => openConversation(null)}
      />
    ) : null,
  };

  const overlays = (
    <>
      {bookingSheet}
      <FloorOverlays
        overlay={overlay}
        onOverlay={setOverlay}
        queue={queue}
        identity={identity}
        timeZoneId={timeZoneId}
        menu={menu}
        tabQuery={tabQuery}
        tableLabel={activeTabLabel}
        activeTabId={activeTabId}
        partySize={activePartySize}
        orderSent={orderSent}
        orderSendId={orderSend?.id ?? null}
        onSubmitOrder={submitOrder}
        onOrderSentDismissed={() => setOrderSend(null)}
        billRequests={activeBillRequests}
        cashRefusal={cashRefusal}
        tabActions={tabActions}
        openOnCash={cashFirst}
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
    </>
  );

  const shared = {
    screens,
    identity,
    features,
    branchId,
    timeZoneId,
    place,
    state,
    updatedAt,
    queue,
    onRefresh: () => void floorQuery.refetch(),
    onOpenConflicts: () => setOverlay('conflicts'),
    onNewBooking: () => staffBooking.openSheet(null),
    setSelection,
    minute,
    messagesWaiting,
    takeawayCounter,
    takeawayInUse,
    takeawayFailed: takeawayQuery.isError,
    takeawayToAnswer,
    awaitingQuery,
    freshRequests: awaiting.fresh,
    rail,
    onApprovalDecided: approvalDecided,
    onApprovalRefused: approvalRefused,
    notice: noticeNode,
    announcers,
    overlays,
    floorTables,
    takeawayCounterNode,
  };

  if (phone) {
    // --- The phone (staff phone spec, "Phone layout for /staff") -------------
    return (
      <FloorPhone
        {...shared}
        active={active}
        format={format}
        floor={floor}
        nowWaiting={nowWaiting}
        roster={roster}
        onUnpair={onUnpair}
        sheet={tablePanel('sheet')}
        toCall={toCallSection('phone')}
        messagesInbox={messagesInbox(true)}
      />
    );
  }

  return (
    <FloorTablet
      {...shared}
      orders={orders}
      board={board}
      heldOrders={heldMarks.orders}
      menu={menu.data}
      onUnknownDish={menu.refetch}
      onAdvance={advanceOrder}
      ordersLoading={ordersLoading}
      ordersFailed={ordersFailed}
      takeawayReady={takeawayReady}
      floorWaiting={nowWaiting}
      panelOpen={panelOpen}
      messagesFirst={reminders.due.length > 0}
      tablePanel={tablePanel('rail')}
      toCall={toCallSection('rail')}
      messagesInbox={messagesInbox(false)}
    />
  );
}
