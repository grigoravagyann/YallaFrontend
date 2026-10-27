import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * How a page's filters live in the address: read with a fallback for every
 * missing or unknown value, written back with each one left out while it is
 * its default, so a plain visit stays a plain address.
 */
export interface UrlFilterCodec<F> {
  /** The filters the address says; anything missing or invalid is its default. */
  readonly read: (params: URLSearchParams) => F;
  /** Writes `next` into `params` (already a copy of the current address). */
  readonly write: (params: URLSearchParams, next: F) => void;
}

export interface WriteOptions {
  /** Replace the current history entry rather than push a new one (Back skips it). */
  readonly replace?: boolean;
  /** History state for the entry written, read back with `useLocation().state`. */
  readonly state?: unknown;
}

/** Sets `key`, or deletes it when `value` is null. */
export function putParam(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null) params.delete(key);
  else params.set(key, value);
}

/** `value` when it is one of `options`, else `fallback`: a link with a bad value reads the default. */
export function pickParam<T extends string>(
  value: string | null,
  options: readonly T[],
  fallback: T,
): T {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * A page's filters in the address (`?from=…&kind=…`), so Back and a reload
 * keep them.
 *
 * - `update` merges a change into what the address says *now* (not what the
 *   last render read), then writes it: a new history entry, or with
 *   `replace` the current one.
 * - `setParam` writes one key outside the filters (the open row, say), and is
 *   stable for as long as the router's setter is.
 * - `clear` drops every parameter: "Clear filters" as a new history entry.
 */
export function useUrlFilters<F>(codec: UrlFilterCodec<F>) {
  const [params, setParams] = useSearchParams();

  function update(next: Partial<F>, options: WriteOptions = {}) {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        codec.write(copy, { ...codec.read(current), ...next });
        return copy;
      },
      { replace: options.replace ?? false },
    );
  }

  const setParam = useCallback(
    (key: string, value: string | null, options: WriteOptions = {}) => {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          putParam(copy, key, value);
          return copy;
        },
        { replace: options.replace ?? false, state: options.state },
      );
    },
    [setParams],
  );

  function clear() {
    setParams(new URLSearchParams());
  }

  return { params, filters: codec.read(params), update, setParam, clear } as const;
}
