import { EMPTY_PROFILE, type DinerProfile, type ProfileStorage } from '../stores/session';
import { decodeProfile } from './profileCodec';
import { isDevBuild, webStorage } from './webStorage';

const KEY = 'yalla.diner.profile';

/**
 * The web build's profile store: there is no keychain in a browser and
 * `expo-secure-store` is an empty module there. Same name and shape as the
 * phone's, so Metro swaps this file in and nothing else changes.
 *
 * `localStorage` in a development build only; any other build keeps the number,
 * name and email in memory for the life of the page — see `tokenStorage.web.ts`.
 */
export function createSecureProfileStorage(): ProfileStorage {
  if (!isDevBuild()) {
    let profile: DinerProfile = EMPTY_PROFILE;
    return {
      read: () => Promise.resolve(profile),
      write: (next) => {
        profile = next;
        return Promise.resolve();
      },
    };
  }

  return {
    read: () => Promise.resolve(decodeProfile(webStorage()?.getItem(KEY) ?? null)),
    write: (next) => {
      webStorage()?.setItem(KEY, JSON.stringify(next));
      return Promise.resolve();
    },
  };
}
