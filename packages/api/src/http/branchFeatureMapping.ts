import type { BranchFeature } from '../contracts/branchFeatures';
import { BRANCH_FEATURES, branchFeatureFromCode } from '../contracts/branchFeatures';
import type { components } from '../generated/schema';

/** `Yalla.Domain.Enums.BranchFeature`: 1 AppBookings … 10 Reports. */
export type WireBranchFeature = components['schemas']['Yalla.Domain.Enums.BranchFeature'];

/**
 * A set from the wire, in the server's order, each once, values this client
 * does not know dropped. **Absent is unknown, and unknown is everything**: an
 * older server that sends no set has not blocked anything, and reading it as
 * `[]` would lock every screen. An empty array is a real answer: all blocked.
 */
export function branchFeaturesFromWire(
  values: readonly unknown[] | null | undefined,
): BranchFeature[] {
  if (values === null || values === undefined) return [...BRANCH_FEATURES];
  const known = new Set<BranchFeature>();
  for (const value of values ?? []) {
    const feature = branchFeatureFromCode(value);
    if (feature) known.add(feature);
  }
  return BRANCH_FEATURES.filter((feature) => known.has(feature));
}

/** One feature's number on the wire. */
export function branchFeatureToWire(feature: BranchFeature): WireBranchFeature {
  return (BRANCH_FEATURES.indexOf(feature) + 1) as WireBranchFeature;
}

/** A set for the wire, in numeric order, each once. */
export function branchFeaturesToWire(features: readonly BranchFeature[]): WireBranchFeature[] {
  return BRANCH_FEATURES.filter((feature) => features.includes(feature)).map(branchFeatureToWire);
}
