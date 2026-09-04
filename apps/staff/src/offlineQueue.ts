/**
 * Persistent local queue for actions taken while offline.
 *
 * The wifi in a Yerevan cafe basement drops. When it does, a waiter still seats
 * people, still takes orders and still closes bills, and none of that can be
 * lost or silently discarded. Retrofitting this later would mean touching every
 * mutation in the app, so the interface is fixed now and the implementation
 * lands with the first real mutation.
 *
 * Three properties the eventual implementation must hold:
 *
 * 1. **Durable.** Survives an app kill and a tablet reboot — hence `expo-sqlite`
 *    rather than in-memory state. A queue that dies with the process is not a
 *    queue.
 * 2. **Idempotent.** Every entry carries a client-generated `id` that is sent to
 *    the backend as an idempotency key, so replaying an entry whose response was
 *    lost cannot double-add a round of drinks.
 * 3. **Ordered per table.** Two actions on the same table must replay in the
 *    order they were taken; a "free table" landing before the "seat walk-in" it
 *    followed would leave the floor wrong.
 */

export type QueuedActionKind =
  'seatWalkIn' | 'freeTable' | 'placeOrder' | 'closeTab' | 'holdBooking' | 'releaseBooking';

export interface QueuedAction {
  /** Client-generated, also sent as the backend idempotency key. */
  readonly id: string;
  readonly kind: QueuedActionKind;
  /** Scope actions are ordered within, normally a table id. */
  readonly scope: string;
  /** Action payload; shape depends on `kind`. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Epoch millis when the waiter took the action, not when it was sent. */
  readonly queuedAtMs: number;
  /** How many send attempts have been made. */
  readonly attempts: number;
  /** Row version held when the action was taken, sent as `If-Match`. */
  readonly expectedVersion?: string | undefined;
}

export type NewQueuedAction = Omit<QueuedAction, 'attempts'>;

export interface OfflineQueue {
  /** Add an action. Returns once it is durably stored, not once it is sent. */
  enqueue(action: NewQueuedAction): Promise<void>;
  /** Actions awaiting send, in replay order. */
  pending(): Promise<readonly QueuedAction[]>;
  /** Remove an action after the backend has accepted it. */
  acknowledge(id: string): Promise<void>;
  /** Record a failed attempt so backoff and a stuck-item warning are possible. */
  recordFailure(id: string): Promise<void>;
  /** Count of pending actions, for the "waiting to sync" badge. */
  size(): Promise<number>;
  /** Drop everything. Sign-out only. */
  clear(): Promise<void>;
}

/**
 * No-op implementation, wired in so the app boots and the call sites compile.
 *
 * It deliberately does **not** silently swallow actions: enqueuing warns in
 * development, because a no-op queue that looks like it works is exactly the
 * failure this module exists to prevent.
 */
export function createNoopOfflineQueue(): OfflineQueue {
  return {
    enqueue: (action) => {
      if (__DEV__) {
        console.warn(
          `[offlineQueue] Dropped "${action.kind}" (${action.id}): the queue is not implemented yet.`,
        );
      }
      return Promise.resolve();
    },
    pending: () => Promise.resolve([]),
    acknowledge: () => Promise.resolve(),
    recordFailure: () => Promise.resolve(),
    size: () => Promise.resolve(0),
    clear: () => Promise.resolve(),
  };
}

/**
 * The queue the app uses. Swapped for the `expo-sqlite` implementation in the
 * task that adds the first offline mutation.
 */
export const offlineQueue: OfflineQueue = createNoopOfflineQueue();
