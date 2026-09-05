import { get, set, del, type UseStore } from 'idb-keyval';
import type { ConflictEntry, QueuedCommand } from '../staff/commands/types';
import { openStore } from './idb';

/**
 * Where the counter screen's unsent work lives between page loads.
 *
 * IndexedDB, not memory and not `localStorage`. A queue that dies with the
 * process is not a queue: the tablet on the counter gets its screen locked, its
 * browser reaps the tab, and somebody reboots it mid-service. Every one of those
 * must leave the four seats a waiter just filled still waiting to be sent.
 *
 * The **conflict list is stored too**, and that is deliberate. A conflict that
 * vanishes on reload is a decision nobody made — the whole reason it exists is
 * that a person has to choose between discard and apply anyway, and a reload is
 * not a choice.
 *
 * Both lists are written whole rather than key-per-entry. They are tens of
 * entries at the very worst, one `put` is atomic, and a partially written queue
 * is a class of bug this screen cannot afford to debug in a basement.
 */

const QUEUE_KEY = 'staff:queue:v1';
const CONFLICTS_KEY = 'staff:conflicts:v1';

export interface CommandStore {
  loadQueue(): Promise<readonly QueuedCommand[]>;
  loadConflicts(): Promise<readonly ConflictEntry[]>;
  saveQueue(queue: readonly QueuedCommand[]): Promise<void>;
  saveConflicts(conflicts: readonly ConflictEntry[]): Promise<void>;
  /** Sign-out only. Never a recovery step. */
  clear(): Promise<void>;
}

export function createCommandStore(store: UseStore = openStore('action-queue')): CommandStore {
  return {
    async loadQueue() {
      // A read that throws — a private window, a browser with site data
      // blocked — must not stop the floor from rendering. An empty queue is
      // wrong but survivable; a blank screen on a counter is neither.
      try {
        return (await get<QueuedCommand[]>(QUEUE_KEY, store)) ?? [];
      } catch {
        return [];
      }
    },

    async loadConflicts() {
      try {
        return (await get<ConflictEntry[]>(CONFLICTS_KEY, store)) ?? [];
      } catch {
        return [];
      }
    },

    async saveQueue(queue) {
      if (queue.length === 0) {
        await del(QUEUE_KEY, store);
        return;
      }
      await set(QUEUE_KEY, [...queue], store);
    },

    async saveConflicts(conflicts) {
      if (conflicts.length === 0) {
        await del(CONFLICTS_KEY, store);
        return;
      }
      await set(CONFLICTS_KEY, [...conflicts], store);
    },

    async clear() {
      await del(QUEUE_KEY, store);
      await del(CONFLICTS_KEY, store);
    },
  };
}

/** An in-memory store, for tests and for a browser with no IndexedDB at all. */
export function createMemoryCommandStore(): CommandStore {
  let queue: readonly QueuedCommand[] = [];
  let conflicts: readonly ConflictEntry[] = [];
  return {
    loadQueue: async () => queue,
    loadConflicts: async () => conflicts,
    saveQueue: async (next) => {
      queue = next;
    },
    saveConflicts: async (next) => {
      conflicts = next;
    },
    clear: async () => {
      queue = [];
      conflicts = [];
    },
  };
}

export const commandStore: CommandStore = createCommandStore();
