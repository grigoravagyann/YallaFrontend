// A real IndexedDB implementation, in-process. The queue's whole purpose is
// that actions survive things memory does not, so testing it against a stub
// store would test nothing that matters.
import 'fake-indexeddb/auto';

import { createStore } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbQueue, type NewQueuedAction, type QueuedAction } from './queue';

let dbCount = 0;
/** A fresh database per test, so one test's queue cannot leak into the next. */
function freshQueue() {
  dbCount += 1;
  return createIndexedDbQueue(createStore(`yalla-test-${dbCount}`, 'action-queue'));
}

function action(id: string, scope: string): NewQueuedAction {
  return { id, kind: 'freeTable', scope, payload: {} };
}

describe('offline queue', () => {
  let queue: ReturnType<typeof freshQueue>;

  beforeEach(() => {
    queue = freshQueue();
  });

  it('stores an action and reports it as pending', async () => {
    await queue.enqueue(action('a1', 't1'));

    expect(await queue.size()).toBe(1);
    expect((await queue.pending())[0]?.id).toBe('a1');
  });

  it('replays in the order the waiter took the actions, not the order they arrive back', async () => {
    await queue.enqueue(action('a1', 't1'));
    await queue.enqueue(action('a2', 't1'));
    await queue.enqueue(action('a3', 't1'));

    expect((await queue.pending()).map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('survives a new queue object over the same store — this is the whole point', async () => {
    const store = createStore('yalla-durable', 'action-queue');
    const first = createIndexedDbQueue(store);
    await first.enqueue(action('a1', 't1'));

    // A tab close, a reload, a tablet reboot: a different object, same data.
    const second = createIndexedDbQueue(store);
    expect(await second.size()).toBe(1);
  });

  it('sends in order and clears what the server accepted', async () => {
    await queue.enqueue(action('a1', 't1'));
    await queue.enqueue(action('a2', 't1'));

    const sentIds: string[] = [];
    const result = await queue.sync(async (a: QueuedAction) => {
      sentIds.push(a.id);
    });

    expect(sentIds).toEqual(['a1', 'a2']);
    expect(result).toEqual({ sent: 2, failed: 0, remaining: 0 });
    expect(await queue.size()).toBe(0);
  });

  it('stops a table at its first failure, so a later action cannot overtake the one it depends on', async () => {
    await queue.enqueue(action('seat', 't1'));
    await queue.enqueue(action('free', 't1'));

    const send = vi.fn(async (a: QueuedAction) => {
      if (a.id === 'seat') throw new Error('offline');
    });

    const result = await queue.sync(send);

    // "free table" must not land while the "seat walk-in" it followed is still
    // unsent — that would leave the floor showing the opposite of the truth.
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(0);
    expect(await queue.size()).toBe(2);
  });

  it('a stuck table does not freeze the rest of the floor', async () => {
    await queue.enqueue(action('stuck', 't1'));
    await queue.enqueue(action('fine', 't2'));

    const result = await queue.sync(async (a: QueuedAction) => {
      if (a.scope === 't1') throw new Error('offline');
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect((await queue.pending()).map((a) => a.id)).toEqual(['stuck']);
  });

  it('counts attempts, so backoff and a stuck-item warning are possible later', async () => {
    await queue.enqueue(action('a1', 't1'));
    await queue.sync(() => Promise.reject(new Error('offline')));
    await queue.sync(() => Promise.reject(new Error('offline')));

    expect((await queue.pending())[0]?.attempts).toBe(2);
  });

  it('a failed send leaves the action queued rather than dropping it', async () => {
    await queue.enqueue(action('a1', 't1'));
    await queue.sync(() => Promise.reject(new Error('offline')));

    expect(await queue.size()).toBe(1);
  });

  it('notifies subscribers so the header badge cannot go stale', async () => {
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    await queue.enqueue(action('a1', 't1'));
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    await queue.enqueue(action('a2', 't1'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clear empties everything, including the sequence counter', async () => {
    await queue.enqueue(action('a1', 't1'));
    await queue.clear();

    expect(await queue.size()).toBe(0);
    await queue.enqueue(action('a2', 't1'));
    expect((await queue.pending())[0]?.seq).toBe(1);
  });
});
