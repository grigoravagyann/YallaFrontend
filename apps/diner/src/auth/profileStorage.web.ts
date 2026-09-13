import type { ProfileStorage } from '../stores/session';
import { decodeProfile } from './profileCodec';
import { webStorage } from './webStorage';

const KEY = 'yalla.diner.profile';

/**
 * The web build's profile store: `localStorage`, since there is no keychain
 * in a browser and `expo-secure-store` is an empty module there. Same name
 * and shape as the phone's, so Metro swaps this file in and nothing else
 * changes.
 */
export function createSecureProfileStorage(): ProfileStorage {
  return {
    read: () => Promise.resolve(decodeProfile(webStorage()?.getItem(KEY) ?? null)),
    write: (profile) => {
      webStorage()?.setItem(KEY, JSON.stringify(profile));
      return Promise.resolve();
    },
  };
}
