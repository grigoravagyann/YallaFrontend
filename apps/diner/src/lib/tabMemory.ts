import type { TabTokenStorage } from '@yalla/api';
import * as SecureStore from 'expo-secure-store';
import { ACTIVE_TAB_KEY, TAB_TOKENS_KEY, decodeTabTokens, encodeTabTokens } from './tabMemoryCodec';

/**
 * The tab this phone is on and the participant tokens tabs issued it, in the
 * keychain beside the refresh token — a participant token is a credential for
 * one tab, so a plain file is the wrong place for it.
 *
 * Kept so that killing the app, or opening a tab's link, re-attaches to a tab
 * the server still has this phone on. The server's refusal of a token is what
 * forgets it. Anything unreadable comes back empty: the cost is a re-scan.
 *
 * Metro resolves `./tabMemory` to `tabMemory.web.ts` in the browser.
 */
export const tabTokenStorage: TabTokenStorage = {
  read: async () => decodeTabTokens(await SecureStore.getItemAsync(TAB_TOKENS_KEY)),
  write: (tokens) =>
    Object.keys(tokens).length
      ? SecureStore.setItemAsync(TAB_TOKENS_KEY, encodeTabTokens(tokens))
      : SecureStore.deleteItemAsync(TAB_TOKENS_KEY),
};

export const activeTabMemory = {
  read: (): Promise<string | null> => SecureStore.getItemAsync(ACTIVE_TAB_KEY),
  write: (tabId: string | null): Promise<void> =>
    tabId === null
      ? SecureStore.deleteItemAsync(ACTIVE_TAB_KEY)
      : SecureStore.setItemAsync(ACTIVE_TAB_KEY, tabId),
};
