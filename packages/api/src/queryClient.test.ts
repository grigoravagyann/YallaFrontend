import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { createQueryClient } from './queryClient';

/**
 * The two apps want opposite things from an offline write, and the library
 * default silently gave one of them the other's.
 *
 * TanStack does not *fail* a mutation it cannot send: it **pauses** it, and
 * resumes when the connection returns. On the counter tablet that is right —
 * the wifi in a basement drops for seconds, the waiter is standing in the room,
 * and a transition that lands late is better than a warning mid-service. On a
 * diner's phone it is the worst behaviour available: the send button spins
 * forever and somebody sits waiting for food nobody is cooking.
 *
 * So `mutationNetworkMode` is a required option with no default, and these are
 * the tests that make the difference real rather than a comment.
 */

afterEach(() => {
  onlineManager.setOnline(true);
});

/** Runs one mutation to settlement (or to the pause that never settles). */
function observe(client: ReturnType<typeof createQueryClient>, fn: () => Promise<unknown>) {
  const observer = new MutationObserver(client, { mutationFn: fn });
  const states: string[] = [];
  const unsubscribe = observer.subscribe((result) => {
    states.push(result.status);
  });
  return {
    states,
    result: observer.mutate().catch(() => undefined),
    isPaused: () => observer.getCurrentResult().isPaused,
    unsubscribe,
  };
}

describe('the diner app, offline', () => {
  // --- Test 8 ---------------------------------------------------------------
  it('fails a send immediately rather than pausing it', async () => {
    const client = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
    onlineManager.setOnline(false);

    let attempts = 0;
    const run = observe(client, () => {
      attempts += 1;
      // What the fetch does with no network: rejects, rather than never
      // resolving. `networkMode: 'always'` is what lets it be attempted at all.
      return Promise.reject(new Error('Network request failed'));
    });

    await run.result;

    // Attempted, not deferred. This is the assertion that matters: with the
    // library default the mutation function is never called at all.
    expect(attempts).toBe(1);
    expect(run.isPaused()).toBe(false);
    expect(run.states).toContain('error');
    // And never a pending state left hanging, which is what the spinner reads.
    expect(run.states.at(-1)).toBe('error');

    run.unsubscribe();
  });

  it('does not retry a failed send', async () => {
    // An order is not idempotent from the client's point of view unless the
    // caller reuses its `clientCommandId`, and a retry the caller did not ask
    // for is how a round of drinks doubles. Retry belongs to the tray screen,
    // which reuses the id.
    const client = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
    let attempts = 0;
    const run = observe(client, () => {
      attempts += 1;
      return Promise.reject(new Error('nope'));
    });

    await run.result;
    expect(attempts).toBe(1);
    run.unsubscribe();
  });
});

describe('the counter tablet, offline', () => {
  it('pauses a write instead of failing it', async () => {
    const client = createQueryClient({ retry: false, mutationNetworkMode: 'online' });
    onlineManager.setOnline(false);

    let attempts = 0;
    const run = observe(client, () => {
      attempts += 1;
      return Promise.resolve('seated');
    });

    // Give the observer a turn. The mutation must still not have run.
    await Promise.resolve();

    expect(attempts).toBe(0);
    expect(run.isPaused()).toBe(true);
    expect(run.states).not.toContain('error');

    // And it lands when the connection returns, which is the whole reason the
    // tablet wants this mode. Resumed explicitly here: in a browser the online
    // manager's own listener does this, and there is no such event in Node.
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    expect(attempts).toBe(1);

    run.unsubscribe();
  });
});
