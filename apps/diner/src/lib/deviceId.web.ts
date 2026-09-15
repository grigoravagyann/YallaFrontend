import { newCommandId } from '@yalla/api';
import { webStorage } from '../auth/webStorage';

const KEY = 'yalla.diner.deviceId';

let memory: string | null = null;

/**
 * The web build's device id. Same name and shape as the phone's, so Metro swaps
 * this file in: `expo-secure-store` has no web implementation, and reading it
 * there throws, which left the web build unable to open a tab at all.
 *
 * Kept in `localStorage` when the browser allows it, so a reload re-scanning a
 * table is still the same device. It names the install, not a person, and is no
 * credential. Without storage it lives in memory for the page's life.
 */
export function installDeviceId(): Promise<string> {
  const storage = webStorage();
  try {
    const existing = storage?.getItem(KEY) ?? memory;
    if (existing) return Promise.resolve(existing);
  } catch {
    // A blocked read is the same as nothing stored.
  }
  const fresh = memory ?? newCommandId();
  memory = fresh;
  try {
    storage?.setItem(KEY, fresh);
  } catch {
    // Quota or a site-data block: the in-memory id still serves this page.
  }
  return Promise.resolve(fresh);
}
