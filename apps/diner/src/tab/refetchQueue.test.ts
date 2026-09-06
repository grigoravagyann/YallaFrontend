import { describe, expect, it } from 'vitest';
import { createRefetchCoalescer } from './refetchQueue';

/**
 * Four people ordering at a busy table must not mean four round trips.
 *
 * Events arrive batched per poll today and individually once a hub exists, so
 * the shape these tests describe is the one that only bites later — which is
 * exactly why it is worth pinning now.
 */

/** A run that resolves when the test says so, so the in-flight window is controllable. */
function controllable() {
  let calls = 0;
  const gates: Array<() => void> = [];

  const run = () => {
    calls += 1;
    return new Promise<void>((resolve) => gates.push(resolve));
  };

  return {
    run,
    get calls() {
      return calls;
    },
    /** Let the oldest in-flight run finish. */
    async release(): Promise<void> {
      gates.shift()?.();
      // Two microtask turns: one for the run's promise, one for the pump's loop.
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('coalescing refetches', () => {
  it('runs once for a single request', async () => {
    const gate = controllable();
    const coalescer = createRefetchCoalescer(gate.run);

    const first = coalescer.request();
    expect(gate.calls).toBe(1);

    await gate.release();
    await first;
    expect(gate.calls).toBe(1);
    expect(coalescer.pending).toBe(false);
  });

  // --- Test 4 ---------------------------------------------------------------
  it('produces at most two refetches for ten events in quick succession', async () => {
    const gate = controllable();
    const coalescer = createRefetchCoalescer(gate.run);

    // Ten events land while the first fetch is still in flight.
    const waits = Array.from({ length: 10 }, () => coalescer.request());

    // One started immediately; the other nine are collapsed into one queued run.
    expect(gate.calls).toBe(1);

    await gate.release(); // the first finishes, the queued one starts
    expect(gate.calls).toBe(2);

    await gate.release(); // the queued one finishes; nothing is waiting
    await Promise.all(waits);

    expect(gate.calls).toBe(2);
    expect(coalescer.pending).toBe(false);
  });

  it('never drops a request that arrived while a fetch was in flight', async () => {
    // The reason the cap is "one queued" and not "none". A request that arrives
    // mid-flight describes a change the in-flight run started too early to see;
    // dropping it would leave the bill one order out of date with nothing on
    // screen saying so.
    const gate = controllable();
    const coalescer = createRefetchCoalescer(gate.run);

    const first = coalescer.request();
    await Promise.resolve();
    const late = coalescer.request();

    await gate.release();
    await first;
    // The late one is not resolved by the run that was already going.
    expect(gate.calls).toBe(2);

    await gate.release();
    await expect(late).resolves.toBeUndefined();
  });

  it('resolves a request only after a run that began after it', async () => {
    const gate = controllable();
    const coalescer = createRefetchCoalescer(gate.run);

    coalescer.request();
    await Promise.resolve();

    let lateSettled = false;
    void coalescer.request().then(() => {
      lateSettled = true;
    });

    await gate.release();
    // Run 1 has finished. The late request must still be waiting: run 1 started
    // before it existed and cannot carry its change.
    expect(lateSettled).toBe(false);

    await gate.release();
    expect(lateSettled).toBe(true);
  });

  it('keeps serving requests after a run rejects', async () => {
    // A failed refetch is the query layer's problem to report. It must not
    // wedge the coalescer, or the screen stops updating for the rest of the meal.
    let calls = 0;
    const coalescer = createRefetchCoalescer(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
    });

    await expect(coalescer.request()).resolves.toBeUndefined();
    await expect(coalescer.request()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('starts a fresh run for a request that arrives after everything settled', async () => {
    const gate = controllable();
    const coalescer = createRefetchCoalescer(gate.run);

    const first = coalescer.request();
    await gate.release();
    await first;

    const second = coalescer.request();
    expect(gate.calls).toBe(2);
    await gate.release();
    await second;
  });
});

// --- Test 5 -------------------------------------------------------------------

describe('an announcement and the data it describes', () => {
  it('is not published before the refetch that makes it true has landed', async () => {
    // The ordering `useTabStream` depends on, isolated from React. A marker
    // published first renders "the waiter removed your Khorovats" against a
    // bill that still shows it and a total that has not moved — which reads as
    // a bug in the bill rather than an explanation of it.
    const order: string[] = [];
    const gate = controllable();
    const coalescer = createRefetchCoalescer(async () => {
      order.push('refetch:start');
      await gate.run();
      order.push('refetch:done');
    });

    const announced = coalescer.request().then(() => order.push('announce'));

    await gate.release();
    await announced;

    expect(order).toEqual(['refetch:start', 'refetch:done', 'announce']);
  });
});
