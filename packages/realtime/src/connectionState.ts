/**
 * Connection state, modelled as something the UI can render directly.
 *
 * This is exported as a first-class concept rather than hidden inside the
 * connection because both apps must show it. A floor plan that looks live but
 * is forty seconds stale is worse than one that visibly says "reconnecting":
 * the first causes a diner and a waiter to disagree about a table, the second
 * just asks for patience.
 */
export type ConnectionState =
  /** Never started, or deliberately stopped. */
  | 'idle'
  /** First connection attempt in flight. */
  | 'connecting'
  /** Live. Data on screen is current. */
  | 'connected'
  /** Dropped, retrying. Data on screen is the last known state. */
  | 'reconnecting'
  /** Gave up after exhausting retries; needs a manual retry or a route change. */
  | 'disconnected';

/** True when pushed updates are actually arriving. */
export function isLive(state: ConnectionState): boolean {
  return state === 'connected';
}

/**
 * True when the UI should warn that what is on screen may be out of date.
 *
 * `connecting` is excluded: on a first load there is no stale data to warn
 * about, just a spinner.
 */
export function isStale(state: ConnectionState): boolean {
  return state === 'reconnecting' || state === 'disconnected';
}

/** i18n key for the state, resolved by the app against the `common` namespace. */
export function connectionStateKey(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'connection.connected';
    case 'connecting':
      return 'connection.connecting';
    case 'reconnecting':
      return 'connection.reconnecting';
    case 'idle':
    case 'disconnected':
      return 'connection.disconnected';
  }
}
