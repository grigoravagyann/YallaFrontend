import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openStore } from '../offline/idb';
import { createIndexedDbQueue } from '../offline/queue';
import { createIdbTokenStorage } from './tokenStorage';

/**
 * The token store and the action queue live in the same browser. `idb-keyval`
 * creates an object store only when it creates its database, so two stores
 * that share a database name would leave whichever opened second unusable —
 * the failure that blanked the console on first load. This pins the fix: both
 * open, in either order, in one process.
 */
describe('refresh token storage', () => {
  it('reads back what it wrote, and clears', async () => {
    const storage = createIdbTokenStorage(openStore('auth'));

    expect(await storage.read()).toBeNull();
    await storage.write('refresh-1');
    expect(await storage.read()).toBe('refresh-1');
    await storage.clear();
    expect(await storage.read()).toBeNull();
  });

  it('coexists with the action queue in the same browser', async () => {
    const queue = createIndexedDbQueue(openStore('action-queue'));
    await queue.enqueue({ id: 'a1', kind: 'freeTable', scope: 't7', payload: {} });

    const storage = createIdbTokenStorage(openStore('auth'));
    await storage.write('refresh-2');

    expect(await storage.read()).toBe('refresh-2');
    expect(await queue.size()).toBe(1);

    // Neither store sees the other's rows.
    expect((await queue.pending()).map((a) => a.id)).toEqual(['a1']);
    await queue.clear();
    expect(await storage.read()).toBe('refresh-2');
  });
});
