import { clear, createStore, del, get, keys, set, type UseStore } from 'idb-keyval';

/**
 * The staff floor screen's durable action queue.
 *
 * The wifi in a Yerevan cafe basement drops. When it does a waiter still seats
 * people, still takes orders and still closes bills, and none of that may be
 * lost or silently discarded. Retrofitting this later would mean touching every
 * mutation in the app, so the interface is fixed now and the action types are
 * added by the tasks that introduce them.
 *
 * Three properties the implementation holds, and which the next tasks must not
 * break:
 *
 * 1. **Durable.** IndexedDB, not memory and not `localStorage` — it survives a
 *    tab close, a tablet reboot and the browser discarding the page. A queue
 *    that dies with the process is not a queue.
 * 2. **Idempotent.** Every entry carries a client-generated `id`, sent as the
 *    backend's idempotency key, so replaying an entry whose response was lost
 *    cannot double-add a round of drinks.
 * 3. **Ordered per scope.** Two actions on the same table replay in the order
 *    they were taken. A "free table" landing before the "seat walk-in" it
 *    followed would leave the floor wrong. Different tables are independent, so
 *    one stuck action does not freeze the whole floor.
 */

/**
 * The actions the queue will carry.
 *
 * Declared now, wired later: no screen enqueues any of these yet, which is the
 * point of scaffolding the queue before the features that need it.
 */
export type QueuedActionKind =
  'seatWalkIn' | 'freeTable' | 'placeOrder' | 'closeTab' | 'holdBooking' | 'releaseBooking';

export interface QueuedAction {
  /** Client-generated; also sent as the backend idempotency key. */
  readonly id: string;
  readonly kind: QueuedActionKind;
  /** What actions are ordered within — normally a table id. */
  readonly scope: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Epoch millis when the waiter took the action, not when it was sent. */
  readonly queuedAtMs: number;
  /** Monotonic within this device; the replay order. */
  readonly seq: number;
  readonly attempts: number;
  /** Row version held when the action was taken, sent as `If-Match`. */
  readonly expectedVersion?: string | undefined;
}

export type NewQueuedAction = Omit<QueuedAction, 'attempts' | 'seq' | 'queuedAtMs'> & {
  readonly queuedAtMs?: number;
};

/** What a caller supplies to actually send one action. */
export type SendAction = (action: QueuedAction) => Promise<void>;

export interface SyncResult {
  readonly sent: number;
  readonly failed: number;
  /** Still queued after the attempt. */
  readonly remaining: number;
}

export interface OfflineQueue {
  /** Add an action. Resolves once it is durably stored, not once it is sent. */
  enqueue(action: NewQueuedAction): Promise<void>;
  /** Everything awaiting send, in replay order. */
  pending(): Promise<readonly QueuedAction[]>;
  /** Remove an action the backend has accepted. */
  acknowledge(id: string): Promise<void>;
  /** Record a failed attempt, so backoff and a stuck-item warning are possible. */
  recordFailure(id: string): Promise<void>;
  size(): Promise<number>;
  /** Drop everything. Sign-out only. */
  clear(): Promise<void>;
  /**
   * Replay the queue. Per scope, in order, stopping that scope at its first
   * failure so a later action can never overtake the one it depends on.
   */
  sync(send: SendAction): Promise<SyncResult>;
  /** Fires whenever the queue's contents change, for the header badge. */
  subscribe(listener: () => void): () => void;
}

const SEQ_KEY = '__seq__';

/**
 * IndexedDB-backed queue.
 *
 * `idb-keyval` rather than raw IndexedDB: the raw API is event-based and every
 * project that touches it writes the same promise wrapper. It is not a
 * framework — one object store, one file of ours.
 */
export function createIndexedDbQueue(
  store: UseStore = createStore('yalla-staff', 'action-queue'),
): OfflineQueue {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  async function nextSeq(): Promise<number> {
    const current = (await get<number>(SEQ_KEY, store)) ?? 0;
    const next = current + 1;
    await set(SEQ_KEY, next, store);
    return next;
  }

  async function all(): Promise<QueuedAction[]> {
    const ids = (await keys(store)).filter((key): key is string => typeof key === 'string');
    const rows = await Promise.all(
      ids.filter((id) => id !== SEQ_KEY).map((id) => get<QueuedAction>(id, store)),
    );
    return rows
      .filter((row): row is QueuedAction => row !== undefined)
      .sort((a, b) => a.seq - b.seq);
  }

  return {
    async enqueue(action) {
      const stored: QueuedAction = {
        ...action,
        queuedAtMs: action.queuedAtMs ?? Date.now(),
        seq: await nextSeq(),
        attempts: 0,
      };
      await set(stored.id, stored, store);
      notify();
    },

    pending: all,

    async acknowledge(id) {
      await del(id, store);
      notify();
    },

    async recordFailure(id) {
      const existing = await get<QueuedAction>(id, store);
      if (!existing) return;
      await set(id, { ...existing, attempts: existing.attempts + 1 }, store);
      notify();
    },

    async size() {
      return (await all()).length;
    },

    async clear() {
      await clear(store);
      notify();
    },

    async sync(send) {
      const queued = await all();
      if (queued.length === 0) return { sent: 0, failed: 0, remaining: 0 };

      // Group by scope so a stuck table does not hold up the rest of the floor,
      // while order within a table is still guaranteed.
      const byScope = new Map<string, QueuedAction[]>();
      for (const action of queued) {
        const bucket = byScope.get(action.scope) ?? [];
        bucket.push(action);
        byScope.set(action.scope, bucket);
      }

      let sent = 0;
      let failed = 0;

      await Promise.all(
        [...byScope.values()].map(async (chain) => {
          for (const action of chain) {
            try {
              await send(action);
              await del(action.id, store);
              sent += 1;
            } catch {
              await set(action.id, { ...action, attempts: action.attempts + 1 }, store);
              failed += 1;
              // Stop this scope. The next action on this table depends on the
              // one that just failed, so sending it now would corrupt the floor.
              return;
            }
          }
        }),
      );

      notify();
      return { sent, failed, remaining: (await all()).length };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The queue the staff screen uses. */
export const offlineQueue: OfflineQueue = createIndexedDbQueue();
