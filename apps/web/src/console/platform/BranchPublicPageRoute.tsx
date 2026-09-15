import { useTranslation } from '@yalla/i18n';
import { PublicPageEditor } from '../venue/public/PublicPageScreen';
import { PlatformBranchHeader, usePlatformBranchRoute } from './PlatformBranchHeader';

/**
 * A branch's public page, listing, gallery and table pins, for the platform
 * team — the venue's own screen, given the branch explicitly instead of from
 * the venue section's outlet.
 *
 * A platform admin may move a branch (K5): the pin and the address are
 * editable here, and the server audits the move.
 */
export function BranchPublicPageRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const route = usePlatformBranchRoute();

  if (!route.branchId) return <p className="error">{t('venue.notFound')}</p>;

  return (
    <>
      <PlatformBranchHeader route={route} />
      <PublicPageEditor branchId={route.branchId} canRelocate />
    </>
  );
}
