import type { ConsoleUser } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Outlet, useOutletContext } from 'react-router-dom';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { useManagedVenue } from '../../data/queries';
import { useBranchScope } from './useBranchScope';

export interface VenueLayoutProps {
  readonly user: ConsoleUser;
}

/**
 * The venue section's header, and the branch switcher.
 *
 * The switcher's options are the branches `GET /api/venues/{id}/manage`
 * answers for **this caller** — never anything in the URL, and never the
 * token's branch claim intersected with a list. The server decides coverage
 * from the caller's staff row: an owner and a manager created with no branch
 * see every branch; a manager created at a branch sees that one and gets no
 * switcher at all, because a control with a single option is a control that
 * invites someone to go looking for the others. The token's claim only picks
 * which branch the section opens on.
 *
 * Until the read answers, the screens under this layout are not rendered: a
 * screen handed "no branch" while the list is still loading would say so, and
 * that sentence is a claim about the venue. If the read is refused, that is
 * said instead — a refusal must never read as "you have no branch".
 */
export function VenueLayout({ user }: VenueLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  const venue = useManagedVenue(user.scope.venueId ?? undefined);
  const branches = venue.data?.branches ?? [];
  const { branchId, setBranchId } = useBranchScope(branches, user.scope.branchIds[0] ?? null);

  const current = branches.find((branch) => branch.id === branchId);

  return (
    <div className="venue-section">
      <header className="venue-head">
        <div>
          <h1 className="venue-name">
            {venue.data?.name ?? (venue.isLoading ? t('loading') : '')}
          </h1>
          <p className="muted small">{t(`role.${user.role}`)}</p>
        </div>

        {branches.length > 1 ? (
          <label className="labelled inline">
            <span>{t('branchSwitcher.label')}</span>
            <select
              className="field"
              value={branchId ?? ''}
              onChange={(event) => setBranchId(event.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : current ? (
          <p className="branch-fixed">{t('branchSwitcher.onlyOne', { name: current.name })}</p>
        ) : null}
      </header>

      {venue.isLoading ? (
        <p className="muted" role="status">
          {t('loading')}
        </p>
      ) : venue.isError ? (
        <QueryFailureNotice error={venue.error} onRetry={() => void venue.refetch()} />
      ) : (
        /* The branch travels through the outlet, not the URL: a branch id in
           the address bar is a scope claim the user could edit. */
        <Outlet
          context={
            {
              branchId,
              timeZoneId: current?.timeZoneId ?? 'Asia/Yerevan',
              branchCount: branches.length,
              // The server allows the venue-wide report rollup to an owner or
              // the platform admin only (`ReportQuery.cs`). Decided here, once,
              // so no screen re-implements a role check — and so a manager who
              // sees several branches is not offered a query the server 403s.
              canRollUpVenue: user.role === 'owner' && branches.length > 1,
            } satisfies VenueOutletContext
          }
        />
      )}
    </div>
  );
}

/** What every screen under `/venue` is given: the branch it may act on. */
export interface VenueOutletContext {
  readonly branchId: string | null;
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
   * Whether the reports screen may offer "all branches". True for an owner
   * with more than one branch; never for a manager, however many they see,
   * because the server refuses them the rollup.
   */
  readonly canRollUpVenue: boolean;
}

export function useVenueOutlet(): VenueOutletContext {
  return useOutletContext<VenueOutletContext>();
}
