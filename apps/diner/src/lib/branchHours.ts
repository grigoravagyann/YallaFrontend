import type { Availability } from '@yalla/api';

export type BranchHoursLine =
  | { readonly key: 'branches.opensAt'; readonly params: { time: string } }
  | { readonly key: 'branches.closed'; readonly params: Record<never, never> }
  | { readonly key: 'branches.openUntil'; readonly params: { time: string } }
  | { readonly key: 'branches.openNow'; readonly params: Record<never, never> };

/**
 * The hours line on a branch row.
 *
 * A shut branch says so — and says when it opens, when it knows. An open one
 * says until when, when it knows. Times are already formatted in the BRANCH's
 * timezone by the caller; this only decides which sentence.
 *
 * Today only the mock knows: the public venue card over HTTP carries
 * `isOpen` alone (`publicMapping.ts` maps both instants to null), so against
 * the real server every row reads plain "closed" / "open now". The timed
 * sentences are ready for the day the card publishes the instants.
 */
export function branchHoursLine(
  availability: Availability,
  times: { readonly opensAt: string | null; readonly closesAt: string | null },
): BranchHoursLine {
  if (availability.kind === 'closed') {
    return times.opensAt
      ? { key: 'branches.opensAt', params: { time: times.opensAt } }
      : { key: 'branches.closed', params: {} };
  }
  return times.closesAt
    ? { key: 'branches.openUntil', params: { time: times.closesAt } }
    : { key: 'branches.openNow', params: {} };
}
