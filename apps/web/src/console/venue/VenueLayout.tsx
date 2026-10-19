import type { ConsoleUser, ManagedBranch } from '@yalla/api';
import { useVenueProfile } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { Outlet, useMatch, useOutletContext } from 'react-router-dom';
import { signOut } from '../../auth/authSession';
import { FLOOR_ROLES } from '../../auth/useCurrentUser';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { usingMockData } from '../../data/gateway';
import { useManagedVenue } from '../../data/queries';
import { ConsoleShell, initialsOf, type ShellGroup } from '../ui/ConsoleShell';
import {
  ClockIcon,
  MapPinIcon,
  MenuIcon,
  OverviewIcon,
  PolicyIcon,
  PublicPageIcon,
  ReportsIcon,
  RoomsIcon,
  SignOutIcon,
  StaffIcon,
  StarIcon,
  TabIcon,
} from '../ui/icons';
import { useBranchScope } from './useBranchScope';
import { confirmLeave } from './useUnsavedChangesGuard';
import { useVenueNavCounts, type VenueNavCounts } from './useVenueNavCounts';

export interface VenueLayoutProps {
  readonly user: ConsoleUser;
}

/** Where "My account" lives: the person block at the sidebar's foot opens it. */
export const VENUE_ACCOUNT_PATH = '/venue/account';

/**
 * The venue console's four groups (venue HANDOFF section 2), with the live
 * counts on Overview, Menu and Reviews. Every role under `/venue` gets the
 * same links: what an owner, a general manager and a branch manager may *do*
 * on each screen is the server's rank check, and the screens say so.
 *
 * One addition the artboards do not draw: a branch manager also works the
 * floor (`FLOOR_ROLES`), and the console's old sidebar linked the floor
 * screen for them. Dropping a working route would be a regression, so it
 * stays, under Today, after the overview.
 */
export function venueNavGroups(
  counts: VenueNavCounts,
  { floor }: { readonly floor: boolean } = { floor: false },
): readonly ShellGroup[] {
  const badge = (count: number | null, sayKey: string) =>
    count === null ? null : { count, sayKey };
  return [
    {
      id: 'today',
      labelKey: 'nav.group.today',
      links: [
        {
          to: '/venue',
          labelKey: 'nav.overview',
          icon: <OverviewIcon />,
          // The section's root: without `end` it matched every page under it.
          end: true,
          badge: badge(counts.pendingApprovals, 'nav.badge.pendingApprovals'),
        },
        // The counter screen, its own app with its own PIN session.
        ...(floor ? [{ to: '/staff', labelKey: 'nav.floor', icon: <TabIcon /> }] : []),
      ],
    },
    {
      id: 'venue',
      labelKey: 'nav.group.venue',
      links: [
        {
          to: '/venue/menu',
          labelKey: 'nav.menu',
          icon: <MenuIcon />,
          badge: badge(counts.incompleteDishes, 'nav.badge.incompleteDishes'),
        },
        { to: '/venue/floorplan', labelKey: 'nav.floorplan', icon: <RoomsIcon /> },
        { to: '/venue/hours', labelKey: 'nav.hours', icon: <ClockIcon /> },
        { to: '/venue/policy', labelKey: 'nav.policy', icon: <PolicyIcon /> },
        { to: '/venue/public', labelKey: 'nav.public', icon: <PublicPageIcon /> },
      ],
    },
    {
      id: 'team',
      labelKey: 'nav.group.team',
      links: [{ to: '/venue/staff', labelKey: 'nav.staff', icon: <StaffIcon /> }],
    },
    {
      id: 'results',
      labelKey: 'nav.group.results',
      links: [
        {
          to: '/venue/reviews',
          labelKey: 'nav.reviews',
          icon: <StarIcon />,
          badge: badge(counts.reportedReviews, 'nav.badge.reportedReviews'),
        },
        { to: '/venue/reports', labelKey: 'nav.reports', icon: <ReportsIcon /> },
      ],
    },
  ];
}

/**
 * The venue section's shell (docs/design/venue-console): the console's one
 * shell (`ConsoleShell`, shared with the platform admin's), with the venue and
 * its branch under the brand, the four groups of links, and the person at the
 * foot opening My account.
 *
 * The switcher's options are the branches `GET /api/venues/{id}/manage`
 * answers for **this caller** — never anything in the URL, and never the
 * token's branch claim intersected with a list. The server decides coverage
 * from the caller's staff row: an owner and a general manager see every
 * branch; a branch manager sees their own and gets no switcher at all, because a control with a single option is a control that
 * invites someone to go looking for the others. The token's claim only picks
 * which branch the section opens on.
 *
 * Until the read answers, the screens under this layout are not rendered: a
 * screen handed "no branch" while the list is still loading would say so, and
 * that sentence is a claim about the venue. If the read is refused, that is
 * said instead — a refusal must never read as "you have no branch".
 *
 * The screens wear the console's tokens (`yc-legacy`), as they already do
 * inside the platform's branch pages, until their own redesign phases.
 */
