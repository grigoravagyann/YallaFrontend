import {
  useAwaitingApproval,
  useBookingsWithoutTable,
  useBranchConversations,
  useDuePreOrders,
  useNow,
  useOrderQueue,
  useServiceRequests,
  useTabsAwaitingAdmission,
  useTakeawayOrders,
} from '@yalla/api/react';
import { useMemo } from 'react';
import { useRequestArrivals } from '../ApprovalPanel';
import { useMessageReminders } from '../messages/useMessageReminders';
import { useCachedMenu } from '../useCachedMenu';
import { useMinuteClock } from '../useMinuteClock';
import type { FloorFeatures } from './floorFeatures';

/**
 * Everything the floor reads beside the floor itself: the menu, the kitchen's
 * queue, the calls, the bookings waiting for an answer, the bookings made by
 * time only waiting for a table, the tables waiting to be let in, the pre-orders, the takeaway counter and the guest messages.
 * Each paused while the tablet is locked, and each not asked where the
 * platform has not allowed its feature (`floorFeatures`).
 */
export function useFloorQueries(
  branchId: string,
  active: boolean,
  timeZoneId: string,
  features: FloorFeatures,
) {
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
  /**
   * Bookings made by time only that nobody has seated (2026-10-29): the
   * door's list, the floor's own read (waiter or above). Not read yet, or
   * refused: nothing is listed.
   */
  const withoutTableQuery = useBookingsWithoutTable(branchId, active);
  /** Tables that scanned with no verified number, waiting to be let in. */
  const admissionQuery = useTabsAwaitingAdmission(branchId, active && features.tableService);
  const waitingTables = useMemo(() => admissionQuery.data ?? [], [admissionQuery.data]);
  /**
   * Bookings with a pre-order, from the branch's `minutesBefore` until they
   * end or it is on their tab. Read again at the next card's time, on the
   * change stream's pre-order and booking signals, and after every action.
   */
  const preOrdersQuery = useDuePreOrders(branchId, active);
  const duePreOrders = useMemo(() => preOrdersQuery.data?.items ?? [], [preOrdersQuery.data]);
  /**
   * The takeaway counter (2026-10-22): the rail's "Takeaway · accept" cards,
   * the Takeaway page and its tab's count. Read again on the change stream's
   * takeaway signal (`useFloorLiveStream`, 2026-10-26), and polled every
   * minute, in the background too, for a stream that is not answering.
   */
  const takeawayQuery = useTakeawayOrders(branchId, active);
  const takeawayCounter = takeawayQuery.data ?? null;
  /**
   * Whether the branch has takeaway today: an order active or finished. A
   * venue that never took one is shown no tab, and no failure to read a
   * counter it does not have.
   */
  const takeawayInUse =
    takeawayCounter !== null &&
    (features.takeaway
      ? takeawayCounter.active.length > 0 || takeawayCounter.finishedToday.length > 0
      : // Blocked by the platform: only orders still in flight keep the counter.
        takeawayCounter.active.length > 0);
  /**
   * Guest messages (2026-10-23): the Messages tab and its badge, the rail's
   * section and the reminder. Polled every ten seconds, in the background too:
   * a guest's message pushes nothing to the tablet.
   */
  // Read even with guest messages off: a guest's "on my way" still matters.
  const inboxQuery = useBranchConversations(branchId, active);
  const inbox = inboxQuery.data ?? null;
  const reminderClock = useNow(15_000);
  const reminders = useMessageReminders(
    inbox?.items,
    inbox?.remindAfterMinutes ?? 3,
    reminderClock,
    active,
  );

  return {
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
  };
}
