/**
 * The hours a by-hour chart draws, in the order a service runs.
 *
 * Cut at the longest stretch of hours with nothing in them, going round the
 * clock, and start right after it: a cafe's axis runs 07…23, and a bar open
 * past midnight keeps 23, 00 and 01 together instead of putting its last two
 * hours at the far left of the chart. Hours inside a service that took nothing
 * stay on the axis — a quiet hour is a finding. `[]` when no hour took anything.
 */
export function serviceHours(amounts: readonly number[]): number[] {
  const hours = amounts.length;
  if (hours === 0 || amounts.every((amount) => amount <= 0)) return [];
  let best = { start: 0, length: 0 };
  for (let start = 0; start < hours; start += 1) {
    const before = amounts[(start + hours - 1) % hours] ?? 0;
    if ((amounts[start] ?? 0) > 0 || before <= 0) continue;
    let length = 0;
    while (length < hours && (amounts[(start + length) % hours] ?? 0) <= 0) length += 1;
    if (length > best.length) best = { start, length };
  }
  const first = (best.start + best.length) % hours;
  return Array.from({ length: hours - best.length }, (_, index) => (first + index) % hours);
}
