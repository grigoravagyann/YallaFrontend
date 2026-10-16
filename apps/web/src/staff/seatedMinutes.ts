/**
 * Minutes a party has been seated, for the floor list, or `null` to show none.
 *
 * A tablet clock a little behind the server's makes a party just seated look
 * seated in the future, and a timestamp that does not parse gives NaN: "0 min"
 * and nothing are what a waiter should read, not "-2 min" or "NaN min".
 * `TableActionPanel` keeps the same rule for its own count.
 */
export function seatedMinutes(minutesSince: number): number | null {
  if (!Number.isFinite(minutesSince)) return null;
  return Math.max(0, minutesSince);
}
