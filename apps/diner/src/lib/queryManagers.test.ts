import { focusManager, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { wireQueryManagers, type AppStateSource, type NetInfoSource } from './queryManagers';

function fakeSources() {
  let appListener: ((status: string) => void) | null = null;
  let netListener:
    | ((state: { isConnected: boolean | null; isInternetReachable?: boolean | null }) => void)
    | null = null;

  const appState: AppStateSource = {
    addEventListener: (_type, listener) => {
      appListener = listener;
      return { remove: () => (appListener = null) };
    },
  };
  const netInfo: NetInfoSource = {
    addEventListener: (listener) => {
      netListener = listener;
      return () => (netListener = null);
    },
  };

  return {
    appState,
    netInfo,
    app: (status: string) => appListener?.(status),
    net: (isConnected: boolean | null) => netListener?.({ isConnected }),
  };
}

afterEach(() => {
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
});

describe('the phone telling queries what is going on', () => {
  it('pauses queries when the connection goes, and resumes when it comes back', () => {
    const sources = fakeSources();
    wireQueryManagers(sources);

    sources.net(false);
    expect(onlineManager.isOnline()).toBe(false);

    sources.net(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('treats coming back to the app as focus, so stale screens refetch', () => {
    const sources = fakeSources();
    wireQueryManagers(sources);

    sources.app('background');
    expect(focusManager.isFocused()).toBe(false);

    sources.app('active');
    expect(focusManager.isFocused()).toBe(true);
  });
});
