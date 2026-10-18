import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

const MINUTE_MS = 60_000;
/** How often the clock is looked at; it only changes what it returns once a minute. */
const LOOK_MS = 15_000;

const minuteOf = (at: Date) => Math.floor(at.getTime() / MINUTE_MS);

/**
 * A screen's "now" to the minute: looked at every few seconds and whenever the
 * app comes back to the front, and changed only when the minute has — so what
 * depends on it re-renders once a minute at most, never under a finger
 * mid-scroll for nothing.
 *
 * The booking screen offers today's times from the lead time on. Read once,
 * a screen left open (or brought back from the background) half an hour later
 * still offered the times the lead time had passed, and the server refused
 * them as too soon. `refresh` reads it at once — after that very refusal.
 */
export function useMinuteClock(): readonly [Date, () => void] {
  const [now, setNow] = useState(() => new Date());
  const refresh = useCallback(() => {
    setNow((previous) => {
      const next = new Date();
      return minuteOf(next) === minuteOf(previous) ? previous : next;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, LOOK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  return [now, refresh] as const;
}
