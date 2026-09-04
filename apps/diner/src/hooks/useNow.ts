import { useEffect, useState } from 'react';

/**
 * The current time, as React state rather than a `Date.now()` call in render.
 *
 * Reading the clock during render is impure — two renders of the same props can
 * disagree — so the clock is treated as what it is: an external system this
 * component subscribes to. It also means a bookings list left open actually
 * moves a booking from "upcoming" to "past" when its slot passes, instead of
 * only doing so if something else happens to re-render.
 *
 * @param intervalMs How often to re-read. Default 30s — fine for slot
 * boundaries and cheap enough to leave running.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
