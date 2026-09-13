import * as SecureStore from 'expo-secure-store';
import type { ProfileStorage } from '../stores/session';
import { decodeProfile } from './profileCodec';

const KEY = 'yalla.diner.profile';

/**
 * The diner's number, booking name and email, in the keychain beside the
 * refresh token.
 *
 * The keychain rather than AsyncStorage because a phone number is personal
 * data, and a plain file is the wrong place for it. Anything unreadable comes
 * back empty: the cost is one prompt, never a crash at launch.
 *
 * Metro resolves `./profileStorage` to `profileStorage.web.ts` in the
 * browser, where `expo-secure-store` is an empty module; this file is the
 * phone's.
 */
export function createSecureProfileStorage(): ProfileStorage {
  return {
    read: async () => decodeProfile(await SecureStore.getItemAsync(KEY)),
    write: (profile) => SecureStore.setItemAsync(KEY, JSON.stringify(profile)),
  };
}
