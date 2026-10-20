import { useEffect, useState } from 'react';

/**
 * How long the day and the time wait before they are asked about (review S5).
 *
 * The page's availability reads share the server's anonymous limit of 60 a
 * minute per address with the 45-second polls. A visitor running a thumb along
 * the day chips or the time chips asks one question — the one they stop on —
 * not one per chip. The party is already settled by `@yalla/api` the same way.
 */
export const SETTLE_MS = 250;

/**
 * The value once it has stopped moving for `delayMs`.
 *
 * The query key carries the settled value, so React Query sees one key change
 * and fetches once; a value passed back through is served from the cache.
 */
export function useSettled<T>(value: T, delayMs: number = SETTLE_MS): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), Math.max(0, delayMs));
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
