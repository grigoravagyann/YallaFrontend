import {
  StaffPermissionError,
  canChooseBranch,
  canEditStaff,
  isAdminRole,
  type StaffMember,
  type StaffRole,
  type StaffSignInLink,
} from '@yalla/api';
import {
  useClearPinLockout,
  useConsoleVenue,
  useCreateStaff,
  useIssueStaffSignIn,
  useSetStaffPin,
  useStaff,
  useUpdateStaff,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Fragment, useMemo, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { useVenueOutlet } from '../VenueLayout';
import { DevicesPanel } from './DevicesPanel';
import { PinDialog } from './PinDialog';
import { SignInLinkDialog } from './SignInLinkDialog';
import { SignInPrompt } from './SignInPrompt';
import { StaffForm } from './StaffForm';
import { issueFailureText } from './signInIssue';

type RoleFilter = StaffRole | 'all';

/**
 * The one thing on screen that must exist exactly once: a credential.
 *
 * A single state rather than one per kind, so there is never a PIN dialog and
 * a link dialog open at the same time — and so that a hire which made a
 * person but not their link still shows the PIN, which otherwise dies with
 * the form.
 */
export type ShownCredentials =
  | { readonly kind: 'pin'; readonly name: string; readonly pin: string }
  | {
      readonly kind: 'signIn';
      readonly name: string;
      readonly pin: string | null;
      readonly link: StaffSignInLink | null;
      readonly failure: string | null;
      /** Where "try again" goes: the row's prompt, with the address to fix. */
      readonly retry: { readonly staffMemberId: string; readonly email: string } | null;
    };

/** The row whose address prompt is open, and what the last attempt said. */
export interface SignInPromptState {
  readonly staffMemberId: string;
  readonly email: string;
  readonly failure: string | null;
}

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
  const issueSignIn = useIssueStaffSignIn(venueId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [refusal, setRefusal] = useState<StaffPermissionError | null>(null);
  /**
   * The one moment a PIN or a sign-in link exists on screen. Cleared when the
   * dialog closes; there is nowhere else either lives.
   */
  const [shown, setShown] = useState<ShownCredentials | null>(null);
  const [prompt, setPrompt] = useState<SignInPromptState | null>(null);

  const failureText = (error: unknown) =>
    issueFailureText(error, { offline: t('state.offline'), generic: t('state.error') });

  async function sendSignIn(member: StaffMember, email: string) {
    try {
      const link = await issueSignIn.mutateAsync({ staffMemberId: member.id, email });
      setPrompt(null);
      setShown({
        kind: 'signIn',
        name: member.fullName,
        pin: null,
        link,
        failure: null,
        retry: null,
      });
    } catch (error) {
      // Under the field, where the address can be corrected and sent again.
      setPrompt((current) => (current ? { ...current, failure: failureText(error) } : null));
    } finally {
      // The hook keeps the result as its own `data`. That is a second copy of
      // the link, and the dialog's state is the only one wanted.
      issueSignIn.reset();
    }
  }

  // From the dialog to the row: the address is corrected there.
  const retryFrom = (retry: { staffMemberId: string; email: string } | null) =>
    retry
      ? () => {
          setShown(null);
          setPrompt({ staffMemberId: retry.staffMemberId, email: retry.email, failure: null });
        }
      : null;

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
          onCreate={async (input, signIn) => {
            setRefusal(null);
            try {
              // `input` carries no email: the address goes on the second call,
              // after the person exists, because the server refuses an email
              // without a password on create and nobody types one here.
              const created = await createStaff.mutateAsync(input);
              setCreating(false);
              // The single moment the PIN is on a screen. It came from the form
              // and goes no further than this dialog.
              if (!signIn) {
                setShown({ kind: 'pin', name: created.fullName, pin: input.pin });
                return;
              }
              // The dialog opens whatever the second call says: the person
              // exists now and their PIN must be shown or it is gone.
              try {
                const link = await issueSignIn.mutateAsync({
                  staffMemberId: created.id,
                  email: signIn.email,
                });
                setShown({
                  kind: 'signIn',
                  name: created.fullName,
                  pin: input.pin,
                  link,
                  failure: null,
                  retry: null,
                });
              } catch (error) {
                setShown({
                  kind: 'signIn',
                  name: created.fullName,
                  pin: input.pin,
                  link: null,
                  failure: failureText(error),
                  retry: { staffMemberId: created.id, email: signIn.email },
                });
              } finally {
                // Same as the row path: the dialog holds the only copy.
                issueSignIn.reset();
              }
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
              const signsIn = isAdminRole(member.role);
              return (
                <Fragment key={member.id}>
                  <tr className={member.isActive ? '' : 'is-inactive'}>
                    <th scope="row">
                      {member.fullName}
                      <span className="muted small block">{member.phone}</span>
                      {/* The address a link was issued to: weeks later, "which
                        email did I send it to" has to be answerable here. */}
                      {signsIn && member.email ? (
                        <span className="muted small block">{member.email}</span>
                      ) : null}
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
                      {/* Two states short of a working sign-in, told apart because
                        the fix differs: no address at all is a person nobody
                        has issued for; an address without a password is
                        somebody who has not opened their link yet — or whose
                        link has died, which is why the badge does not claim
                        it is alive. */}
                      {signsIn && !member.email ? (
                        <span className="badge badge-warn">{t('staff.status.noSignIn')}</span>
                      ) : null}
                      {signsIn && member.email && !member.hasPasswordSignIn ? (
                        <span className="badge">{t('staff.status.awaitingPassword')}</span>
                      ) : null}
                    </td>
                    <td className="staff-actions">
                      {/* The most time-critical control on the screen: a waiter
                        locked out mid-rush cannot wait out a timer. */}
                      {member.isPinLocked && branchId ? (
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() =>
                            clearLockout.mutate({ branchId, staffMemberId: member.id })
                          }
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
                            {t('common:action.edit')}
                          </button>

                          <button
                            type="button"
                            className="button button-small button-ghost"
                            onClick={() => {
                              const pin = String(Math.floor(1000 + Math.random() * 9000));
                              setPin.mutate(
                                { staffMemberId: member.id, pin },
                                {
                                  onSuccess: () =>
                                    setShown({ kind: 'pin', name: member.fullName, pin }),
                                },
                              );
                            }}
                          >
                            {t('staff.action.resetPin')}
                          </button>

                          {/* Only for somebody who signs in to the admin panel
                            and is active: the server refuses both a PIN-only
                            role and a deactivated person, and an action that
                            will be refused is not offered. */}
                          {signsIn && member.isActive ? (
                            <button
                              type="button"
                              className="button button-small button-ghost"
                              onClick={() =>
                                setPrompt({
                                  staffMemberId: member.id,
                                  email: member.email ?? '',
                                  failure: null,
                                })
                              }
                            >
                              {member.email
                                ? t('staff.action.sendNewLink')
                                : t('staff.action.issueSignIn')}
                            </button>
                          ) : null}

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
                  {prompt?.staffMemberId === member.id ? (
                    <tr className="sign-in-prompt-row">
                      <td colSpan={showBranchColumn ? 5 : 4}>
                        <SignInPrompt
                          key={prompt.email}
                          member={member}
                          initialEmail={prompt.email}
                          failure={prompt.failure}
                          isPending={issueSignIn.isPending}
                          onSend={(email) => void sendSignIn(member, email)}
                          onCancel={() => setPrompt(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {branchId ? (
        <DevicesPanel branchId={branchId} timeZoneId={timeZoneId} locale={locale} />
      ) : null}

      {/* Dropped from state entirely on close. There is nowhere else either
          credential lives. */}
      {shown?.kind === 'pin' ? (
        <PinDialog name={shown.name} pin={shown.pin} onClose={() => setShown(null)} />
      ) : shown ? (
        <SignInLinkDialog
          name={shown.name}
          pin={shown.pin}
          link={shown.link}
          failure={shown.failure}
          timeZoneId={timeZoneId}
          locale={locale}
          onRetry={retryFrom(shown.retry)}
          onClose={() => setShown(null)}
        />
      ) : null}
    </section>
  );
}
