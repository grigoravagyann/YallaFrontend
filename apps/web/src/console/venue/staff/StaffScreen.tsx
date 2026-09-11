import {
  StaffPermissionError,
  canChooseBranch,
  type StaffMember,
  type StaffRole,
  type StaffSignInLink,
} from '@yalla/api';
import {
  useClearPinLockout,
  useCreateStaff,
  useIssueStaffSignIn,
  useManagedVenue,
  useSetStaffPin,
  useStaff,
  useUpdateStaff,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useId, useMemo, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { useVenueOutlet } from '../VenueLayout';
import { AddStaffDialog } from './AddStaffDialog';
import { DevicesPanel } from './DevicesPanel';
import { EditStaffDialog } from './EditStaffDialog';
import { PinDialog } from './PinDialog';
import { SignInLinkDialog } from './SignInLinkDialog';
import { SignInPrompt } from './SignInPrompt';
import { StaffCard } from './StaffCard';
import { ROLE_ORDER, StaffFilters, type RoleFilter } from './StaffFilters';
import { issueFailureText } from './signInIssue';
import { actionsFor, type StaffAction } from './staffActions';
import { useStaffLabels } from './staffLabels';

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
      /** Where "try again" goes: the card's prompt, with the address to fix. */
      readonly retry: { readonly staffMemberId: string; readonly email: string } | null;
    };

/** The card whose address prompt is open, and what the last attempt said. */
export interface SignInPromptState {
  readonly staffMemberId: string;
  readonly email: string;
  readonly failure: string | null;
}

/** Four random digits, from the platform's cryptographic source. */
function randomPin(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(1000 + ((value ?? 0) % 9000));
}

/**
 * Staff accounts and the tablets they sign in on.
 *
 * Two scopes on one page, because that is what the API has: **staff belong to
 * a venue** (an owner works everywhere) and **a device belongs to a branch**.
 *
 * People are cards grouped by role, each with the one action that fits their
 * state and the rest behind "More"; adding somebody is a short step-by-step
 * dialog and editing is a one-page dialog. The rules behind every action are
 * the ones the table had — see `actionsFor`.
 */
