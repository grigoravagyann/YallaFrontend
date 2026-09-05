/**
 * Live updates over a sequence stream, behind an interface.
 *
 * SignalR is a later task. The backend's sequence columns exist precisely so
 * this can be written once and have its transport swapped without any screen
 * changing, so the shape here is the one a hub can satisfy: start, stop, tell me
 * when something happened, tell me when you lost the thread.
 *
 * ## Why this lives in the package
 *
 * The staff tablet polls a branch's floor changes and the diner's phone polls a
 * tab's events. Those are the same transport with different payloads, and two
 * implementations of it is how the two surfaces end up disagreeing about a bill
 * — the waiter's screen showing a line the diner's does not, with nobody able to
 * say which is right. One implementation, one place to replace when the hub
 * lands.
 *
 * ## Why it knows nothing about gateways
 *
 * Pages arrive through a callback rather than a gateway method. That keeps this
 * package free of any dependency on `@yalla/api` — which would be a cycle
 * waiting to happen — and it is what lets the same function serve a floor, a
 * tab, and whatever the next stream turns out to be.
 */

/** One page of a sequence stream: what changed, and how far the caller has read. */
export interface SequencePage<T> {
  /** Highest sequence in this page, or the caller's own when empty. */
  readonly lastSequence: number;
  readonly items: readonly T[];
}

export type ResyncReason =
  /** A sequence number is missing, so something never arrived. */
  | 'gap'
  /** Nothing has been read yet; there is no sequence to continue from. */
  | 'firstLoad'
  /** The backend has not shipped this stream. Fall back to full reads. */
  | 'notWired'
  /** The connection came back and the gap, if any, is unknown. */
  | 'reconnect';

export interface SequenceStreamHandlers<T> {
  /** A page of changes. Fold them in. */
  readonly onItems: (items: readonly T[]) => void;
  /**
   * The stream cannot be continued incrementally. Refetch everything.
   *
   * Separate from `onError` because it is not a failure: it is the normal first
   * load, and it is the honest answer when a page cannot be trusted to be
   * contiguous. A caller that treats it as an error shows a red banner on every
   * cold start.
   */
  readonly onResync: (reason: ResyncReason) => void;
  readonly onError: (error: unknown) => void;
}

export interface LiveStream {
  /** Idempotent. */
  start(): void;
  stop(): void;
  /** Poll now: the screen became visible, the network came back, a manual refresh. */
  refresh(): void;
  /** A backgrounded screen backs off; it does not stop. */
  setForeground(foreground: boolean): void;
  /** Where the caller has read up to. Set after a full refetch. */
  setSequence(sequence: number): void;
}

export interface SequenceStreamOptions<T> {
  /**
   * Fetch everything after `afterSequence`.
   *
   * Throwing is fine and expected: transport failures reach `onError`, and an
   * endpoint the backend has not shipped reaches `onResync('notWired')` when
   * {@link isUnavailable} recognises it.
   */
  readonly fetchPage: (afterSequence: number) => Promise<SequencePage<T>>;
  readonly handlers: SequenceStreamHandlers<T>;
  /**
   * Recognises "this endpoint does not exist", so the stream can stop asking.
   *
   * Passed in rather than imported: the error type belongs to the API client and
   * this package must not depend on it.
   */
  readonly isUnavailable?: ((error: unknown) => boolean) | undefined;
  /** Foreground interval. Short enough that a person does not out-run it. */
  readonly foregroundMs?: number | undefined;
  /** Backgrounded interval. Long enough not to drain a tablet on a counter. */
  readonly backgroundMs?: number | undefined;
  /** Injected for tests. */
  readonly setInterval?: typeof globalThis.setInterval | undefined;
  readonly clearInterval?: typeof globalThis.clearInterval | undefined;
}

export const FOREGROUND_POLL_MS = 4_000;
export const BACKGROUND_POLL_MS = 30_000;

export function createSequenceStream<T>(options: SequenceStreamOptions<T>): LiveStream {
  const {
    fetchPage,
    handlers,
    isUnavailable,
    foregroundMs = FOREGROUND_POLL_MS,
    backgroundMs = BACKGROUND_POLL_MS,
  } = options;

  const schedule = options.setInterval ?? globalThis.setInterval.bind(globalThis);
  const cancel = options.clearInterval ?? globalThis.clearInterval.bind(globalThis);

  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  let running = false;
  let foreground = true;
  let sequence = 0;
  let inFlight = false;
  /**
   * The stream is missing on the server. Recorded once so the client does not
   * ask again every few seconds and fill the log with the same 404; it falls
   * back to full reads, which is correct, more expensive, and says so.
   */
  let unavailable = false;

  async function poll(): Promise<void> {
    // One request at a time. Overlapping polls on a slow connection deliver
    // pages out of order and manufacture gaps that are not there.
    if (inFlight) return;
    inFlight = true;
    try {
      if (unavailable || sequence === 0) {
        handlers.onResync(unavailable ? 'notWired' : 'firstLoad');
        return;
      }
      const page = await fetchPage(sequence);
      if (page.items.length > 0) handlers.onItems(page.items);
      sequence = Math.max(sequence, page.lastSequence);
    } catch (error) {
      if (isUnavailable?.(error)) {
        unavailable = true;
        handlers.onResync('notWired');
        return;
      }
      handlers.onError(error);
    } finally {
      inFlight = false;
    }
  }

  function restartTimer(): void {
    if (timer !== null) cancel(timer);
    timer = running ? schedule(() => void poll(), foreground ? foregroundMs : backgroundMs) : null;
  }

  return {
    start() {
      if (running) return;
      running = true;
      restartTimer();
      void poll();
    },

    stop() {
      running = false;
      if (timer !== null) cancel(timer);
      timer = null;
    },

    refresh() {
      void poll();
    },

    setForeground(next) {
      if (foreground === next) return;
      foreground = next;
      restartTimer();
      // Coming back to the foreground polls immediately rather than waiting out
      // an interval. Somebody picking a device up is asking a question.
      if (next) void poll();
    },

    setSequence(next) {
      sequence = next;
    },
  };
}

/**
 * Is a page contiguous with what the caller already has?
 *
 * The check that decides between folding a page in and refetching the world. A
 * client that has seen sequence 40 and receives 42 missed 41, and applying the
 * rest would leave one row drawn from a state that has since been superseded
 * with nothing on screen saying which. Exported because both the floor and the
 * tab need exactly this rule and neither should re-derive it.
 */
export function findSequenceGap(
  lastSequence: number,
  sequences: readonly number[],
): { readonly expected: number; readonly received: number } | null {
  let expected = lastSequence + 1;
  for (const sequence of [...sequences].sort((a, b) => a - b)) {
    if (sequence !== expected) return { expected, received: sequence };
    expected += 1;
  }
  return null;
}
