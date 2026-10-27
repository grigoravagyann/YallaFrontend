import { blockedFeature, type BranchFeature } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { LockIcon } from '../ui/icons';
import { PageHeader } from '../ui/PageHeader';
import { useFeatureText } from '../ui/featureText';
import { useVenueOutlet, type VenueOutletContext } from './VenueLayout';

/**
 * Whether the platform has blocked `feature` at the branch on screen
 * (2026-10-27). The venue console shows such a feature **locked, not hidden**:
 * its nav item, card or page carries a lock and "Not enabled for this branch.
 * Contact SHURJ to turn it on.", and its controls are disabled. Unknown (no
 * branch yet, or a host that does not say) is not locked.
 */
export function useFeatureLocked(feature: BranchFeature): boolean {
  const features = (useVenueOutlet() as VenueOutletContext | undefined)?.features;
  return Array.isArray(features) && !features.includes(feature);
}

/** The lock and its two lines, inside a card or above a page's body. */
export function FeatureLockNotice({ feature }: { readonly feature: BranchFeature }) {
  const { t } = useTranslation(['admin', 'common']);
  const text = useFeatureText();
  return (
    <div className="yc-lock" role="note" data-locked-feature={feature}>
      <LockIcon />
      <span>
        <b>{t('featureLocked.title')}</b>
        <span className="yc-sr"> ({text.name(feature)})</span> {t('featureLocked.body')}
      </span>
    </div>
  );
}

/**
 * A card's controls under a lock: the notice, and every control inside
 * disabled at once by the fieldset. Not locked, the children as they are.
 */
export function FeatureLockedControls({
  feature,
  locked,
  children,
}: {
  readonly feature: BranchFeature;
  readonly locked: boolean;
  readonly children: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <>
      <FeatureLockNotice feature={feature} />
      <fieldset className="yc-lockset" disabled aria-disabled="true">
        {children}
      </fieldset>
    </>
  );
}

/**
 * A whole page that is one feature (Reviews, guest messages, Reports): its
 * title and the lock in place of the page when the feature is blocked.
 */
export function FeatureGate({
  feature,
  titleKey,
  children,
}: {
  readonly feature: BranchFeature;
  /** The page's own title, as its nav item says it. */
  readonly titleKey: string;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const locked = useFeatureLocked(feature);
  if (!locked) return <>{children}</>;
  return (
    <div className="yc-page">
      <PageHeader title={t(titleKey)} />
      <FeatureLockNotice feature={feature} />
    </div>
  );
}

/**
 * A refusal's sentence when the server says the feature is not enabled
 * (`feature-not-enabled`), else `null`: the same locked copy as the lock.
 */
export function useFeatureRefusalText(): (error: unknown) => string | null {
  const { t } = useTranslation(['admin', 'common']);
  return (error) =>
    blockedFeature(error) === undefined
      ? null
      : `${t('featureLocked.title')}. ${t('featureLocked.body')}`;
}