export function StaffScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();
  const { locale } = useLocale();
  const { branchId, timeZoneId, branchCount } = useVenueOutlet();
  const { user } = useCurrentUser();
  const headingPrefix = useId();

  const venueId = user?.scope.venueId ?? undefined;
  // The read a venue user may make. The platform one answers them 403, which
  // left every branch name on the cards below as a dash.
  const venue = useManagedVenue(venueId);
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
    issueFailureText(error, {
      offline: t('state.offline'),
      generic: t('state.error'),
      badEmail: t('staff.signIn.emailRequired'),
      tooManyRequests: t('staff.signIn.tooManyRequests'),
    });

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

  // From the dialog to the card: the address is corrected there, and the
  // reason it was refused goes with it — the dialog's alert unmounts with the
  // dialog, and the sentence to act on belongs beside the field.
  const retryFrom = (
    retry: { staffMemberId: string; email: string } | null,
    failure: string | null,
  ) =>
    retry
      ? () => {
          setShown(null);
          setPrompt({ staffMemberId: retry.staffMemberId, email: retry.email, failure });
        }
      : null;

  const actorRole: StaffRole | 'platformAdmin' =
    user?.role === 'platformAdmin' ? 'platformAdmin' : ((user?.role ?? 'manager') as StaffRole);

  // The actor's own staff row, so "you cannot edit yourself" and the "You"
  // marker point at the right person. The console user's id is that row's id
  // against the real API; the first row with the actor's role at this branch
  // is the fallback for a session whose id matches nothing (the mock).
  const actorId = useMemo(() => {
    const list = staff.data ?? [];
    if (user && list.some((member) => member.id === user.id)) return user.id;
    const self = list.find(
      (member) =>
        member.role === actorRole && (member.branchId === branchId || member.branchId === null),
    );
    return self?.id ?? user?.id ?? '';
  }, [staff.data, actorRole, branchId, user]);

  // Search and the switch first: the chips count what those leave, so each
  // chip says how many cards it would show.
  const matching = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const digits = needle.replace(/\s/gu, '');
    return (staff.data ?? [])
      .filter((member) => (showInactive ? !member.isActive : member.isActive))
      .filter(
        (member) =>
          !needle ||
          member.fullName.toLocaleLowerCase().includes(needle) ||
          (digits !== '' && member.phone.replace(/\s/gu, '').includes(digits)),
      );
  }, [staff.data, search, showInactive]);

  const counts = useMemo(() => {
    const byRole: Record<RoleFilter, number> = {
      all: matching.length,
      owner: 0,
      manager: 0,
      waiter: 0,
      kitchen: 0,
    };
    for (const member of matching) byRole[member.role] += 1;
    return byRole;
  }, [matching]);

  const groups = useMemo(() => {
    const visible = matching
      .filter((member) => roleFilter === 'all' || member.role === roleFilter)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, locale));
    return ROLE_ORDER.map((role) => ({
      role,
      members: visible.filter((member) => member.role === role),
    })).filter((group) => group.members.length > 0);
  }, [matching, roleFilter, locale]);

  const branches = venue.data?.branches ?? [];
  // The branch on each card only where the actor covers more than one: a
  // manager with one branch does not need its name on every card.
  const showBranch = canChooseBranch(actorRole) && branchCount > 1;

  function branchNameOf(member: StaffMember): string {
    if (member.branchId === null) return t('staff.allBranches');
    return branches.find((branch) => branch.id === member.branchId)?.name ?? '—';
  }

  const closeForms = useCallback(() => {
    setCreating(false);
    setEditing(null);
    setRefusal(null);
  }, []);

  function onAction(member: StaffMember, action: StaffAction) {
    switch (action) {
      case 'unlock':
        // The most time-critical control on the screen: a waiter locked out
        // mid-rush cannot wait out a timer.
        if (branchId) clearLockout.mutate({ branchId, staffMemberId: member.id });
        return;
      case 'edit':
        setRefusal(null);
        setCreating(false);
        setEditing(member);
        return;
      case 'resetPin': {
        const pin = randomPin();
        setPin.mutate(
          { staffMemberId: member.id, pin },
          { onSuccess: () => setShown({ kind: 'pin', name: member.fullName, pin }) },
        );
        return;
      }
      case 'issueSignIn':
      case 'sendNewLink':
        setPrompt({ staffMemberId: member.id, email: member.email ?? '', failure: null });
        return;
      case 'deactivate':
      case 'reactivate':
        // Deactivate, never delete — the API offers no delete. Somebody who
        // left in March and returns in June is a reactivation.
        updateStaff.mutate({
          staffMemberId: member.id,
          patch: { isActive: action === 'reactivate' },
        });
        return;
    }
  }

  if (!venueId) {
    return (
      <section className="page">
        <h2>{t('nav.staff')}</h2>
        <p className="muted">{t('staff.noVenue')}</p>
      </section>
    );
  }

  const actor = { id: actorId, role: actorRole };
  // The issue call counts: the dialog stays in "Saving…" until the next one
  // is ready, so there is never a moment with the person made and nothing on
  // screen about it.
  const isSaving = createStaff.isPending || updateStaff.isPending || issueSignIn.isPending;

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

      <StaffFilters
        search={search}
        onSearch={setSearch}
        roleFilter={roleFilter}
        onRoleFilter={setRoleFilter}
        counts={counts}
        showInactive={showInactive}
        onShowInactive={setShowInactive}
      />

      {staff.isError ? (
        <QueryFailureNotice error={staff.error} onRetry={() => void staff.refetch()} />
      ) : staff.isLoading ? (
        <p className="muted">{t('loading')}</p>
      ) : groups.length === 0 ? (
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
                onClick={() => {
                  setRefusal(null);
                  setEditing(null);
                  setCreating(true);
                }}
              >
                {t('staff.empty.action')}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="roster-groups">
          {groups.map((group) => {
            const headingId = `${headingPrefix}-${group.role}`;
            return (
              <section key={group.role} className="roster-group" aria-labelledby={headingId}>
                <h3 id={headingId} className="roster-group-head">
                  {labels.group(group.role)}{' '}
                  <span className="badge badge-count">{group.members.length}</span>
                </h3>
                <ul className="roster-grid">
                  {group.members.map((member) => (
                    <StaffCard
                      key={member.id}
                      member={member}
                      branchLabel={showBranch ? branchNameOf(member) : null}
                      actions={actionsFor(member, actor, { canUnlock: branchId !== null })}
                      onAction={(action) => onAction(member, action)}
                    >
                      {prompt?.staffMemberId === member.id ? (
                        <SignInPrompt
                          key={prompt.email}
                          member={member}
                          initialEmail={prompt.email}
                          failure={prompt.failure}
                          isPending={issueSignIn.isPending}
                          onSend={(email) => void sendSignIn(member, email)}
                          onCancel={() => setPrompt(null)}
                        />
                      ) : null}
                    </StaffCard>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Keyed by branch: a code or an open revoke confirmation belongs to the
          branch it was made for, not the one switched to. */}
      {branchId ? (
        <DevicesPanel key={branchId} branchId={branchId} timeZoneId={timeZoneId} locale={locale} />
      ) : null}

      {creating ? (
        <AddStaffDialog
          actorRole={actorRole}
          fixedBranchId={branchId}
          branches={branches}
          refusal={refusal}
          isSaving={isSaving}
          onCancel={closeForms}
          onCreate={async (input, signIn) => {
            setRefusal(null);
            try {
              // `input` carries no email: the address goes on the second call,
              // after the person exists, because the server refuses an email
              // without a password on create and nobody types one here.
              const created = await createStaff.mutateAsync(input);
              // The single moment the PIN is on a screen. It came from the
              // dialog and goes no further than the next one.
              if (!signIn) {
                setShown({ kind: 'pin', name: created.fullName, pin: input.pin });
                setCreating(false);
                return null;
              }
              // The dialog opens whatever the second call says: the person
              // exists now and their PIN must be shown or it is gone. The add
              // dialog closes only once the next is set, in the same render.
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
                // Same as the card path: the dialog holds the only copy.
                issueSignIn.reset();
                setCreating(false);
              }
              return null;
            } catch (error) {
              if (error instanceof StaffPermissionError) {
                setRefusal(error);
                return error;
              }
              throw error;
            }
          }}
        />
      ) : null}

      {editing ? (
        <EditStaffDialog
          key={editing.id}
          member={editing}
          actorRole={actorRole}
          fixedBranchId={branchId}
          branches={branches}
          refusal={refusal}
          isSaving={isSaving}
          onCancel={closeForms}
          onUpdate={async (patch) => {
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
          onRetry={retryFrom(shown.retry, shown.failure)}
          onClose={() => setShown(null)}
        />
      ) : null}
    </section>
  );
}
