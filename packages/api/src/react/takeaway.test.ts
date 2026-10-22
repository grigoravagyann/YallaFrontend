import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { Booking } from '../contracts/booking';
import type { DuePreOrders } from '../contracts/preOrder';
import type { ManagedBooking } from '../contracts/publicBranch';
import type {
  BranchTakeawayOrders,
  StaffTakeawayOrder,
  TakeawayOrder,
  TakeawaySettings,
} from '../contracts/takeaway';
import { DEFAULT_TAKEAWAY_SETTINGS } from '../contracts/takeaway';
import { queryKeys } from './index';
import {
  afterAskOnMyWay,
  afterManagedRunningLate,
  afterOnMyWay,
  afterRunningLate,
  askOnMyWayOptions,
} from './preOrders';
import {
  TAKEAWAY_ORDER_ACTIVE_POLL_MS,
  TAKEAWAY_ORDER_SENT_POLL_MS,
  afterTakeawayAction,
  afterTakeawayOrderChanged,
  afterTakeawaySettingsSaved,
  takeawayActionOptions,
  takeawayOrderPollMs,
} from './takeaway';

/**
 * What every takeaway and "I'm coming" mutation does to the cache
 * (2026-10-22): the answer goes straight onto what is on screen, and every
 * read that shows it is read again. Tested on a real `QueryClient` against
 * the exported keys, so an invalidation that misses a cache entry fails here
 * rather than on a tablet.
 */

const BRANCH = 'b-1';
const RESERVATION = 'r-1';

const ORDER = {
  id: 'tk-1',
  code: 'T-482',
  status: 'sent',
  branchId: BRANCH,
} as TakeawayOrder;

const STAFF = { id: 'tk-1', code: 'T-482', status: 'sent' } as StaffTakeawayOrder;

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

const invalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe("the guest's order", () => {
  it('goes onto its status screen, and the availability is read again', () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.takeawayAvailability(BRANCH), { branchId: BRANCH });

    afterTakeawayOrderChanged(queryClient, { ...ORDER, status: 'cancelled' });

    expect(queryClient.getQueryData<TakeawayOrder>(queryKeys.takeawayOrder('tk-1'))?.status).toBe(
      'cancelled',
    );
    expect(invalidated(queryClient, queryKeys.takeawayAvailability(BRANCH))).toBe(true);
  });

  it('is read often while sent, less while moving, never once finished', () => {
    expect(takeawayOrderPollMs({ ...ORDER, status: 'sent' })).toBe(TAKEAWAY_ORDER_SENT_POLL_MS);
    expect(takeawayOrderPollMs({ ...ORDER, status: 'accepted' })).toBe(
      TAKEAWAY_ORDER_ACTIVE_POLL_MS,
    );
    expect(takeawayOrderPollMs({ ...ORDER, status: 'ready' })).toBe(TAKEAWAY_ORDER_ACTIVE_POLL_MS);
    expect(takeawayOrderPollMs({ ...ORDER, status: 'collected' })).toBe(false);
    expect(takeawayOrderPollMs({ ...ORDER, status: 'declined' })).toBe(false);
    expect(takeawayOrderPollMs(undefined)).toBe(TAKEAWAY_ORDER_ACTIVE_POLL_MS);
  });
});

describe('a move at the counter', () => {
  it('replaces the card in its column, and the counter and the kitchen are read again', () => {
    const queryClient = client();
    const counter: BranchTakeawayOrders = {
      active: [STAFF, { ...STAFF, id: 'tk-2' }],
      finishedToday: [],
      sentCount: 2,
      readyCount: 0,
      asOfUtc: '2026-10-22T15:00:00Z',
    };
    queryClient.setQueryData(queryKeys.takeawayOrders(BRANCH), counter);
    queryClient.setQueryData(queryKeys.orderQueue(BRANCH), []);

    afterTakeawayAction(queryClient, BRANCH, { ...STAFF, status: 'accepted' });

    const read = queryClient.getQueryData<BranchTakeawayOrders>(queryKeys.takeawayOrders(BRANCH));
    expect(read?.active.map((order) => order.status)).toEqual(['accepted', 'sent']);
    expect(invalidated(queryClient, queryKeys.takeawayOrders(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.orderQueue(BRANCH))).toBe(true);
  });

  it('reads both again on a refusal, changing nothing itself', () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.takeawayOrders(BRANCH), { active: [STAFF] });
    afterTakeawayAction(queryClient, BRANCH, null);
    expect(invalidated(queryClient, queryKeys.takeawayOrders(BRANCH))).toBe(true);
  });

  describe('with the connection gone between the render and the tap', () => {
    afterEach(() => onlineManager.setOnline(true));

    it('fails the tap at once, never pausing it to send later', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { mutations: { networkMode: 'online', retry: false } },
      });
      onlineManager.setOnline(false);
      let attempts = 0;
      const observer = new MutationObserver(
        queryClient,
        takeawayActionOptions(queryClient, BRANCH, (_orderId: string) => {
          attempts += 1;
          return Promise.reject(new Error('Network request failed'));
        }),
      );
      const settled = observer.mutate('tk-1').catch(() => undefined);
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 50))]);
      expect(observer.getCurrentResult().isPaused).toBe(false);
      expect(attempts).toBe(1);
    });
  });
});

