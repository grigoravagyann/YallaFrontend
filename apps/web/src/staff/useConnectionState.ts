import type { ConnectionState } from '@yalla/realtime';
import { useEffect, useState } from 'react';

/**
 * The floor screen's connection state — honestly reported.
 *
 * There is no socket yet; live updates arrive in a later task. So this returns
 * `idle`, which `@yalla/realtime` defines as "never started", and the header
 * renders that as *"live updates not connected yet"* rather than as a green
 * light. When the wifi is genuinely gone it returns `reconnecting`, because
 * that is a different and more urgent thing to tell a waiter.
 *
 * What it deliberately never returns today is `connected`. A floor plan that
 * says it is live and is forty seconds stale walks a party into somebody's
 * dinner; a floor plan that admits it is a snapshot just gets refreshed.
 *
 * Wiring the real connection is a change to this hook and to nothing else —
 * `ConnectionIndicator` already renders all five states.
 */
export function useConnectionState(): ConnectionState {
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

  // TODO(prompt-9): replace with `createRealtimeConnection(...)` and return its
  // real state. Until then `idle` is the truthful answer.
  return online ? 'idle' : 'reconnecting';
}
