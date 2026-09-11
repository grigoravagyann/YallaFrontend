import { newCommandId } from '@yalla/api';
import * as SecureStore from 'expo-secure-store';

const KEY = 'yalla.diner.deviceId';

let cached: Promise<string> | null = null;

/**
 * This install's device id, which opening or joining a tab requires.
 *
 * Generated once and kept, so the server can tell a phone scanning again — a
 * re-scan of a tab it is already on — from a new person at the table. It names
 * the install, not the person: nothing about an account is in it.
 */
export function installDeviceId(): Promise<string> {
  cached ??= (async () => {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing) return existing;
    const fresh = newCommandId();
    await SecureStore.setItemAsync(KEY, fresh);
    return fresh;
  })().catch((error: unknown) => {
    // Let the next attempt try again rather than caching a failure for ever.
    cached = null;
    throw error;
  });
  return cached;
}
