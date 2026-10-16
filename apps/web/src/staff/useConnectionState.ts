import { isOffline } from '@yalla/api';
import type { ConnectionState } from '@yalla/realtime';
import { useEffect, useState } from 'react';

/**
 * How the last poll went. The screen that owns the query reports it; this
 * hook never reads a query itself, so two readers cannot give two answers.
 */
export type PollingHealth =
  /** Nothing has come back yet. */
  | 'unknown'
  /** The last read reached the server and was answered. */
  | 'ok'
  /** The last read failed. What is on screen is the last known state. */
  | 'failing';

export interface ConnectionStateOptions {
  /**
   * The most recent failure from the screen's live read. A `NetworkError`
   * here flips the indicator to `reconnecting` even when the browser still
   * claims to be online — a router with no uplink says online and delivers
   * nothing.
   */
  readonly lastError?: unknown;
  /**
   * The live read is paused because the browser is offline. It never throws
   * in that state, so without this the indicator would keep saying live while
   * the room silently went stale.
   */
  readonly offline?: boolean | undefined;
  /** How the screen's polling is going. See {@link PollingHealth}. */
  readonly polling: PollingHealth;
}

/**
 * The staff screen's connection state — honestly reported.
 *
 * There is no socket; the floor, the orders and the calls are polled, and
 * the change stream is polled too. For a whole shift this hook answered
 * `idle` for that, which the header rendered as "live updates not connected
 * yet" — a sentence a waiter read for ten minutes while the orders in front
 * of them arrived within five seconds. Polling that works *is* live, to the
 * person reading the screen, and polling that fails is the thing they need
 * to be told about.
 *
 * So the state follows the polls: `connected` while they are answered,
 * `reconnecting` as soon as one fails or the browser says offline, and
 * `connecting` only before the first answer. Swapping the transport for a
 * hub is still a change to the screen that owns the query and to nothing
 * here: it reports the hub's health through the same option.
 */
export function useConnectionState(options: ConnectionStateOptions): ConnectionState {
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

  switch (options.polling) {
    case 'ok':
      return 'connected';
    case 'failing':
      return 'reconnecting';
    case 'unknown':
      return 'connecting';
  }
}
