import type { FloorChange, FloorChangePage, StaffGateway } from '@yalla/api';
import { describe, expect, it, vi } from 'vitest';
import { createPollingLiveStream } from './stream';

/**
 * The floor's change stream over the gateway: what it asks for next.
 *
 * `lastSequence` on a page is the end of the branch's stream (the server's
 * `maxSequence`), not of the page. A page that says `hasMore` stopped short of
 * it, so the next read starts after the last row this page carried — never
 * after the end, which would skip what was not read (review S3).
 */

function row(sequence: number): FloorChange {
  return {
    sequence,
    tableId: 't1',
    tableLabel: '1',
    fromStatus: 'free',
    toStatus: 'occupied',
    atUtc: '2026-10-21T15:00:00Z',
    tableSessionId: null,
    reservationId: null,
    actor: 'staff',
    actorId: null,
    reason: '',
    tabId: null,
    signal: null,
  };
}

function timers() {
  const ticks: (() => void)[] = [];
  return {
    setInterval: ((fn: () => void) => {
      ticks.push(fn);
      return ticks.length;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => undefined) as unknown as typeof globalThis.clearInterval,
    tick: () => ticks.forEach((fn) => fn()),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the floor stream, a page at a time', () => {
  it('goes on after the last row of a page that has more, not after the end', async () => {
    const pages: FloorChangePage[] = [
      { branchId: 'b1', lastSequence: 900, hasMore: true, changes: [row(101), row(140)] },
      { branchId: 'b1', lastSequence: 900, hasMore: false, changes: [row(900)] },
    ];
    const getFloorChanges = vi.fn(async (_query: { afterSequence: number }) => pages.shift()!);
    const onChanges = vi.fn();
    const clock = timers();
    const stream = createPollingLiveStream({
      gateway: { getFloorChanges } as unknown as StaffGateway,
      branchId: 'b1',
      handlers: { onChanges, onResync: vi.fn(), onError: vi.fn() },
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval,
    });
    stream.setSequence(100);
    stream.start();
    await flush();
    clock.tick();
    await flush();

    expect(getFloorChanges.mock.calls.map(([query]) => query.afterSequence)).toEqual([100, 140]);
    expect(onChanges).toHaveBeenCalledTimes(2);
  });
});
