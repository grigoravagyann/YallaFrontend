import type { ConsoleUser } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Outlet, useOutletContext } from 'react-router-dom';
import { useConsoleVenue } from '../../data/queries';
import { useBranchScope } from './useBranchScope';

export interface VenueLayoutProps {
  readonly user: ConsoleUser;
}

/**
 * The venue section's header, and the branch switcher.
 *
 * The switcher's options come from the venue the *token* names, intersected
 * with the branches the token lists — never from anything in the URL. An owner
 * sees all their branches; a manager sees one and gets no switcher at all,
 * because a control with a single option is a control that invites someone to
 * go looking for the others.
 */
export function VenueLayout({ user }: VenueLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { data: venue, isLoading } = useConsoleVenue(user.scope.venueId ?? undefined);
  const { branches, branchId, setBranchId } = useBranchScope(user, venue?.branches ?? []);

  const current = branches.find((branch) => branch.id === branchId);

  return (
    <div className="venue-section">
      <header className="venue-head">
        <div>
          <h1 className="venue-name">{venue?.name ?? (isLoading ? t('loading') : '')}</h1>
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

      {/* The branch travels through the outlet, not the URL: a branch id in
          the address bar is a scope claim the user could edit. */}
      <Outlet
        context={
          {
            branchId,
            timeZoneId: current?.timeZoneId ?? 'Asia/Yerevan',
            branchCount: branches.length,
          } satisfies VenueOutletContext
        }
      />
    </div>
  );
}

/** What every screen under `/venue` is given: the branch it may act on. */
export interface VenueOutletContext {
  readonly branchId: string | null;
  readonly timeZoneId: string;
  /**
   * How many branches this token actually covers.
   *
   * A count rather than the list, deliberately. Reports needs to know whether
   * an "all branches" rollup is a meaningful offer; it does not need branch
   * ids, and handing them out would put a second branch picker on a screen
   * that already has one above it.
   */
  readonly branchCount: number;
}

export function useVenueOutlet(): VenueOutletContext {
  return useOutletContext<VenueOutletContext>();
}