export function VenueLayout({ user }: VenueLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  const venue = useManagedVenue(user.scope.venueId ?? undefined);
  const branches = venue.data?.branches ?? [];
  const { branchId, setBranchId } = useBranchScope(branches, user.scope.branchIds[0] ?? null);
  const counts = useVenueNavCounts(branchId);

  // Their name as it is now, as the platform shell does: the token carries the
  // one it was issued with, and a rename in My account would leave the
  // sidebar wrong until the next sign-in. The token's name until `/me` answers.
  const profile = useVenueProfile().data;

  const current = branches.find((branch) => branch.id === branchId);
  const name = profile?.fullName || user.displayName || t(`role.${user.role}`);
  // My account needs nothing from the venue read, and holds the sign-out: it
  // opens whatever that read answered, so nobody is left with no way out.
  const onAccount = useMatch(VENUE_ACCOUNT_PATH) !== null;

  /* The branch travels through the outlet, not the URL: a branch id in the
     address bar is a scope claim the user could edit. */
  const outlet = (
    <Outlet
      context={
        {
          branchId,
          branchName: current?.name ?? null,
          timeZoneId: current?.timeZoneId ?? 'Asia/Yerevan',
          branchCount: branches.length,
          // The server allows the venue-wide report rollup to an owner, a
          // general manager or the platform admin (`ReportQuery.cs`). Decided
          // here, once, so no screen re-implements a role check — and so a
          // branch manager is not offered a query the server 403s.
          canRollUpVenue:
            (user.role === 'owner' || user.role === 'generalManager') && branches.length > 1,
          // Moving a branch — its map pin or its address — is an owner's
          // (K5); a manager's save of either is refused and audited as a
          // refusal, so the editors are not offered.
          canRelocate: user.role === 'owner',
        } satisfies VenueOutletContext
      }
    />
  );

  return (
    <ConsoleShell
      groups={venueNavGroups(counts, { floor: FLOOR_ROLES.includes(user.role) })}
      place={
        <VenuePlace
          venueName={venue.data?.name ?? (venue.isLoading ? t('loading') : '')}
          roleLabel={t(`role.${user.role}`)}
          branches={branches}
          current={current}
          onSwitch={(next) => {
            // Another branch is another screen: unsaved work here would be thrown away.
            if (confirmLeave()) setBranchId(next);
          }}
        />
      }
      person={{ name, caption: t('nav.account'), accountTo: VENUE_ACCOUNT_PATH }}
    >
      <div className="yc-legacy">
        {onAccount ? (
          outlet
        ) : venue.isLoading ? (
          <p className="muted" role="status">
            {t('loading')}
          </p>
        ) : venue.isError ? (
          <div className="yc-refused">
            <QueryFailureNotice error={venue.error} onRetry={() => void venue.refetch()} />
            {/* A refusal that retrying cannot change (a deactivated account's
                403) must not leave the person stuck signed in. */}
            {usingMockData ? null : (
              <button type="button" className="yc-btn yc-btn-sec" onClick={() => void signOut()}>
                <SignOutIcon />
                {t('shell.signOut')}
              </button>
            )}
          </div>
        ) : (
          outlet
        )}
      </div>
    </ConsoleShell>
  );
}

interface VenuePlaceProps {
  readonly venueName: string;
  readonly roleLabel: string;
  readonly branches: readonly ManagedBranch[];
  readonly current: ManagedBranch | undefined;
  readonly onSwitch: (branchId: string) => void;
}

/** The venue, the signed-in role, and the branch on screen: a switcher, or its one name. */
function VenuePlace({ venueName, roleLabel, branches, current, onSwitch }: VenuePlaceProps) {
  const { t } = useTranslation(['admin', 'common']);
  const switcherId = useId();
  return (
    <div className="yc-place">
      <div className="yc-place-t">
        {/* The section's venue read carries no cover photo; the initials stand in. */}
        <span className="yc-place-tile" aria-hidden="true">
          {initialsOf(venueName)}
        </span>
        <div>
          <span className="yc-place-n">{venueName}</span>
          <span className="yc-place-r">{roleLabel}</span>
        </div>
      </div>
      {branches.length > 1 ? (
        <div className="yc-bsw">
          <label htmlFor={switcherId}>{t('branchSwitcher.label')}</label>
          <select
            id={switcherId}
            value={current?.id ?? ''}
            onChange={(event) => onSwitch(event.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      ) : current ? (
        <p className="yc-bfix">
          <MapPinIcon />
          {t('branchSwitcher.onlyOne', { name: current.name })}
        </p>
      ) : null}
    </div>
  );
}

/** What every screen under `/venue` is given: the branch it may act on. */
export interface VenueOutletContext {
  readonly branchId: string | null;
  /** The branch's name, for a screen that says which branch it is about (Overview's subtitle). */
  readonly branchName?: string | null;
  readonly timeZoneId: string;
  /**
   * How many branches this person actually covers.
   *
   * A count rather than the list, deliberately. Reports needs to know whether
   * an "all branches" rollup is a meaningful offer; it does not need branch
   * ids, and handing them out would put a second branch picker on a screen
   * that already has one above it.
   */
  readonly branchCount: number;
  /**
   * Whether the reports screen may offer "all branches". True for an owner or
   * a general manager with more than one branch; never for a branch manager,
   * because the server refuses them the rollup.
   */
  readonly canRollUpVenue: boolean;
  /**
   * Whether the listing form may move the branch: the map pin and the street
   * address. An owner only — the platform admin reaches the same form through
   * the platform section, which says so itself.
   */
  readonly canRelocate: boolean;
}

export function useVenueOutlet(): VenueOutletContext {
  return useOutletContext<VenueOutletContext>();
}
