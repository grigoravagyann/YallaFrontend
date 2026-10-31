import {
  readsPreOrderRail,
  readsTakeawayCounter,
  type AwaitingApproval,
  type StaffFloor,
  type StaffGateway,
} from '@yalla/api';
import { afterTakeawaySignal, queryKeys } from '@yalla/api/react';
import type { LiveStream } from '@yalla/realtime';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { blockCancelledNews } from '../live/blockCancelled';
import { applyFloorChanges } from '../live/sequence';
import { createPollingLiveStream } from '../live/stream';
import type { SetNotice } from './notices';

/**
 * How often the floor is read whole while the tablet is in front of somebody,
 * whatever the change stream says. The stream carries table transitions,
 * admission signals and takeaway's (which read the counter again); a booking made, approved, moved, cancelled or undone
 * writes no row of its own, and a table's "reserved soon" is the server's to
 * draw from the clock. This read is what brings those in (review B1). Focus
 * and a connection coming back read it too, as every query does.
 */
export const FLOOR_REFRESH_MS = 30_000;

/** The minute an instant falls in, so a poll every few seconds re-renders once a minute. */
function minuteOf(at: number): number {
  return at - (at % 60_000);
}

export interface UseFloorLiveStreamOptions {
  readonly branchId: string;
  readonly active: boolean;
  readonly gateway: StaffGateway;
  readonly queryClient: QueryClient;
  /** The floor query's last answer: its sequence, and when it was read. */
  readonly floorSequence: number | undefined;
  readonly floorReadAt: number;
  readonly setNotice: SetNotice;
}

/**
 * The change stream, the 30-second safety read and what both fold into the
 * cache — and, for the header's chip, whether the stream is answering.
 */
export function useFloorLiveStream({
  branchId,
  active,
  gateway,
  queryClient,
  floorSequence,
  floorReadAt,
  setNotice,
}: UseFloorLiveStreamOptions) {
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
  /** The change stream while it runs: told where every floor read left off. */
  const streamRef = useRef<LiveStream | null>(null);

  /*
   * Every read of the floor — the stream's own resync, the 30-second safety
   * read, one after a command or a decision — tells the stream where it is
   * now (review S2). Without it the stream stayed at 0, never read a change
   * and asked for the whole floor on every poll; and a read for any other
   * reason left the floor ahead of the stream.
   */
  useEffect(() => {
    if (floorSequence !== undefined) streamRef.current?.setSequence(floorSequence);
  }, [floorSequence, floorReadAt]);

  // The safety read, in the foreground only; a hidden tablet waits for focus.
  useEffect(() => {
    if (!branchId || !active) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void queryClient.invalidateQueries(
        { queryKey: queryKeys.staffFloor(branchId) },
        { cancelRefetch: false },
      );
    }, FLOOR_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, branchId, queryClient]);

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
            // Bookings a guest's no-show block cancelled: the requests are
            // read again (the card goes with its booking), and the floor is
            // told only of those due soon here (review S6) — never over a
            // no-show's undo, which may be the very one that set the block off.
            const byBlock = signalled.filter(
              (change) => change.signal === 'bookingCancelledByBlock',
            );
            // A booking made, approved, declined, moved or cancelled anywhere
            // (signal 5): the requests may have changed too. A signal this
            // build does not know reads them (and the pre-orders) again too.
            const unknownSignal = signalled.some((change) => change.signal === 'unknown');
            if (unknownSignal || signalled.some((change) => change.signal === 'bookingChanged')) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.awaitingApproval(branchId),
              });
              // And the door's list: a booking made by time only writes no
              // row while it has no table, but one seated elsewhere does.
              void queryClient.invalidateQueries({
                queryKey: queryKeys.bookingsWithoutTable(branchId),
              });
              // And whom to call: a staff-taken booking seated, let go or taken.
              void queryClient.invalidateQueries({ queryKey: queryKeys.bookingsToCall(branchId) });
            }
            // A pre-order changed anywhere (signal 6) — the branch's pre-order
            // settings included — or a booking did (5), or a block cancelled
            // one (4, its only row): the rail's cards are read again, never
            // patched from the row.
            if (unknownSignal || signalled.some((change) => readsPreOrderRail(change.signal))) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.duePreOrders(branchId),
              });
            }
            // A takeaway order moved anywhere at the branch (signal 8,
            // 2026-10-26): the counter and the kitchen's queue are read again
            // at once, instead of at the counter's next poll. The row names no
            // table and no order, and the fold below passes over it.
            if (unknownSignal || signalled.some((change) => readsTakeawayCounter(change.signal))) {
              afterTakeawaySignal(queryClient, branchId);
            }
            // A tab written off (signal 9, 2026-10-27): its calls were answered
            // and its orders left the kitchen's queue with it. Both are read
            // again at once, not at the calls' next poll; so is the floor,
            // through the fold's gap below.
            if (unknownSignal || signalled.some((change) => change.signal === 'tabWrittenOff')) {
              void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branchId) });
              void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
            }
            if (byBlock.length > 0) {
              const news = blockCancelledNews(
                byBlock,
                current,
                queryClient.getQueryData<readonly AwaitingApproval[]>(
                  queryKeys.awaitingApproval(branchId),
                ) ?? [],
                new Date(),
              );
              void queryClient.invalidateQueries({
                queryKey: queryKeys.awaitingApproval(branchId),
              });
              if (news.length > 0) {
                setNotice((shown) =>
                  shown?.undo ? shown : { kind: 'info', text: '', blockCancelled: news },
                );
              }
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
          // The floor read again; the stream goes on from the sequence that
          // read answers at (see the effect above). Not cancelling a read
          // already on its way: on a slow link the first load would never
          // finish (review N6).
          void queryClient.invalidateQueries(
            { queryKey: queryKeys.staffFloor(branchId) },
            { cancelRefetch: false },
          );
          void queryClient.invalidateQueries({
            queryKey: queryKeys.tabsAwaitingAdmission(branchId),
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.duePreOrders(branchId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.takeawayOrders(branchId) });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.bookingsWithoutTable(branchId),
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.bookingsToCall(branchId) });
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

    streamRef.current = stream;
    stream.start();

    const onVisibility = () => {
      stream.setForeground(document.visibilityState === 'visible');
    };
    const onOnline = () => stream.refresh();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      stream.stop();
      streamRef.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [active, branchId, gateway, queryClient, setNotice]);

  return { streamFailing, answeredAt, staleSince };
}
