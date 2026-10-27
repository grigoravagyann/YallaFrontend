import {
  preOrdersWithoutBookings,
  sameFeatures,
  sortFeatures,
  type BranchFeature,
} from '../../contracts/branchFeatures';
import type { ConsoleBranch } from '../../contracts/console';
import { BranchNotReadyError, OutOfScopeError } from '../../contracts/errors';
import type { ConsoleGateway } from '../../consoleGateway';
import { validationFailed } from '../problems';
import { type ConsoleMockContext, URL_TAG, type VenueRecord } from './context';

/**
 * The platform admin's feature switches over the mock's world, refusing what
 * `PlatformService` refuses, in its order: a deleted venue (409), pre-orders
 * without a booking channel (422 on `features`), table service off with tabs
 * open (409), table service on with an unfinished menu (409
 * `branch-not-ready`). The venue route is all or nothing, as the server's is.
 */
export function branchFeaturesMethods(
  ctx: ConsoleMockContext,
): Pick<ConsoleGateway, 'setBranchFeatures' | 'applyVenueFeatures'> {
  const {
    conflict,
    isIncompleteItem,
    log,
    menuFor,
    registry,
    requireVenue,
    toDetail,
    venues,
    wait,
  } = ctx;

  function refuseSet(features: readonly BranchFeature[]): void {
    if (preOrdersWithoutBookings(features)) {
      throw validationFailed(URL_TAG, [
        {
          field: 'features',
          message: 'Pre-orders need app bookings or web bookings.',
          bound: 'conflict',
        },
      ]);
    }
  }

  function refuseBranch(
    record: VenueRecord,
    branch: ConsoleBranch,
    next: readonly BranchFeature[],
  ) {
    if (record.status === 'deleted') {
      throw conflict(
        `Venue '${record.name}' has been deleted, so its branches can no longer be changed.`,
      );
    }
    const had = branch.features.includes('tableService');
    const wants = next.includes('tableService');
    if (had && !wants && (branch.openTabCount ?? 0) > 0) {
      // As the server's (2026-10-27): the branch that refused, and its tabs.
      throw conflict(
        `${branch.name} has ${branch.openTabCount ?? 0} open tab(s). Turning table service off would hide those bills from the people who owe them. Wait until they are settled.`,
        { branchId: branch.id, openTabCount: branch.openTabCount ?? 0 },
      );
    }
    if (!had && wants) {
      const incomplete = menuFor(branch.id)
        .flatMap((category) => category.items)
        .filter(isIncompleteItem).length;
      if (incomplete > 0) {
        throw new BranchNotReadyError({
          url: URL_TAG,
          branchId: branch.id,
          incompleteMenuItemCount: incomplete,
        });
      }
    }
  }

  /** Moves one branch and writes its feed line; false when nothing changed. */
  function change(
    record: VenueRecord,
    index: number,
    next: readonly BranchFeature[],
    viaVenue: boolean,
  ): boolean {
    const branch = record.branches[index];
    if (!branch || sameFeatures(branch.features, next)) return false;
    record.branches[index] = { ...branch, features: next };
    // Kept for the other mocks (the tablet's session, the diner's listing) and across a reload.
    registry.branchFeatures.set(branch.id, { branchId: branch.id, features: next });
    log('branch.features-change', { type: 'Branch', id: branch.id, name: branch.name }, record, {
      featuresChange: {
        added: next.filter((feature) => !branch.features.includes(feature)),
        removed: branch.features.filter((feature) => !next.includes(feature)),
        viaVenue,
      },
    });
    return true;
  }

  return {
    async setBranchFeatures({ branchId, features }) {
      await wait();
      const next = sortFeatures(features);
      refuseSet(next);
      for (const record of venues.values()) {
        const index = record.branches.findIndex((branch) => branch.id === branchId);
        const branch = record.branches[index];
        if (!branch) continue;
        refuseBranch(record, branch, next);
        change(record, index, next, false);
        return toDetail(record);
      }
      throw new OutOfScopeError({ url: URL_TAG });
    },

    async applyVenueFeatures({ venueId, features }) {
      await wait();
      const next = sortFeatures(features);
      refuseSet(next);
      const record = requireVenue(venueId);
      // Every branch is checked before any moves: all or nothing.
      for (const branch of record.branches) refuseBranch(record, branch, next);
      const changed = record.branches.filter((_, index) => change(record, index, next, true));
      if (changed.length > 0) {
        log('venue.features-apply', { type: 'Venue', id: record.id, name: record.name }, record, {
          featuresApply: {
            features: next,
            branchCount: record.branches.length,
            changedCount: changed.length,
          },
        });
      }
      return toDetail(record);
    },
  };
}
