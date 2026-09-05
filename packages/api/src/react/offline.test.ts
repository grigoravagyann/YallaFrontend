import { describe, expect, it } from 'vitest';
import { isOfflinePaused } from './index';

/**
 * The rule this pins down was found by pulling the network in a browser.
 *
 * TanStack Query does not fail a query it cannot send — it pauses it. On the
 * console's venue list that left yesterday's rows on screen with no hint they
 * were stale; on a first load it would have been a spinner that never
 * resolves. Both are the failure mode this project cares most about, so the
 * paused state is a first-class thing every screen checks.
 */
describe('isOfflinePaused', () => {
  it('is true only for a paused query', () => {
    expect(isOfflinePaused({ fetchStatus: 'paused' })).toBe(true);
    expect(isOfflinePaused({ fetchStatus: 'fetching' })).toBe(false);
    expect(isOfflinePaused({ fetchStatus: 'idle' })).toBe(false);
  });

  it('does not depend on the query having failed', () => {
    // The whole point: a paused query has no error and is not "loading" in any
    // sense the user would recognise.
    const paused = { fetchStatus: 'paused', isError: false, isLoading: true };
    expect(isOfflinePaused(paused)).toBe(true);
  });
});
