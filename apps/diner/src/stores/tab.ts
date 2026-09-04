import { create } from 'zustand';

interface TabState {
  /** The tab this device is currently on, if any. */
  activeTabId: string | null;
  join: (tabId: string) => void;
  clear: () => void;
}

/**
 * Which tab this device is on.
 *
 * In memory for the session and nowhere else. That is not only the no-web-
 * storage rule: a tab is a table you are sitting at, and a phone that
 * "remembers" a tab from last Tuesday would put a stale table in front of
 * someone who has walked into a different cafe. Killing the app and scanning
 * again is the correct cost, and takes one tap.
 *
 * The tab id lives here rather than in route params so that Explore can show
 * you are on a tab without every screen having to thread it through navigation.
 */
export const useActiveTab = create<TabState>((set) => ({
  activeTabId: null,
  join: (tabId) => set({ activeTabId: tabId }),
  clear: () => set({ activeTabId: null }),
}));