describe("the console's save", () => {
  it('caches the answer and reads the place page again', () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.publicBranchDetail(BRANCH), { takeaway: null });
    const saved: TakeawaySettings = { ...DEFAULT_TAKEAWAY_SETTINGS, enabled: true };
    afterTakeawaySettingsSaved(queryClient, BRANCH, saved);
    expect(queryClient.getQueryData(queryKeys.takeawaySettings(BRANCH))).toEqual(saved);
    expect(invalidated(queryClient, queryKeys.publicBranchDetail(BRANCH))).toBe(true);
  });
});

describe('"I\'m coming"', () => {
  it('puts running late on the cached booking and reads the bookings again', () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.booking(RESERVATION), { id: RESERVATION } as Booking);
    queryClient.setQueryData(queryKeys.bookings, { upcoming: [], past: [] });

    afterRunningLate(queryClient, {
      reservationId: RESERVATION,
      guestRunningLateMinutes: 15,
      guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
      expectedArrivalUtc: '2026-10-22T15:45:00Z',
    });

    expect(queryClient.getQueryData<Booking>(queryKeys.booking(RESERVATION))).toMatchObject({
      guestRunningLateMinutes: 15,
      guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
    });
    expect(invalidated(queryClient, queryKeys.bookings)).toBe(true);
  });

  it('clears the lateness when the guest says on my way after all', () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.booking(RESERVATION), {
      id: RESERVATION,
      guestRunningLateMinutes: 15,
      guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
    } as Booking);
    afterOnMyWay(queryClient, {
      reservationId: RESERVATION,
      guestConfirmedOnWayAtUtc: '2026-10-22T15:08:00Z',
      wasReplay: false,
    });
    expect(queryClient.getQueryData<Booking>(queryKeys.booking(RESERVATION))).toMatchObject({
      guestConfirmedOnWayAtUtc: '2026-10-22T15:08:00Z',
      guestRunningLateMinutes: null,
    });
  });

  it('takes the question off the manage link once answered late', () => {
    const queryClient = client();
    queryClient.setQueryData(queryKeys.managedBooking('tok'), {
      onYourWayAsked: true,
    } as ManagedBooking);
    afterManagedRunningLate(queryClient, 'tok', {
      reservationId: RESERVATION,
      guestRunningLateMinutes: 10,
      guestRunningLateAtUtc: '2026-10-22T15:05:00Z',
      expectedArrivalUtc: '2026-10-22T15:40:00Z',
    });
    expect(queryClient.getQueryData<ManagedBooking>(queryKeys.managedBooking('tok'))).toMatchObject(
      { onYourWayAsked: false, guestRunningLateMinutes: 10 },
    );
  });

  it("puts the venue's ask on the rail's card, and reads the rail, floor and awaiting list again", () => {
    const queryClient = client();
    queryClient.setQueryData<DuePreOrders>(queryKeys.duePreOrders(BRANCH), {
      items: [{ reservationId: RESERVATION, staffAskedOnMyWayAtUtc: null } as never],
      nextDueAtUtc: null,
    });
    queryClient.setQueryData(queryKeys.staffFloor(BRANCH), {});
    queryClient.setQueryData(queryKeys.awaitingApproval(BRANCH), []);

    afterAskOnMyWay(queryClient, BRANCH, {
      reservationId: RESERVATION,
      staffAskedOnMyWayAtUtc: '2026-10-22T14:50:00Z',
      nextAskAllowedAtUtc: '2026-10-22T15:05:00Z',
      notified: true,
    });

    expect(
      queryClient.getQueryData<DuePreOrders>(queryKeys.duePreOrders(BRANCH))?.items[0]
        ?.staffAskedOnMyWayAtUtc,
    ).toBe('2026-10-22T14:50:00Z');
    expect(invalidated(queryClient, queryKeys.duePreOrders(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.staffFloor(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.awaitingApproval(BRANCH))).toBe(true);
  });

  it('never queues the ask', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { networkMode: 'online', retry: false } },
    });
    onlineManager.setOnline(false);
    try {
      const observer = new MutationObserver(
        queryClient,
        askOnMyWayOptions(queryClient, BRANCH, () => Promise.reject(new Error('offline'))),
      );
      const settled = observer.mutate(RESERVATION).catch(() => undefined);
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 50))]);
      expect(observer.getCurrentResult().isPaused).toBe(false);
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
