import { useEffect, useState } from 'react';

/**
 * The time now, turned over on the minute.
 *
 * A clock that ticked every fifteen seconds from whenever the bar mounted said
 * 16:51 for up to fifteen seconds after the chip beside it said 16:52. This
 * one wakes at each minute's boundary, so the two never disagree. The PIN gate
 * re-reads who is on shift on the same tick.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const at = Date.now();
      timer = setTimeout(
        () => {
          setNow(new Date());
          schedule();
        },
        60_000 - (at % 60_000),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return now;
}
