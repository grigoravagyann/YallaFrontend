import {
  StaffPermissionError,
  VenueHasOpenTabsError,
  type BlockingTab,
  type CreateStaffInput,
} from '@yalla/api';
import { useCreateStaff, useStaff } from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { newCommandId } from '../../lib/commandId';
import { PinDialog } from '../venue/staff/PinDialog';
import { StaffForm } from '../venue/staff/StaffForm';
import {
  useConsoleVenue,
  useDeleteVenue,
  useResumeVenue,
  useSuspendVenue,
} from '../../data/queries';

/** Yerevan, because that is where every venue in the pilot is. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';

/**
 * One venue: its branches, its staff, its tier, and the two destructive
 * actions.
 *
 * The `venueId` in the URL is not a scope claim. A platform admin's token
 * covers every venue, which is why this route only exists in their router; the
 * server checks anyway and a 403 renders the plain refusal page.
 */
export function VenueDetailRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { venueId } = useParams<{ venueId: string }>();

  const { data: venue, isLoading } = useConsoleVenue(venueId);
  /*
   * Staff come from a venue-scoped endpoint this screen used not to call, so
   * the card rendered "not available from the backend yet" over a backend that
   * has served `/api/venues/{id}/staff` all along. A platform admin has no
   * venue of their own, so this page is the only place they can give a new
   * venue its first owner.
   */
  const staff = useStaff(venueId);
  const createStaff = useCreateStaff(venueId ?? '');
  const suspend = useSuspendVenue();
  const resume = useResumeVenue();
  const remove = useDeleteVenue();

  const [confirming, setConfirming] = useState<'suspend' | 'delete' | null>(null);
  const [typed, setTyped] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<readonly BlockingTab[] | null>(null);
  const [hiring, setHiring] = useState(false);
  const [refusal, setRefusal] = useState<StaffPermissionError | null>(null);
  const [shownPin, setShownPin] = useState<{ name: string; pin: string } | null>(null);

  if (isLoading) return <p className="muted">{t('loading')}</p>;
  if (!venue) return <p className="error">{t('venue.notFound')}</p>;

  const close = () => {
    setConfirming(null);
    setTyped('');
    setFailure(null);
    setBlocked(null);
  };

  const run = async (action: () => Promise<unknown>) => {
    setFailure(null);
    setBlocked(null);
    try {
      await action();
      close();
    } catch (error) {
      // The whole point of the typed error: "cannot delete" is useless, and
      // "table 7 at Northern Avenue still has an open tab" is actionable in the
      // next thirty seconds.
      if (error instanceof VenueHasOpenTabsError) {
        setBlocked(error.openTabs);
        return;
      }
      setFailure(t('venue.failed'));
    }
  };

  const busy = suspend.isPending || resume.isPending || remove.isPending;
  // A typed confirmation, because the two destructive actions here are the ones
  // a tired person clicks past. Case-insensitive: the point is deliberation,
  // not transcription.
  const nameMatches = typed.trim().toLocaleLowerCase() === venue.name.toLocaleLowerCase();

  return (
    <section className="page">
      <p className="crumbs">
        <Link to="/platform/venues">{t('venues.title')}</Link>
      </p>

      <header className="page-head">
        <div>
          <h1>{venue.name}</h1>
          <p className="muted">
            {t('venue.slug')}: {venue.slug}
            {/* The platform view carries no creation date; omit the clause
                rather than render "Created Invalid Date". */}
            {venue.createdAtUtc
              ? ` · ${t('venue.created', {
                  date: formatDate(venue.createdAtUtc, CONSOLE_TIME_ZONE, locale),
                })}`
              : ''}
          </p>
          {venue.suspendedAtUtc ? (
            <p className="warn">
              {t('venue.suspendedOn', {
                date: formatDate(venue.suspendedAtUtc, CONSOLE_TIME_ZONE, locale),
              })}
            </p>
          ) : null}
        </div>
        <span className={`pill pill-${venue.status}`}>{t(`status.${venue.status}`)}</span>
      </header>

      <div className="card">
        <h2>{t('venue.branches')}</h2>
        {venue.branches.length === 0 ? (
          <p className="muted">{t('venue.noBranches')}</p>
        ) : (
          <ul className="rows">
            {venue.branches.map((branch) => (
              <li key={branch.id} className="row">
                <div>
                  <div className="row-title">{branch.name}</div>
                  <div className="muted small">
                    {t('venue.branchTables', { count: branch.tableCount })}
                    {/* `null` means nobody asked; only a real count is shown,
                        because "no open tabs" is a claim about the floor. */}
                    {branch.openTabCount !== null && branch.openTabCount > 0
                      ? ` · ${t('venue.openTabs', { count: branch.openTabCount })}`
                      : ''}
                  </div>
                </div>
                <span className={`pill pill-${branch.subscriptionTier}`}>
                  {t(`tier.${branch.subscriptionTier}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <header className="card-header">
          <h2>{t('venue.staff')}</h2>
          <button type="button" className="button" onClick={() => setHiring(true)}>
            {t('staff.add')}
          </button>
        </header>

        {hiring ? (
          <StaffForm
            actorRole="platformAdmin"
            // A platform admin belongs to no branch, so they may place the new
            // person anywhere in the venue — including across all of it.
            fixedBranchId={null}
            branches={venue.branches}
            editing={null}
            refusal={refusal}
            isSaving={createStaff.isPending}
            onCancel={() => {
              setHiring(false);
              setRefusal(null);
            }}
            onCreate={async (input: CreateStaffInput) => {
              setRefusal(null);
              try {
                const created = await createStaff.mutateAsync(input);
                setHiring(false);
                // The single moment the PIN is on a screen, same as the venue
                // staff screen: it came from the form and goes no further.
                setShownPin({ name: created.fullName, pin: input.pin });
              } catch (error) {
                if (error instanceof StaffPermissionError) setRefusal(error);
                else throw error;
              }
            }}
            onUpdate={async () => {
              // Editing happens on the venue's own staff screen; this card only
              // hires, because the first owner is the thing a platform admin
              // cannot do anywhere else.
            }}
          />
        ) : null}

        {shownPin ? (
          <PinDialog
            name={shownPin.name}
            pin={shownPin.pin}
            // Dropped from state entirely, same as the venue staff screen.
            // There is nowhere else it lives.
            onClose={() => setShownPin(null)}
          />
        ) : null}

        {staff.isLoading ? (
          <p className="muted">{t('loading')}</p>
        ) : staff.isError ? (
          <p className="error">{t('venue.staffFailed')}</p>
        ) : (staff.data?.length ?? 0) === 0 ? (
          <p className="muted">{t('venue.noStaff')}</p>
        ) : (
          <ul className="rows">
            {staff.data?.map((member) => (
              <li key={member.id} className="row">
                <div className="row-title">{member.fullName}</div>
                <span className="muted small">{t(`role.${member.role}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="actions">
          {venue.status === 'suspended' ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void run(() => resume.mutateAsync({ venueId: venue.id, commandId: newCommandId() }))
              }
            >
              {t('venue.resume')}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              disabled={busy || venue.status === 'deleted'}
              onClick={() => setConfirming('suspend')}
            >
              {t('venue.suspend')}
            </button>
          )}

          <button
            type="button"
            className="button button-danger"
            disabled={busy || venue.status === 'deleted'}
            onClick={() => setConfirming('delete')}
          >
            {t('venue.delete')}
          </button>
        </div>

        {failure ? <p className="error">{failure}</p> : null}

        {blocked ? (
          <div className="blocked">
            <h3>{t('venue.blocked.title')}</h3>
            {blocked.length === 0 ? (
              <p>{t('venue.blocked.unknown')}</p>
            ) : (
              <>
                <p>{t('venue.blocked.body')}</p>
                <ul>
                  {blocked.map((tab) => (
                    <li key={tab.tabId}>
                      {t('venue.blocked.tab', {
                        branch: tab.branchName,
                        table: tab.tableLabel,
                      })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {confirming === 'suspend' ? (
          <div className="confirm">
            <h3>{t('venue.suspendTitle', { name: venue.name })}</h3>
            <p className="muted">{t('venue.suspendBody')}</p>
            <div className="actions">
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    suspend.mutateAsync({ venueId: venue.id, commandId: newCommandId() }),
                  )
                }
              >
                {busy ? t('venue.working') : t('venue.suspendConfirm')}
              </button>
              <button type="button" className="button" disabled={busy} onClick={close}>
                {t('venue.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        {confirming === 'delete' ? (
          <div className="confirm confirm-danger">
            <h3>{t('venue.deleteTitle', { name: venue.name })}</h3>
            <p className="muted">{t('venue.deleteBody')}</p>
            <label className="labelled">
              <span>{t('venue.deleteTypeName', { name: venue.name })}</span>
              <input
                className="field"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="button button-danger"
                disabled={busy || !nameMatches}
                onClick={() =>
                  void run(() =>
                    remove.mutateAsync({ venueId: venue.id, commandId: newCommandId() }),
                  )
                }
              >
                {busy ? t('venue.working') : t('venue.deleteConfirm')}
              </button>
              <button type="button" className="button" disabled={busy} onClick={close}>
                {t('venue.cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
