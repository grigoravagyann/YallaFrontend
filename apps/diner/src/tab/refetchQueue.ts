/**
 * One refetch in flight, one queued, everything else collapsed into it.
 *
 * Four people ordering at a busy table produce four events. Today they arrive
 * batched per poll, so the naive "invalidate on every batch" was survivable;
 * once a hub delivers them individually it becomes a refetch per event, four
 * round trips deep, on a phone on cafe wifi. The bill is the same bill after
 * all four.
 *
 * The cap is deliberately **one queued, not none**. Dropping a request that
 * arrived while a fetch was in flight would drop a change that fetch cannot
 * have seen — it started first — and the screen would sit on a bill that is one
 * order out of date until something else happened to move it. So a request that
 * arrives mid-flight is guaranteed a *subsequent* run, and any number of
 * further requests join that same one.
 *
 * `request()` resolving is the other half of the contract, and the reason this
 * returns a promise at all: it resolves only once a run that **started after
 * the call** has finished. That is what lets an announcement wait for the line
 * it refers to. See `useTabStream`.
 */
export interface RefetchCoalescer {
  /**
   * Ask for a refetch.
   *
   * Resolves when a run that began after this call has settled — never on a run
   * that was already in flight, which by definition cannot carry this change.
   */
  request(): Promise<void>;
  /** True while anything is running or waiting. For tests and diagnostics. */
  readonly pending: boolean;
}

export function createRefetchCoalescer(run: () => Promise<unknown>): RefetchCoalescer {
  let running = false;
  let waiting: Array<() => void> = [];

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // Drain in batches. Everything that accumulated while the last run was in
      // flight is satisfied by the next one, however many callers that is.
      while (waiting.length > 0) {
        const batch = waiting;
        waiting = [];
        try {
          await run();
        } catch {
          // The query layer owns retry and error reporting. Swallowing here
          // only prevents a rejected refetch from stranding the callers that
          // are waiting on it — they are told "a run happened", not "it worked".
        }
        for (const resolve of batch) resolve();
      }
    } finally {
      running = false;
    }
  }

  return {
    request() {
      return new Promise<void>((resolve) => {
        waiting.push(resolve);
        void pump();
      });
    },
    get pending() {
      return running || waiting.length > 0;
    },
  };
}
