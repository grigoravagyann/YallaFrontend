import { BASIC_FEATURES, FULL_FEATURES, type BranchFeature } from '../contracts/branchFeatures';
import type { MockRegistry } from './mockRegistry';
import { mockVenues } from './venues';

/**
 * What the platform allows at a mock branch, shared by every mock that needs
 * it: the console (the switches and the venue console's locks), the staff
 * session (the floor's tabs) and the diner side (what a guest is offered).
 *
 * The shared fixture alternates Full and Basic, so the venues list's column is
 * not one repeated value and the venue console has a branch with table
 * service locked. A switch the platform admin makes in mock mode is kept in
 * the registry, so a tablet signed in after a reload sees it too.
 */
export function mockBranchFeatures(
  registry: MockRegistry,
  branchId: string,
): readonly BranchFeature[] {
  const stored = registry.branchFeatures.get(branchId);
  if (stored) return stored.features;
  return seededMockFeatures(branchId) ?? FULL_FEATURES;
}

/** The fixture's own set for a `mockVenues` branch; `null` for a branch it does not hold. */
export function seededMockFeatures(branchId: string): readonly BranchFeature[] | null {
  for (const [venueIndex, venue] of mockVenues.entries()) {
    const branchIndex = venue.branches.findIndex((branch) => branch.id === branchId);
    if (branchIndex !== -1) {
      return (venueIndex + branchIndex) % 2 === 0 ? FULL_FEATURES : BASIC_FEATURES;
    }
  }
  return null;
}
