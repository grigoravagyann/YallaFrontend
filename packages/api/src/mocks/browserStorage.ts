import { MOCK_JOURNAL_PREFIX, clearMockJournal, type MockJournalStorage } from './persistence';

/*
 * The two functions that touch `window.localStorage`, kept out of
 * `persistence.ts` on purpose. The bundler splits by module, and
 * `persistence.ts` rides in the chunk `resolveGateway` shares with the public
 * branch page — a page whose bundle may not name a storage API at all
 * (`apps/web/src/productionBundle.test.ts`). Only the console and the diner
 * app import this module.
 */

/**
 * Forget every mock world this browser holds. The "reset mock data" dev action:
 * the caller reloads the page afterwards, and every gateway starts from the
 * fixture. Returns how many worlds were forgotten.
 */
export function resetBrowserMockWorlds(): number {
  const storage = browserMockStorage();
  if (!storage) return 0;
  const keys: string[] = [];
  try {
    const local = window.localStorage;
    for (let index = 0; index < local.length; index += 1) {
      const key = local.key(index);
      if (key?.startsWith(MOCK_JOURNAL_PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }
  for (const key of keys) clearMockJournal(storage, key);
  return keys.length;
}

/**
 * `window.localStorage` when this is a browser that lets us read it, else null.
 *
 * Wrapped because a private window, or a browser with site data blocked,
 * throws on the *access* rather than returning null.
 */
export function browserMockStorage(): MockJournalStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}
