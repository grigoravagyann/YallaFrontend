import {
  StaffPermissionError,
  canChooseBranch,
  canEditStaff,
  type StaffMember,
  type StaffRole,
} from '@yalla/api';
import {
  useClearPinLockout,
  useConsoleVenue,
  useCreateStaff,
  useSetStaffPin,
  useStaff,
  useUpdateStaff,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMemo, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { useVenueOutlet } from '../VenueLayout';
import { DevicesPanel } from './DevicesPanel';
import { PinDialog } from './PinDialog';
import { StaffForm } from './StaffForm';

type RoleFilter = StaffRole | 'all';

/**
 * Staff accounts and the tablets they sign in on.
 *
 * This route has been a placeholder since Frontend Prompt 6 while the API has
 * had staff CRUD, PIN reset and device enrolment since Backend 6 and 8b. The
 * consequence was that an owner could not add a manager, a manager could not
 * add a waiter, and nobody could enrol the tablet a venue runs on — so a venue
 * could not be staffed through the product at all, which made every other
 * screen unreachable for the people who use them.
 *
 * Two scopes on one page, because that is what the API has: **staff belong to
 * a venue** (an owner works everywhere) and **a device belongs to a branch**.
 */
export function StaffScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { branchId, timeZoneId, branchCount } = useVenueOutlet();
  const { user } = useCurrentUser();

  const venueId = user?.scope.venueId ?? undefined;
  const venue = useConsoleVenue(venueId);
  const staff = useStaff(venueId);

  const createStaff = useCreateStaff(venueId);
  const updateStaff = useUpdateStaff(venueId);
  const setPin = useSetStaffPin(venueId);
  const clearLockout = useClearPinLockout(venueId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [refusal, setRefusal] = useState<StaffPermissionError | null>(null);
  /** The one moment a PIN exists on screen. Cleared when the dialog closes. */
  const [shownPin, setShownPin] = useState<{ name: string; pin: string } | null>(null);

  const actorRole: StaffRole | 'platformAdmin' =
    user?.role === 'platformAdmin' ? 'platformAdmin' : ((user?.role ?? 'manager') as StaffRole);

  // The actor's own staff row, so "you cannot edit yourself" points at the
  // right person rather than at a console user id nothing matches.
  const actorId = useMemo(() => {
    const list = staff.data ?? [];
    const self = list.find(
      (member) =>
        member.role === actorRole && (member.branchId === branchId || member.branchId === null),
    );
    return self?.id ?? user?.id ?? '';
  }, [staff.data, actorRole, branchId, user]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (staff.data ?? [])
      .filter((member) => (showInactive ? !member.isActive : member.isActive))
      .filter((member) => roleFilter === 'all' || member.role === roleFilter)
      .filter((member) => !needle || member.fullName.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, locale));
  }, [staff.data, search, roleFilter, showInactive, locale]);

  const branches = venue.data?.branches ?? [];
  const showBranchColumn = canChooseBranch(actorRole) && branchCount > 1;

  function branchNameOf(member: StaffMember): string {
    if (member.branchId === null) return t('staff.allBranches');
    return branches.find((branch) => branch.id === member.branchId)?.name ?? '—';
  }

  if (!venueId) {
    return (
      <section className="page">
        <h2>{t('nav.staff')}</h2>
        <p className="muted">{t('staff.noVenue')}</p>
      </section>
    );
  }

  return (
    <section className="page staff-page">
      <header className="section-head">
        <div>
          <h2>{t('nav.staff')}</h2>
          <p className="muted">{t('staff.intro')}</p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setRefusal(null);
            setEditing(null);
            setCreating(true);
          }}
        >
          {t('staff.add')}
        </button>
      </header>

      {creating || editing ? (
        <StaffForm
          actorRole={actorRole}
          fixedBranchId={branchId}
          branches={branches}
          editing={editing}
          refusal={refusal}
          isSaving={createStaff.isPending || updateStaff.isPending}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
            setRefusal(null);
          }}
          onCreate={async (input) => {
            setRefusal(null);
            try {
              const created = await createStaff.mutateAsync(input);
              setCreating(false);
              // The single moment the PIN is on a screen. It came from the form
              // and goes no further than this dialog.
              setShownPin({ name: created.fullName, pin: input.pin });
            } catch (error) {
              if (error instanceof StaffPermissionError) setRefusal(error);
              else throw error;
            }
          }}
          onUpdate={async (patch) => {
            if (!editing) return;
            setRefusal(null);
            try {
              await updateStaff.mutateAsync({ staffMemberId: editing.id, patch });
              setEditing(null);
            } catch (error) {
              if (error instanceof StaffPermissionError) setRefusal(error);
              else throw error;
            }
          }}
        />
      ) : null}

      <div className="staff-filters">
        <label className="labelled inline">
          <span>{t('staff.filter.search')}</span>
          <input
            className="field"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>

        <label className="labelled inline">
          <span>{t('staff.filter.role')}</span>
          <select
            className="field"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.currentTarget.value as RoleFilter)}
          >
            <option value="all">{t('staff.filter.allRoles')}</option>
            {(['owner', 'manager', 'waiter', 'kitchen'] as const).map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </select>
        </label>

        {/* Deactivated people stay listed. Somebody who left in March and comes
            back in June is a reactivation, not a second record — their audit
            history has to stay attached to one person. */}
        <label className="labelled inline">
          <span>{t('staff.filter.inactive')}</span>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.currentTarget.checked)}
          />
        </label>
      </div>

      {staff.isError ? (
        <QueryFailureNotice error={staff.error} onRetry={() => void staff.refetch()} />
      ) : staff.isLoading ? (
        <p className="muted">{t('loading')}</p>
      ) : visible.length === 0 ? (
        /* The common state during onboarding, so it routes straight into
           hiring somebody rather than saying "no staff" and stopping. */
        <div className="empty-state">
          <p className="empty-title">
            {showInactive ? t('staff.empty.noneInactive') : t('staff.empty.title')}
          </p>
          {showInactive ? null : (
            <>
              <p className="muted">{t('staff.empty.body')}</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setCreating(true)}
              >
                {t('staff.empty.action')}
              </button>
            </>
          )}
        </div>
      ) : (
        <table className="table staff-table">
          <thead>
            <tr>
              <th scope="col">{t('staff.column.name')}</th>
              <th scope="col">{t('staff.column.role')}</th>
              {showBranchColumn ? <th scope="col">{t('staff.column.branch')}</th> : null}
              <th scope="col">{t('staff.column.status')}</th>
              <th scope="col">
                <span className="visually-hidden">{t('staff.column.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((member) => {
              const editable = canEditStaff({ id: actorId, role: actorRole }, member);
              return (
                <tr key={member.id} className={member.isActive ? '' : 'is-inactive'}>
                  <th scope="row">
                    {member.fullName}
                    <span className="muted small block">{member.phone}</span>
                  </th>
                  <td>{t(`role.${member.role}`)}</td>
                  {showBranchColumn ? <td>{branchNameOf(member)}</td> : null}
                  <td>
                    {member.isActive ? null : (
                      <span className="badge">{t('staff.status.inactive')}</span>
                    )}
                    {member.isPinLocked ? (
                      <span className="badge badge-warn">{t('staff.status.pinLocked')}</span>
                    ) : null}
                  </td>
                  <td className="staff-actions">
                    {/* The most time-critical control on the screen: a waiter
                        locked out mid-rush cannot wait out a timer. */}
                    {member.isPinLocked && branchId ? (
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => clearLockout.mutate({ branchId, staffMemberId: member.id })}
                      >
                        {t('staff.action.unlock')}
                      </button>
                    ) : null}

                    {editable ? (
                      <>
                        <button
                          type="button"
                          className="button button-small button-ghost"
                          onClick={() => {
                            setRefusal(null);
                            setCreating(false);
                            setEditing(member);
                          }}
                        >
                          {t('edit')}
                        </button>

                        <button
                          type="button"
                          className="button button-small button-ghost"
                          onClick={() => {
                            const pin = String(Math.floor(1000 + Math.random() * 9000));
                            setPin.mutate(
                              { staffMemberId: member.id, pin },
                              { onSuccess: () => setShownPin({ name: member.fullName, pin }) },
                            );
                          }}
                        >
                          {t('staff.action.resetPin')}
                        </button>

                        {/* Deactivate, never delete — the API offers no delete
                            and the confirmation says so rather than showing a
                            control that turns out to mean something else. */}
                        <button
                          type="button"
                          className="button button-small button-ghost"
                          onClick={() =>
                            updateStaff.mutate({
                              staffMemberId: member.id,
                              patch: { isActive: !member.isActive },
                            })
                          }
                        >
                          {member.isActive
                            ? t('staff.action.deactivate')
                            : t('staff.action.reactivate')}
                        </button>
                      </>
                    ) : (
                      <span className="muted small">{t('staff.action.notYours')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {branchId ? (
        <DevicesPanel branchId={branchId} timeZoneId={timeZoneId} locale={locale} />
      ) : null}

      {shownPin ? (
        <PinDialog
          name={shownPin.name}
          pin={shownPin.pin}
          // Dropped from state entirely. There is nowhere else it lives.
          onClose={() => setShownPin(null)}
        />
      ) : null}
    </section>
  );
}
