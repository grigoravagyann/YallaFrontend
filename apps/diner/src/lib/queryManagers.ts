import { focusManager, onlineManager } from '@tanstack/react-query';

/**
 * Tell TanStack Query when the phone comes back to the app and when it has a
 * connection.
 *
 * Out of the box it listens for `window` focus and `online` events, and React
 * Native has neither: `window.addEventListener` does not exist, so nothing ever
 * refetched on return from the background, and the online manager believed the
 * phone was always online. No query ever paused, so every offline branch on
 * every screen was unreachable and an offline read sat through three retries
 * before saying anything.
 *
 * This is TanStack's own React Native recipe: `AppState` drives focus and
 * NetInfo drives online. The two are injected so the wiring can be tested
 * without a device.
 */

export interface AppStateSource {
  addEventListener(type: 'change', listener: (status: string) => void): { remove(): void };
}

export interface NetInfoSource {
  addEventListener(
    listener: (state: {
      readonly isConnected: boolean | null;
      readonly isInternetReachable?: boolean | null;
    }) => void,
  ): () => void;
}

export function wireQueryManagers(deps: {
  readonly appState: AppStateSource;
  readonly netInfo: NetInfoSource;
}): void {
  onlineManager.setEventListener((setOnline) =>
    deps.netInfo.addEventListener((state) => {
      // Unknown is not offline. Only a definite "no" pauses the queries.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );

  focusManager.setEventListener((handleFocus) => {
    const subscription = deps.appState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });
    return () => subscription.remove();
  });
}
