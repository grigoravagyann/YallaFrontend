import { isOffline } from '@yalla/api';
import type { ConnectionState } from '@yalla/realtime';
import { useEffect, useState } from 'react';

export interface ConnectionStateOptions {
  /**
   * The most recent failure from the floor query. A `NetworkError` here flips
   * the indicator to `reconnecting` even when the browser still claims to be
   * online — a router with no uplink says online and delivers nothing.
   */
  readonly lastError?: unknown;
  /**
   * The floor query is paused because the browser is offline. It never throws
   * in that state, so without this the indicator would keep saying the screen
   * is merely "not connected yet" while the room silently goes stale.
   */
  readonly offline?: boolean | undefined;
}

/**
 * The floor screen's connection state — honestly reported.
 *
 * There is no socket yet; live updates arrive in a later task. So this returns
 * `idle`, which `@yalla/realtime` defines as "never started", and the header
 * renders that as *"live updates not connected yet"* rather than as a green
 * light. When the wifi is genuinely gone — the browser says so, or the last
 * floor request never reached the server — it returns `reconnecting`, because
 * that is a different and more urgent thing to tell a waiter.
 *
 * What it deliberately never returns today is `connected`. A floor plan that
 * says it is live and is forty seconds stale walks a party into somebody's
 * dinner; a floor plan that admits it is a snapshot just gets refreshed.
 *
 * Wiring the real connection is a change to this hook and to nothing else —
 * the header already renders all five states.
 */
export function useConnectionState(options: ConnectionStateOptions = {}): ConnectionState {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!online || options.offline || isOffline(options.lastError)) return 'reconnecting';

  // TODO(prompt-9): replace with `createRealtimeConnection(...)` and return its
  // real state. Until then `idle` is the truthful answer.
  return 'idle';
}
