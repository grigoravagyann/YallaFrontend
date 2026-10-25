import { useEffect, useState } from 'react';

/**
 * The current time, as React state rather than a `Date.now()` call in render.
 *
 * Reading the clock during render is impure — two renders of the same props can
 * disagree — so the clock is treated as what it is: an external system a
 * component subscribes to.
 *
 * It lives here, in the data layer's React module, because on both surfaces the
 * question it answers is a question about data: how old is this answer. The
 * phone's bookings list uses it to move a booking from "upcoming" to "past"
 * when its slot passes, and the public branch page uses it to decide whether
 * the free-table count on screen is stale enough to need a timestamp under it.
 * Neither works if the only thing that re-reads the clock is an unrelated
 * re-render.
 *
 * @param intervalMs How often to re-read. Default 30s — fine for slot
 * boundaries and for a one-minute staleness threshold, and cheap enough to
 * leave running.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/**
 * True when a query is not running because the browser is offline.
 *
 * TanStack Query does not *fail* a query it cannot send: it **pauses** it. So
 * `isError` stays false, `isLoading` stays true on a first load, and a screen
 * that only watches for a thrown error shows a spinner that never resolves —
 * or, worse, keeps showing yesterday's rows with no hint they are stale.
 *
 * Every screen therefore checks this alongside `isError`. It is a plain
 * function of `fetchStatus` rather than a hook so the same rule can be applied
 * to a query, tested on its own, and read at a glance.
 */
export function isOfflinePaused(query: { readonly fetchStatus: string }): boolean {
  return query.fetchStatus === 'paused';
}
