import { useCallback, useEffect, useState } from 'react';
import { offlineQueue, type OfflineQueue } from './queue';

export interface QueueStatus {
  /** How many actions are durably stored and not yet accepted by the server. */
  readonly pendingCount: number;
  readonly isSyncing: boolean;
  /** The browser's own answer, which is the only honest one available. */
  readonly online: boolean;
}

/**
 * The queue, as something the header can render.
 *
 * The rule this hook exists to keep: **never show a synced state that is not
 * real.** `pendingCount` is read back out of IndexedDB rather than tracked in
 * memory, so a badge saying "nothing waiting" means the store is genuinely
 * empty — not that this tab happens to have forgotten what it queued.
 */
export function useQueueStatus(queue: OfflineQueue = offlineQueue): QueueStatus {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  const refresh = useCallback(() => {
    void queue.size().then(setPendingCount);
  }, [queue]);

  useEffect(() => {
    refresh();
    return queue.subscribe(refresh);
  }, [queue, refresh]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Replay on reconnect. Nothing enqueues actions yet, so today this is a
  // no-op that costs one IndexedDB read — and it is wired now so the task that
  // adds the first mutation does not also have to invent the sync trigger.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;

    void (async () => {
      if ((await queue.size()) === 0) return;
      if (cancelled) return;
      setIsSyncing(true);
      try {
        // TODO(prompt-7): pass the real sender once table-state changes and
        // orders are wired. Until then a rejection is correct: it leaves the
        // action queued rather than dropping it, which is the safe direction.
        await queue.sync(() => Promise.reject(new Error('No sender wired yet')));
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [online, queue]);

  return { pendingCount, isSyncing, online };
}
