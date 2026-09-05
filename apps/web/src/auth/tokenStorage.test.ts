import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createCommandStore } from '../offline/commandStore';
import { openStore } from '../offline/idb';
import type { QueuedCommand } from '../staff/commands/types';
import { createIdbTokenStorage } from './tokenStorage';

/**
 * The token store and the command queue live in the same browser. `idb-keyval`
 * creates an object store only when it creates its database, so two stores that
 * share a database name would leave whichever opened second unusable — the
 * failure that blanked the console on first load. This pins the fix: both open,
 * in either order, in one process.
 */

function command(id: string): QueuedCommand {
  return {
    id,
    kind: 'freeTable',
    scope: 't7',
    seq: 1,
    takenAtMs: 1_000,
    attempts: 0,
    precondition: { expectedFromStatus: 'occupied', rowVersion: null },
    subject: { tableId: 't7', tableLabel: '7', tabId: null },
    body: {
      kind: 'freeTable',
      command: { kind: 'freeTable', branchId: 'b1', tableId: 't7', clientCommandId: id },
    },
  };
}

describe('refresh token storage', () => {
  it('reads back what it wrote, and clears', async () => {
    const storage = createIdbTokenStorage(openStore('auth'));

    expect(await storage.read()).toBeNull();
    await storage.write('refresh-1');
    expect(await storage.read()).toBe('refresh-1');
    await storage.clear();
    expect(await storage.read()).toBeNull();
  });

  it('coexists with the command queue in the same browser', async () => {
    const store = createCommandStore(openStore('action-queue'));
    await store.saveQueue([command('a1')]);

    const storage = createIdbTokenStorage(openStore('auth'));
    await storage.write('refresh-2');

    expect(await storage.read()).toBe('refresh-2');
    expect((await store.loadQueue()).map((entry) => entry.id)).toEqual(['a1']);

    // Neither store sees the other's rows.
    await store.clear();
    expect(await store.loadQueue()).toEqual([]);
    expect(await storage.read()).toBe('refresh-2');
  });
});

/**
 * The durable half of the queue, against a real IndexedDB.
 *
 * The reducer decides *what* survives; this decides *whether* it does. A tablet
 * gets its browser reaped and rebooted mid-service, and the two lists have to
 * come back exactly as they went in — the conflict list included, because a
 * conflict that vanishes on restart is a decision nobody made.
 */
describe('the command store', () => {
  it('returns both lists across a fresh store object over the same database', async () => {
    const first = createCommandStore(openStore('action-queue'));
    await first.saveQueue([command('c1'), { ...command('c2'), seq: 2 }]);
    await first.saveConflicts([
      {
        command: command('c3'),
        detectedAtMs: 2_000,
        observed: null,
        reason: 'precondition',
      },
    ]);

    // A new object over the same store is what a page reload actually is.
    const second = createCommandStore(openStore('action-queue'));
    expect((await second.loadQueue()).map((entry) => entry.id)).toEqual(['c1', 'c2']);
    expect((await second.loadConflicts()).map((entry) => entry.command.id)).toEqual(['c3']);
    expect((await second.loadConflicts())[0]?.reason).toBe('precondition');

    await second.clear();
    expect(await second.loadQueue()).toEqual([]);
    expect(await second.loadConflicts()).toEqual([]);
  });

  it('keeps the precondition captured at the tap', async () => {
    const store = createCommandStore(openStore('action-queue'));
    await store.saveQueue([command('c9')]);

    // The whole point of storing it: the command has to be checkable against the
    // world it will land in, not the world it is replayed from.
    expect((await store.loadQueue())[0]?.precondition).toEqual({
      expectedFromStatus: 'occupied',
      rowVersion: null,
    });
  });
});
