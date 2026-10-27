import {
  BranchNotReadyError,
  ConcurrencyConflictError,
  ValidationError,
  isOffline,
  type BranchFeature,
  type ConsoleVenueDetail,
} from '@yalla/api';
import type { useTranslation } from '@yalla/i18n';

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * The server's refusal of a feature set, in plain words (2026-10-27):
 *
 * - 422 `validation-failed` on `features`: pre-orders without a booking channel;
 * - 409 `branch-not-ready`: table service on while dishes are unfinished, naming
 *   the branch — on the venue route, which one of several;
 * - a bare 409: table service off while tabs are open (or the venue is deleted),
 *   naming the branches the venue read says have tabs open.
 */
export function featuresRefusalText(
  error: unknown,
  context: {
    readonly venue: ConsoleVenueDetail;
    /** The branches the change was for: one, or every branch of the venue. */
    readonly branchIds: readonly string[];
    readonly features: readonly BranchFeature[];
  },
  t: Translate,
): string {
  const { venue, branchIds, features } = context;
  const nameOf = (branchId: string) =>
    venue.branches.find((branch) => branch.id === branchId)?.name ?? '';

  if (isOffline(error)) return t('features.refusal.offline');
  if (error instanceof ValidationError && (error.field === 'features' || error.status === 422)) {
    return t('features.refusal.preOrders');
  }
  if (error instanceof BranchNotReadyError) {
    return t('features.refusal.notReady', {
      branch: nameOf(error.branchId) || nameOf(branchIds[0] ?? ''),
      count: error.incompleteMenuItemCount,
    });
  }
  if (error instanceof ConcurrencyConflictError) {
    if (venue.status === 'deleted') return t('features.deleted');
    if (!features.includes('tableService')) {
      const busy = venue.branches
        .filter(
          (branch) =>
            branchIds.includes(branch.id) &&
            branch.features.includes('tableService') &&
            (branch.openTabCount ?? 0) > 0,
        )
        .map((branch) => branch.name);
      return busy.length > 0
        ? t('features.refusal.openTabsAt', { branches: busy.join(', '), count: busy.length })
        : t('features.refusal.openTabs');
    }
  }
  return t('features.refusal.failed');
}
