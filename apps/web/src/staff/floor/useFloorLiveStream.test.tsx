// @vitest-environment jsdom
import {
  cafeFloorPlan,
  createQueryClient,
  type FloorChange,
  type FloorChangePage,
  type StaffFloor,
  type StaffGateway,
} from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFloorLiveStream } from './useFloorLiveStream';

/**
 * The floor's change stream and the takeaway counter (2026-10-26): every move
 * of a takeaway order writes signal 8 on the branch's stream, and the floor —
 * the tablet and the staff phone — reads the counter and the kitchen's queue
 * again on it, at once, instead of waiting for the counter's slow poll. The
 * row is about no table, so the floor itself is neither patched nor read.
 */

const BRANCH = 'b1';

const FLOOR: StaffFloor = {
  plan: cafeFloorPlan,
  details: [],
  lastSequence: 10,
  asOfUtc: '2026-10-26T15:00:00Z',
};

const COUNTER = { active: [], finishedToday: [], sentCount: 0, readyCount: 0 };

function row(sequence: number, extra: Partial<FloorChange>): FloorChange {
  return {
    sequence,
    tableId: null,
    tableLabel: null,
    fromStatus: 'free',
    toStatus: 'free',
    atUtc: '2026-10-26T15:00:05Z',
    tableSessionId: null,
    reservationId: null,
    actor: 'system',
    actorId: null,
    reason: 'takeaway placed',
    tabId: null,
    signal: 'takeawayChanged',
    ...extra,
  };
}

/** A stream whose first page after the floor's sequence carries `changes`, then nothing. */
function gatewayWith(changes: readonly FloorChange[]) {
  const pages: FloorChangePage[] = [
    { branchId: BRANCH, lastSequence: changes.at(-1)?.sequence ?? 10, hasMore: false, changes },
  ];
  const getFloorChanges = vi.fn(
    async ({ afterSequence }: { afterSequence: number }): Promise<FloorChangePage> =>
      pages.shift() ?? {
        branchId: BRANCH,
        lastSequence: afterSequence,
        hasMore: false,
        changes: [],
      },
  );
  return { gateway: { getFloorChanges } as unknown as StaffGateway, getFloorChanges };
}

async function follow(changes: readonly FloorChange[]) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  const { gateway, getFloorChanges } = gatewayWith(changes);
  // Stable, as the route's state setter is: a new one would start a new stream.
  const setNotice = () => undefined;
  const hook = renderHook(
    ({ readAt }: { readAt: number }) =>
      useFloorLiveStream({
        branchId: BRANCH,
        active: true,
        gateway,
        queryClient,
        floorSequence: FLOOR.lastSequence,
        floorReadAt: readAt,
        setNotice,
      }),
    { initialProps: { readAt: 1 } },
  );
  // The first poll asks for a floor read (the stream does not know where it
  // is yet); the floor's answer then tells it, as a read does on the tablet.
  hook.rerender({ readAt: 2 });
  queryClient.setQueryData(queryKeys.staffFloor(BRANCH), FLOOR);
  queryClient.setQueryData(queryKeys.takeawayOrders(BRANCH), COUNTER);
  queryClient.setQueryData(queryKeys.orderQueue(BRANCH), []);
  queryClient.setQueryData(queryKeys.duePreOrders(BRANCH), { items: [], nextDueAtUtc: null });

  await act(() => vi.advanceTimersByTimeAsync(4_100));
  expect(getFloorChanges).toHaveBeenCalledWith({ branchId: BRANCH, afterSequence: 10 });

  const invalidated = (key: readonly unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated === true;
  return { queryClient, invalidated, hook };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T15:00:00Z'), shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a takeaway signal on the change stream', () => {
  it("reads the takeaway counter and the kitchen's queue again at once", async () => {
    const { invalidated } = await follow([row(11, {})]);

    expect(invalidated(queryKeys.takeawayOrders(BRANCH))).toBe(true);
    expect(invalidated(queryKeys.orderQueue(BRANCH))).toBe(true);
  });

  it('neither reads the floor again nor patches it, and moves the floor on past the row', async () => {
    const { queryClient, invalidated } = await follow([
      row(11, {}),
      row(12, { reason: 'takeaway collected' }),
    ]);

    expect(invalidated(queryKeys.staffFloor(BRANCH))).toBe(false);
    expect(invalidated(queryKeys.duePreOrders(BRANCH))).toBe(false);
    const floor = queryClient.getQueryData<StaffFloor>(queryKeys.staffFloor(BRANCH));
    expect(floor?.details).toEqual(FLOOR.details);
    expect(floor?.plan).toEqual(FLOOR.plan);
    expect(floor?.lastSequence).toBe(12);
  });

  it('leaves the counter alone on a change that is not about takeaway', async () => {
    const { invalidated } = await follow([
      row(11, { signal: 'preOrderChanged', reason: '', reservationId: 'r-1', tableId: 't1' }),
    ]);

    expect(invalidated(queryKeys.duePreOrders(BRANCH))).toBe(true);
    expect(invalidated(queryKeys.takeawayOrders(BRANCH))).toBe(false);
  });

  it('reads the counter again on a signal this build does not know', async () => {
    const { invalidated } = await follow([row(11, { signal: 'unknown' })]);

    expect(invalidated(queryKeys.takeawayOrders(BRANCH))).toBe(true);
  });
});
