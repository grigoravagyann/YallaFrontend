import {
  NotFoundError,
  describeFailure,
  type ConsoleBranch,
  type ConsoleVenueDetail,
} from '@yalla/api';
import { usePlatformBranchReviews } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useConsoleVenue } from '../../data/queries';
import { ErrorState, errorKindFor } from '../ui/ErrorState';

/** Pilot venues are all in Yerevan; used only until the venue read names the branch's zone. */
const FALLBACK_TIME_ZONE = 'Asia/Yerevan';

export interface PlatformBranchRoute {
  readonly venueId: string | undefined;
  readonly branchId: string | undefined;
  readonly venue: ConsoleVenueDetail | undefined;
  readonly branch: ConsoleBranch | undefined;
  readonly timeZoneId: string;
  readonly isLoading: boolean;
  readonly error: unknown;
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
    error: venue.error,
  };
}

/** The three pages of a branch, in the order the sub-tabs show them. */
export type BranchTab = 'public' | 'rooms' | 'reviews';
const SEGMENT: Readonly<Record<BranchTab, string>> = {
  public: 'public',
  rooms: 'floorplan',
  reviews: 'reviews',
};

export interface BranchPageProps {
  readonly tab: BranchTab;
  /** The page, once the venue and the branch are known. */
  readonly children: (route: {
    readonly venue: ConsoleVenueDetail;
    readonly branch: ConsoleBranch;
    readonly timeZoneId: string;
  }) => ReactNode;
}

/**
 * A branch's page for the platform admin (BranchPublic, BranchRooms and
 * Reviews artboards): one header for all three — the breadcrumbs Venues /
 * venue / branch, the branch's name and address, a switcher to the same page
 * of another branch, and the sub-tabs Public page / Rooms and tables /
 * Reviews, the last with how many reviews diners reported.
 *
 * A branch that is not in the venue — a stale link, a deleted branch — is
 * the shared "not found", not an empty page.
 */
export function BranchPage({ tab, children }: BranchPageProps) {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const route = usePlatformBranchRoute();
  const reported = usePlatformBranchReviews(route.branch ? route.branchId : undefined, {
    filter: 'reported',
    pageSize: 1,
  });
  // On a phone the three tabs scroll sideways: the current one is brought into view.
  const tabsRef = useRef<HTMLElement>(null);
  const shownBranch = route.branch?.id;
  // The badge arrives after the tabs and widens the last one.
  const badge = reported.data?.total;
  useEffect(() => {
    const nav = tabsRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const overflow = current.offsetLeft + current.offsetWidth - nav.clientWidth;
    if (overflow > 0) nav.scrollLeft = overflow;
  }, [tab, shownBranch, badge]);

  if (route.isLoading) {
    return (
      <p className="yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  }
  const { venue, branch } = route;
  if (!venue || !branch) {
    const error = route.error;
    return (
      <ErrorState
        kind={
          !error || error instanceof NotFoundError
            ? 'notFound'
            : errorKindFor(describeFailure(error))
        }
        // The venue answered and the branch is not in it: name the branch.
        subject={venue ? 'branch' : 'venue'}
      />
    );
  }

  const base = `/platform/venues/${venue.id}/branches/${branch.id}`;
  const reports = reported.data?.total ?? 0;
  const tabs: { key: BranchTab; label: string; badge?: ReactNode }[] = [
    { key: 'public', label: t('branchPage.tabs.public') },
    { key: 'rooms', label: t('branchPage.tabs.rooms') },
    {
      key: 'reviews',
      label: t('branchPage.tabs.reviews'),
      ...(reports > 0
        ? {
            badge: (
              <>
                <span className="yc-tab-cnt is-amber" aria-hidden="true">
                  {reports}
                </span>
                <span className="yc-sr">{t('branchReviews.reports', { count: reports })}</span>
              </>
            ),
          }
        : {}),
    },
  ];

  return (
    <>
      <nav aria-label={t('venuePage.crumbs')}>
        <ol className="yc-crumbs">
          <li>
            <Link to="/platform/venues">{t('venues.title')}</Link>
          </li>
          <li>
            <Link to={`/platform/venues/${venue.id}`}>{venue.name}</Link>
          </li>
          <li aria-current="page">{branch.name}</li>
        </ol>
      </nav>

      <div className="yc-bhead">
        <div>
          <h1 className="yc-h1">{branch.name}</h1>
          <p className="yc-sub">{[venue.name, branch.address].filter(Boolean).join(' · ')}</p>
        </div>
        {venue.branches.length > 1 ? (
          <div className="yc-fld">
            <label htmlFor="br-switch" className="yc-sr">
              {t('branchPage.switch')}
            </label>
            <select
              id="br-switch"
              className="yc-ctl yc-bsel"
              value={branch.id}
              onChange={(event) =>
                navigate(
                  `/platform/venues/${venue.id}/branches/${event.target.value}/${SEGMENT[tab]}`,
                )
              }
            >
              {venue.branches.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <nav ref={tabsRef} className="yc-subtabs" aria-label={t('branchPage.tabs.label')}>
        {tabs.map((entry) => (
          <Link
            key={entry.key}
            to={`${base}/${SEGMENT[entry.key]}`}
            className={entry.key === tab ? 'is-on' : undefined}
            {...(entry.key === tab ? { 'aria-current': 'page' as const } : {})}
          >
            {entry.label}
            {entry.badge}
          </Link>
        ))}
      </nav>

      {children({ venue, branch, timeZoneId: route.timeZoneId })}
    </>
  );
}
