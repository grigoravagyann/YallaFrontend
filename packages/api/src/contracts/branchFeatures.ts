/**
 * What a branch may use, feature by feature (2026-10-27): the platform admin
 * allows or blocks each one per branch, and the venue's own settings work only
 * inside that. It replaces the Free/Paid subscription tier, which gated table
 * service alone.
 *
 * The client's names for `Yalla.Domain.Enums.BranchFeature` (1 AppBookings …
 * 10 Reports), in the server's numeric order. Two sets travel on the wire:
 *
 * - **allowed**: what the platform lets the branch use. The platform console,
 *   the venue console (`ManagedBranch.features`) and the staff session carry it;
 *   the venue console shows the rest *locked*, never hidden.
 * - **effective**: allowed **and** switched on by the venue. The diner app and
 *   the public page carry it, and hide what is not in it.
 */
export type BranchFeature =
  | 'appBookings'
  | 'webBookings'
  | 'preOrders'
  | 'takeaway'
  | 'tableService'
  | 'guestMessages'
  | 'reviews'
  | 'staffPhone'
  | 'kitchenDisplay'
  | 'reports';

/** Every feature, in the server's numeric order: the order every list shows them in. */
export const BRANCH_FEATURES: readonly BranchFeature[] = [
  'appBookings',
  'webBookings',
  'preOrders',
  'takeaway',
  'tableService',
  'guestMessages',
  'reviews',
  'staffPhone',
  'kitchenDisplay',
  'reports',
];

/** **Basic**: everything but table service. What Free was, and what a new branch starts on. */
export const BASIC_FEATURES: readonly BranchFeature[] = BRANCH_FEATURES.filter(
  (feature) => feature !== 'tableService',
);

/** **Full**: all ten. What Paid was. */
export const FULL_FEATURES: readonly BranchFeature[] = BRANCH_FEATURES;

/** The two named sets, and what any other set is. */
export type BranchFeaturePreset = 'full' | 'basic' | 'custom';

/** Pre-orders ride on a booking: they need app or web bookings allowed too (the server's 422). */
export const PRE_ORDER_NEEDS: readonly BranchFeature[] = ['appBookings', 'webBookings'];

/** Whether `features` holds `feature`. A `null` set (not read yet) holds nothing. */
export function hasFeature(
  features: readonly BranchFeature[] | null | undefined,
  feature: BranchFeature,
): boolean {
  return features?.includes(feature) ?? false;
}

/** The set in the server's order, each feature once. */
export function sortFeatures(features: Iterable<BranchFeature>): BranchFeature[] {
  const wanted = new Set(features);
  return BRANCH_FEATURES.filter((feature) => wanted.has(feature));
}

/** Whether two sets hold the same features, whatever their order. */
export function sameFeatures(a: readonly BranchFeature[], b: readonly BranchFeature[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((feature) => right.has(feature));
}

/** Which preset a set is, or `custom`. */
export function featurePreset(features: readonly BranchFeature[]): BranchFeaturePreset {
  if (sameFeatures(features, FULL_FEATURES)) return 'full';
  if (sameFeatures(features, BASIC_FEATURES)) return 'basic';
  return 'custom';
}

/**
 * The one rule between features, checked before anything is sent: pre-orders
 * without a booking channel. The server refuses the same set (422
 * `validation-failed` on `features`); asking here lets the switch say why.
 */
export function preOrdersWithoutBookings(features: readonly BranchFeature[]): boolean {
  return features.includes('preOrders') && !PRE_ORDER_NEEDS.some((need) => features.includes(need));
}

/**
 * A venue's branches in one word, as the platform venues list shows them:
 * every branch on Full, every one on Basic, every one on the same other set
 * (`custom`), branches on different sets (`mixed`), or no branch at all.
 */
export interface VenueFeatureSummary {
  readonly kind: BranchFeaturePreset | 'mixed' | 'none';
  /** The one set every branch shares; `null` when they differ or there is none. */
  readonly features: readonly BranchFeature[] | null;
  readonly branchCount: number;
}

export function venueFeatureSummary(
  branches: readonly { readonly features: readonly BranchFeature[] }[],
): VenueFeatureSummary {
  const first = branches[0];
  if (!first) return { kind: 'none', features: null, branchCount: 0 };
  const shared = branches.every((branch) => sameFeatures(branch.features, first.features));
  if (!shared) return { kind: 'mixed', features: null, branchCount: branches.length };
  return {
    kind: featurePreset(first.features),
    features: sortFeatures(first.features),
    branchCount: branches.length,
  };
}

/** The server's names, lower-cased, for an audit detail or a context written with names. */
const BY_NAME: Readonly<Record<string, BranchFeature>> = Object.fromEntries(
  BRANCH_FEATURES.map((feature) => [feature.toLowerCase(), feature]),
);

/**
 * One feature as the server writes it: its number (`1`…`10`) or its name
 * (`"TableService"`). A value this client does not know yet is `null`, so a
 * newer server's eleventh feature never reads as one of the ten.
 */
export function branchFeatureFromCode(value: unknown): BranchFeature | null {
  if (typeof value === 'number') return BRANCH_FEATURES[value - 1] ?? null;
  if (typeof value === 'string') return BY_NAME[value.toLowerCase()] ?? null;
  return null;
}
