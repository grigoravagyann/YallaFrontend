import { describe, expect, it, vi } from 'vitest';
import { createSequenceStream, findSequenceGap, type SequencePage } from './sequenceStream';

/**
 * The sequence transport, which both apps now share.
 *
 * It moved here from the staff app precisely so a diner's phone and a waiter's
 * tablet cannot disagree about a bill, which makes its behaviour worth pinning
 * rather than trusting to whichever screen last exercised it.
 */

/** A controllable clock, so a test never actually waits four seconds. */
function fakeTimers() {
  const ticks: (() => void)[] = [];
  return {
    setInterval: ((fn: () => void) => {
      ticks.push(fn);
      return ticks.length as unknown as ReturnType<typeof globalThis.setInterval>;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: ((handle: number) => {
      ticks[(handle as number) - 1] = () => undefined;
    }) as unknown as typeof globalThis.clearInterval,
    /** Fire every live interval once. */
    tick: () => ticks.forEach((fn) => fn()),
    count: () => ticks.length,
  };
}

function handlers() {
  return {
    onItems: vi.fn(),
    onResync: vi.fn(),
    onError: vi.fn(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a stream with nothing read yet', () => {
  it('asks for a full refetch rather than guessing a starting sequence', async () => {
    const h = handlers();
    const fetchPage = vi.fn();
    const timers = fakeTimers();

    const stream = createSequenceStream({
      fetchPage,
      handlers: h,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    stream.start();
    await flush();

    // Starting from zero and asking for "everything after 0" would work by
    // accident today and silently fetch the world every poll. Saying so is the
    // honest answer, and it is what the caller turns into one full read.
    expect(h.onResync).toHaveBeenCalledWith('firstLoad');
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('a stream that has read up to a sequence', () => {
  it('delivers pages and advances', async () => {
    const h = handlers();
    const pages: SequencePage<string>[] = [
      { lastSequence: 42, items: ['a', 'b'] },
      { lastSequence: 43, items: ['c'] },
    ];
    const fetchPage = vi.fn(async () => pages.shift() ?? { lastSequence: 43, items: [] });
    const timers = fakeTimers();

    const stream = createSequenceStream({
      fetchPage,
      handlers: h,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    stream.setSequence(40);
    stream.start();
    await flush();

    expect(fetchPage).toHaveBeenCalledWith(40);
    expect(h.onItems).toHaveBeenCalledWith(['a', 'b']);

    stream.refresh();
    await flush();
    expect(fetchPage).toHaveBeenLastCalledWith(42);
    expect(h.onItems).toHaveBeenLastCalledWith(['c']);
  });

  it('never delivers an empty page as a change', async () => {
    const h = handlers();
    const stream = createSequenceStream({
      fetchPage: async () => ({ lastSequence: 40, items: [] }),
      handlers: h,
      ...fakeTimers(),
    });
    stream.setSequence(40);
    stream.start();
    await flush();

    expect(h.onItems).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('runs one request at a time', async () => {
    const h = handlers();
    let resolve: ((page: SequencePage<string>) => void) | undefined;
    const fetchPage = vi.fn(
      () =>
        new Promise<SequencePage<string>>((r) => {
          resolve = r;
        }),
    );

    const stream = createSequenceStream({ fetchPage, handlers: h, ...fakeTimers() });
    stream.setSequence(10);
    stream.start();
    await flush();

    // Three more pokes while the first is still in flight. Overlapping polls on
    // a slow connection deliver pages out of order and manufacture gaps that
    // are not there.
    stream.refresh();
    stream.refresh();
    stream.refresh();
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(1);

    resolve?.({ lastSequence: 11, items: ['x'] });
    await flush();
    stream.refresh();
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe('a stream the backend has not shipped', () => {
  it('says so once and stops asking', async () => {
    const h = handlers();
    class NotWired extends Error {}
    const fetchPage = vi.fn(async () => {
      throw new NotWired();
    });

    const stream = createSequenceStream({
      fetchPage,
      handlers: h,
      isUnavailable: (error) => error instanceof NotWired,
      ...fakeTimers(),
    });
    stream.setSequence(5);
    stream.start();
    await flush();

    expect(h.onResync).toHaveBeenCalledWith('notWired');
    expect(h.onError).not.toHaveBeenCalled();

    // Every later poll falls straight back to a full read without another
    // request. A client that asks again every four seconds fills the log with
    // the same 404 and teaches everyone to ignore it.
    stream.refresh();
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(h.onResync).toHaveBeenCalledTimes(2);
  });

  it('reports a real failure as an error, not as a resync', async () => {
    const h = handlers();
    const stream = createSequenceStream({
      fetchPage: async () => {
        throw new TypeError('Failed to fetch');
      },
      handlers: h,
      isUnavailable: () => false,
      ...fakeTimers(),
    });
    stream.setSequence(5);
    stream.start();
    await flush();

    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onResync).not.toHaveBeenCalled();
  });
});

describe('foreground and background', () => {
  it('changes interval without stopping, and polls straight away on return', async () => {
    const h = handlers();
    const fetchPage = vi.fn(async () => ({ lastSequence: 9, items: [] }));
    const timers = fakeTimers();

    const stream = createSequenceStream({
      fetchPage,
      handlers: h,
      foregroundMs: 1,
      backgroundMs: 100,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    stream.setSequence(9);
    stream.start();
    await flush();
    const afterStart = fetchPage.mock.calls.length;

    stream.setForeground(false);
    await flush();
    // Backgrounding does not poll and does not stop: the screen is still there.
    expect(fetchPage).toHaveBeenCalledTimes(afterStart);

    stream.setForeground(true);
    await flush();
    // Somebody picking the device up is asking a question, so it does not wait
    // out an interval.
    expect(fetchPage.mock.calls.length).toBeGreaterThan(afterStart);
  });

  it('stops polling when stopped', async () => {
    const h = handlers();
    const fetchPage = vi.fn(async () => ({ lastSequence: 9, items: [] }));
    const timers = fakeTimers();

    const stream = createSequenceStream({
      fetchPage,
      handlers: h,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    stream.setSequence(9);
    stream.start();
    await flush();
    stream.stop();

    const before = fetchPage.mock.calls.length;
    timers.tick();
    await flush();
    expect(fetchPage).toHaveBeenCalledTimes(before);
  });

  it('is idempotent on start', () => {
    const timers = fakeTimers();
    const stream = createSequenceStream({
      fetchPage: async () => ({ lastSequence: 1, items: [] }),
      handlers: handlers(),
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    stream.start();
    stream.start();
    stream.start();
    expect(timers.count()).toBe(1);
  });
});

describe('finding a gap', () => {
  it('accepts a contiguous run', () => {
    expect(findSequenceGap(40, [41, 42, 43])).toBeNull();
    expect(findSequenceGap(40, [])).toBeNull();
  });

  it('names the missing sequence', () => {
    expect(findSequenceGap(40, [42])).toEqual({ expected: 41, received: 42 });
    expect(findSequenceGap(40, [41, 43])).toEqual({ expected: 42, received: 43 });
  });

  it('is order-independent, because a page may arrive shuffled', () => {
    expect(findSequenceGap(40, [43, 41, 42])).toBeNull();
  });
});
