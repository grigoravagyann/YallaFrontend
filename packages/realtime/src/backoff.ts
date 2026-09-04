import type { IRetryPolicy, RetryContext } from '@microsoft/signalr';

export interface BackoffOptions {
  /** First retry delay, in ms. */
  readonly initialDelayMs?: number;
  /** Ceiling for a single delay, in ms. */
  readonly maxDelayMs?: number;
  /**
   * Give up after this long, in ms. `null` means never stop trying.
   *
   * The staff app passes `null`: a tablet on the counter should reconnect by
   * itself when the basement wifi comes back, without anyone tapping anything.
   */
  readonly maxElapsedMs?: number | null;
  /** Random 0..jitterRatio fraction added to each delay, to avoid a thundering herd. */
  readonly jitterRatio?: number;
  /** Injectable for tests. */
  readonly random?: () => number;
}

const DEFAULTS = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxElapsedMs: null as number | null,
  jitterRatio: 0.25,
};

/**
 * Exponential backoff with jitter.
 *
 * When a cafe's router reboots, every device in the room reconnects at once.
 * Without jitter they retry in lockstep and hammer the backend in synchronised
 * waves; the random spread is what turns that into a smooth ramp.
 */
export function nextDelayMs(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = options.random ?? Math.random,
): number {
  const initial = options.initialDelayMs ?? DEFAULTS.initialDelayMs;
  const max = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const jitterRatio = options.jitterRatio ?? DEFAULTS.jitterRatio;

  const exponential = Math.min(initial * 2 ** Math.max(0, attempt), max);
  const jitter = exponential * jitterRatio * random();

  return Math.round(Math.min(exponential + jitter, max * (1 + jitterRatio)));
}

/**
 * SignalR retry policy backed by {@link nextDelayMs}.
 *
 * Returning `null` tells SignalR to stop retrying, which moves the connection to
 * `disconnected` and puts a visible manual-retry affordance in front of the user.
 */
export function createRetryPolicy(options: BackoffOptions = {}): IRetryPolicy {
  const maxElapsedMs = options.maxElapsedMs ?? DEFAULTS.maxElapsedMs;

  return {
    nextRetryDelayInMilliseconds(context: RetryContext): number | null {
      if (maxElapsedMs !== null && context.elapsedMilliseconds >= maxElapsedMs) {
        return null;
      }
      return nextDelayMs(context.previousRetryCount, options);
    },
  };
}
