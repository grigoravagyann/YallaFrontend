import type { TokenStorage } from '@yalla/api';
import { del, get, set, type UseStore } from 'idb-keyval';
import { openStore } from '../offline/idb';

const KEY = 'refreshToken';

/**
 * The refresh token, in IndexedDB.
 *
 * Same database and library as the offline queue, for the same reason: it is
 * the one browser store that is durable, not string-only, and not exposed to
 * every script on the page the way `localStorage` is. The access token never
 * touches it — that lives in memory and is re-minted on each launch.
 */
export function createIdbTokenStorage(store: UseStore = openStore('auth')): TokenStorage {
  return {
    read: async () => (await get<string>(KEY, store)) ?? null,
    write: (refreshToken) => set(KEY, refreshToken, store),
    clear: () => del(KEY, store),
  };
}
