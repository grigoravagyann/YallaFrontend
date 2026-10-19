import type * as CommandStoreModule from '../offline/commandStore';
import type { CommandStore } from '../offline/commandStore';

/**
 * The command queue's store, in memory and fresh for every test.
 *
 * Screen tests are about the screen, not IndexedDB. Under a loaded runner the
 * fake IndexedDB read the queue hydrates from took over a second, and a tap
 * made before it finished waited for it — the tests that asserted a queued
 * command reached the gateway flaked on that wait (and, before the reducer
 * kept such taps, the command was lost). `commands/` and `offline/` pin the
 * store and the hydration themselves.
 *
 * Use it from a test file:
 *
 *     vi.mock('../offline/commandStore', async (importOriginal) =>
 *       (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
 *     );
 *
 * and call `resetCommandStore()` after each test. Not a `.test.ts`, and
 * imported by tests only, so nothing of it reaches a bundle.
 */

let make: (() => CommandStore) | null = null;
let current: CommandStore | null = null;

export function withMemoryStore(actual: typeof CommandStoreModule): typeof CommandStoreModule {
  make = actual.createMemoryCommandStore;
  current = make();
  const delegate = new Proxy({} as CommandStore, {
    get:
      (_, key: keyof CommandStore) =>
      (...args: unknown[]) =>
        (current![key] as (...a: unknown[]) => unknown)(...args),
  });
  return { ...actual, commandStore: delegate };
}

export function resetCommandStore(): void {
  if (make) current = make();
}
