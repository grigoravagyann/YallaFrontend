import type { TokenStorage } from '@yalla/api';
import { del, get, set, type UseStore } from 'idb-keyval';
import { openStore } from '../offline/idb';

const KEY = 'refreshToken';

/**
 * The refresh token, in IndexedDB.
 *
 * Same database and library as the offline queue, because it is durable and
 * not string-only. It is **not** a secret store: IndexedDB is readable by any
 * script running on this origin, exactly as `localStorage` is, so a script
 * injected into the page could read the token. The mitigation is keeping such
 * a script from running at all — the Content-Security-Policy the build puts on
 * the shell (`src/csp.ts`: `script-src 'self'`, no inline script, no
 * `eval`) — plus short-lived access tokens. The access token never touches
 * this store: it lives in memory and is re-minted on each launch. Moving the
 * refresh token into an HttpOnly cookie would take it out of script reach
 * entirely, and is a change to the auth contract rather than to this file.
 */
export function createIdbTokenStorage(store: UseStore = openStore('auth')): TokenStorage {
  return {
    read: async () => (await get<string>(KEY, store)) ?? null,
    write: (refreshToken) => set(KEY, refreshToken, store),
    clear: () => del(KEY, store),
  };
}
