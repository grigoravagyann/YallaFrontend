import { BRANCH_FEATURES, type BranchFeature, type VenueFeatureSummary } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';

/** The four groups the Features section shows, in order (2026-10-27). */
export const FEATURE_GROUPS: readonly {
  readonly id: 'bookings' | 'service' | 'guests' | 'staff';
  readonly features: readonly BranchFeature[];
}[] = [
  { id: 'bookings', features: ['appBookings', 'webBookings', 'preOrders'] },
  { id: 'service', features: ['takeaway', 'tableService'] },
  { id: 'guests', features: ['guestMessages', 'reviews'] },
  { id: 'staff', features: ['staffPhone', 'kitchenDisplay', 'reports'] },
];

/**
 * A feature's name and a set's one word, as both consoles say them: the
 * platform's switches, the venue list's column and the activity feed.
 */
export function useFeatureText() {
  const { t } = useTranslation(['admin', 'common']);
  const name = (feature: BranchFeature) => t(`features.name.${feature}`);
  return {
    name,
    hint: (feature: BranchFeature) => t(`features.hint.${feature}`),
    /** "Table service, Reviews": a list in the server's order. */
    list: (features: readonly BranchFeature[]) =>
      BRANCH_FEATURES.filter((feature) => features.includes(feature))
        .map(name)
        .join(', '),
    /** Full, Basic, "7 of 10", Mixed, or no branch. */
    summary: (summary: VenueFeatureSummary) =>
      summary.kind === 'custom'
        ? t('features.count', {
            on: summary.features?.length ?? 0,
            total: BRANCH_FEATURES.length,
          })
        : t(`features.preset.${summary.kind}`),
  };
}
