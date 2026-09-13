import type { TokenStorage } from '@yalla/api';
import { webStorage } from './webStorage';

const KEY = 'yalla.diner.refreshToken';

/**
 * The web build's refresh-token store: `localStorage`, the browser's only
 * durable place for it. Same name and shape as the phone's keychain store,
 * so Metro swaps this file in and the session code does not know.
 */
export function createSecureTokenStorage(): TokenStorage {
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
