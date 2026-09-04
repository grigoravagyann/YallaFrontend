import type { BranchSummary, VenueSummary } from './booking';

/**
 * Derived reads over the contract types.
 *
 * These live here rather than in a screen so that the diner app and (later) the
 * admin panel cannot disagree about what "free tables" or "open now" means, and
 * so no component has to do arithmetic over a data shape.
 */

/** Free tables across every branch — the one number a hungry person wants. */
export function venueFreeTables(venue: VenueSummary): number {
  return venue.branches.reduce((total, b) => total + b.freeTables, 0);
}

export function venueTotalTables(venue: VenueSummary): number {
  return venue.branches.reduce((total, b) => total + b.totalTables, 0);
}

export function isVenueFullyBooked(venue: VenueSummary): boolean {
  return venueFreeTables(venue) === 0;
}

/** Nearest branch, for the venue-level distance hint. */
export function nearestBranch(venue: VenueSummary): BranchSummary | null {
  return [...venue.branches].sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}

/** Whether a branch is serving, judged against an explicit instant. */
export function isBranchOpenNow(branch: BranchSummary, now: Date): boolean {
  const t = now.getTime();
  return t >= new Date(branch.opensAtUtc).getTime() && t <= new Date(branch.closesAtUtc).getTime();
}

export function isVenueOpenNow(venue: VenueSummary, now: Date): boolean {
  return venue.branches.some((b) => isBranchOpenNow(b, now));
}

export function findBranchIn(venue: VenueSummary, branchId: string): BranchSummary | null {
  return venue.branches.find((b) => b.id === branchId) ?? null;
}
