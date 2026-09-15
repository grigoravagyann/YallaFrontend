import type { Coordinates } from './model';

/**
 * How the browse lists get a position, apart from the phone APIs so it can be
 * tested without one. See `devicePosition.ts` for the wiring.
 */

export interface PositionSource {
  /** Allowed already. Never asks: a refetching list must not throw a dialog. */
  readonly permissionGranted: () => Promise<boolean>;
  /** The phone's cached fix, when it has one no older than `maxAgeMs`. */
  readonly lastKnown: (maxAgeMs: number) => Promise<Coordinates | null>;
  /** A fresh fix. Low accuracy is plenty for "0.3 km". */
  readonly current: () => Promise<Coordinates | null>;
}

/** A cached fix this old is still good for the order of a list. */
export const LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;

/** How long a list waits for a fresh fix before it goes on without distances. */
export const FRESH_FIX_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * The position for distances, or `null` when there is none to be had quickly.
 *
 * The cached fix first, because it is instant. A phone often has none — Android
 * keeps one only while some app is asking, and any phone's is too old ten
 * minutes after the map — so a fresh one is asked for next, and waited on for
 * at most `timeoutMs`: a list with no distances beats a list that never loads.
 */
export async function readPosition(
  source: PositionSource,
  timeoutMs: number = FRESH_FIX_TIMEOUT_MS,
): Promise<Coordinates | null> {
  try {
    if (!(await source.permissionGranted())) return null;
    const last = await source.lastKnown(LAST_KNOWN_MAX_AGE_MS);
    if (last) return last;
    return await withTimeout(source.current(), timeoutMs, null);
  } catch {
    return null;
  }
}
