import type { ConsoleBranch, ConsoleVenueDetail } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Link, useParams } from 'react-router-dom';
import { useConsoleVenue } from '../../data/queries';

/** Pilot venues are all in Yerevan; used only until the venue read names the branch's zone. */
const FALLBACK_TIME_ZONE = 'Asia/Yerevan';

export interface PlatformBranchRoute {
  readonly venueId: string | undefined;
  readonly branchId: string | undefined;
  readonly venue: ConsoleVenueDetail | undefined;
  readonly branch: ConsoleBranch | undefined;
  readonly timeZoneId: string;
  readonly isLoading: boolean;
}

/**
 * The venue and branch a platform branch route is about, from the URL.
 *
 * In the platform section the ids in the address bar are not a scope claim — a
 * platform admin's token covers every venue, which is why these routes exist
 * only in their router — and the server checks every read regardless.
 */
export function usePlatformBranchRoute(): PlatformBranchRoute {
  const { venueId, branchId } = useParams<{ venueId: string; branchId: string }>();
  const venue = useConsoleVenue(venueId);
  const branch = venue.data?.branches.find((entry) => entry.id === branchId);
  return {
    venueId,
    branchId,
    venue: venue.data ?? undefined,
    branch,
    timeZoneId: branch?.timeZoneId ?? FALLBACK_TIME_ZONE,
    isLoading: venue.isLoading,
  };
}

/** Venues › venue name, then which branch this page is about. */
export function PlatformBranchHeader({ route }: { readonly route: PlatformBranchRoute }) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="platform-branch-head">
      <p className="crumbs">
        <Link to="/platform/venues">{t('venues.title')}</Link>
        {route.venue ? (
          <>
            {' › '}
            <Link to={`/platform/venues/${route.venue.id}`}>{route.venue.name}</Link>
          </>
        ) : null}
        {route.branch ? ` › ${route.branch.name}` : null}
      </p>
    </div>
  );
}
