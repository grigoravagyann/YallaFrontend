import type { BranchSummary, VenueSummary } from './booking';

/**
 * Derived reads over the contract types.
 *
 * These live here rather than in a screen so that the diner app and (later) the
 * admin panel cannot disagree about what "free tables" or "open now" means, and
 * so no component has to do arithmetic over a data shape.
 */

/**
 * Whether a branch is serving, as the server said.
 *
 * Not recomputed from a clock here: the server judges it against the branch's
 * real hours and its own time, and a phone with the wrong date must not be
 * able to tell somebody a shut venue is open.
 */
export function isBranchOpenNow(branch: BranchSummary): boolean {
  return branch.openState.isOpen;
}

export function isVenueOpenNow(venue: VenueSummary): boolean {
  return venue.branches.some(isBranchOpenNow);
}

/**
 * Free tables at the branches that are open — the one number a hungry person
 * wants.
 *
 * Open branches only. The wire's count is "nobody is sitting there this
 * second", and after hours that is every table at a shut venue: summed across
 * every branch, it told a diner at 02:00 that the whole city had its rooms free.
 */
export function venueFreeTables(venue: VenueSummary): number {
  return venue.branches.filter(isBranchOpenNow).reduce((total, b) => total + b.freeTables, 0);
}

/**
 * What to say about availability, in three cases a screen must not blur.
 *
 * - `freeNow` — open, with tables nobody is sitting at.
 * - `noneFreeNow` — open and every table taken **at this instant**. Present
 *   tense on purpose: this is not "fully booked tonight", and saying so sends
 *   people away from a room that empties in twenty minutes.
 * - `closed` — shut. The count is not shown at all, because it is meaningless.
 */
export type Availability =
  | { readonly kind: 'freeNow'; readonly count: number }
  | { readonly kind: 'noneFreeNow' }
  | { readonly kind: 'closed' };

export function branchAvailability(branch: BranchSummary): Availability {
  if (!isBranchOpenNow(branch)) return { kind: 'closed' };
  return branch.freeTables > 0
    ? { kind: 'freeNow', count: branch.freeTables }
    : { kind: 'noneFreeNow' };
}

export function venueAvailability(venue: VenueSummary): Availability {
  if (!isVenueOpenNow(venue)) return { kind: 'closed' };
  const count = venueFreeTables(venue);
  return count > 0 ? { kind: 'freeNow', count } : { kind: 'noneFreeNow' };
}

export function findBranchIn(venue: VenueSummary, branchId: string): BranchSummary | null {
  return venue.branches.find((b) => b.id === branchId) ?? null;
}
