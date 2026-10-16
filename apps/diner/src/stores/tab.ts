import { create } from 'zustand';
import { activeTabMemory } from '../lib/tabMemory';

interface TabState {
  /** The tab this device is currently on, if any. */
  activeTabId: string | null;
  join: (tabId: string) => void;
  clear: () => void;
}

/**
 * Which tab this device is on.
 *
 * Written down (the keychain, or localStorage on the web) so a reload or a
 * killed app comes back to the table it left — the gateway keeps the tab's
 * participant token the same way. Not a tab "from last Tuesday": the tab screen
 * clears it the moment the server says the tab is closed or this device is off
 * it, and a stale id only ever costs one read that says so.
 *
 * The tab id lives here rather than in route params so that Explore can show
 * you are on a tab without every screen having to thread it through navigation.
 */
export const useActiveTab = create<TabState>((set) => ({
  activeTabId: null,
  join: (tabId) => {
    set({ activeTabId: tabId });
    void activeTabMemory.write(tabId).catch(() => undefined);
  },
  clear: () => {
    set({ activeTabId: null });
    void activeTabMemory.write(null).catch(() => undefined);
  },
}));

/** Settles once the tab remembered from the last launch, if any, is back. */
export const activeTabRestored: Promise<void> = activeTabMemory
  .read()
  .then((tabId) => {
    // A join since launch is newer than what was remembered.
    if (tabId && useActiveTab.getState().activeTabId === null) {
      useActiveTab.setState({ activeTabId: tabId });
    }
  })
  .catch(() => undefined);
