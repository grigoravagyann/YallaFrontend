import type { TabTokenStorage } from '@yalla/api';
import { webStorage } from '../auth/webStorage';
import { ACTIVE_TAB_KEY, TAB_TOKENS_KEY, decodeTabTokens, encodeTabTokens } from './tabMemoryCodec';

/**
 * The web build's tab memory. Same names and shapes as the phone's, so Metro
 * swaps this file in: `expo-secure-store` is an empty module in a browser.
 *
 * In `localStorage`, in every build — unlike the refresh token. A participant
 * token opens one tab and nothing else, ends with that tab, and is dropped the
 * moment the server refuses it; losing it on reload put a diner who was still
 * at the table in front of "the tab was closed". Where the browser blocks
 * storage, nothing is remembered and a reload means a re-scan, as before.
 */
function read(key: string): string | null {
  try {
    return webStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    const storage = webStorage();
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Quota or a site-data block: this page still has the gateway's copy.
  }
}

export const tabTokenStorage: TabTokenStorage = {
  read: () => Promise.resolve(decodeTabTokens(read(TAB_TOKENS_KEY))),
  write: (tokens) => {
    write(TAB_TOKENS_KEY, Object.keys(tokens).length ? encodeTabTokens(tokens) : null);
    return Promise.resolve();
  },
};

export const activeTabMemory = {
  read: (): Promise<string | null> => Promise.resolve(read(ACTIVE_TAB_KEY)),
  write: (tabId: string | null): Promise<void> => {
    write(ACTIVE_TAB_KEY, tabId);
    return Promise.resolve();
  },
};
