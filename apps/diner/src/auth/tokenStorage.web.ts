import type { TokenStorage } from '@yalla/api';
import { isDevBuild, webStorage } from './webStorage';

const KEY = 'yalla.diner.refreshToken';

/**
 * The web build's refresh-token store. Same name and shape as the phone's
 * keychain store, so Metro swaps this file in and the session code does not know.
 *
 * Kept in `localStorage` only in a development build, where surviving a reload
 * is what makes the QA target usable. Any other build keeps it in memory: the
 * web target is not a product surface, and a thirty-day credential readable by
 * every script on the page is not something to leave behind in a browser — a
 * reload there means logging in again.
 */
export function createSecureTokenStorage(): TokenStorage {
  if (!isDevBuild()) {
    let token: string | null = null;
    return {
      read: () => Promise.resolve(token),
      write: (refreshToken) => {
        token = refreshToken;
        return Promise.resolve();
      },
      clear: () => {
        token = null;
        return Promise.resolve();
      },
    };
  }

  return {
    read: () => Promise.resolve(webStorage()?.getItem(KEY) ?? null),
    write: (refreshToken) => {
      webStorage()?.setItem(KEY, refreshToken);
      return Promise.resolve();
    },
    clear: () => {
      webStorage()?.removeItem(KEY);
      return Promise.resolve();
    },
  };
}
