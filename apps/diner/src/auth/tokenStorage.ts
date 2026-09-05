import type { TokenStorage } from '@yalla/api';
import * as SecureStore from 'expo-secure-store';

const KEY = 'yalla.diner.refreshToken';

/**
 * The refresh token, in the device keychain (iOS) or Keystore-backed
 * encrypted storage (Android) via `expo-secure-store`.
 *
 * Only the refresh token: the access token lives in memory and is minted from
 * this one on launch. AsyncStorage is not used for it — that is a plain file,
 * and a thirty-day credential does not belong in a plain file.
 */
export function createSecureTokenStorage(): TokenStorage {
  return {
    read: () => SecureStore.getItemAsync(KEY),
    write: (refreshToken) => SecureStore.setItemAsync(KEY, refreshToken),
    clear: () => SecureStore.deleteItemAsync(KEY),
  };
}
