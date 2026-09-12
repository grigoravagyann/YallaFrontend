import {
  ApiError,
  BranchNotReadyError,
  StaffPermissionError,
  VenueHasOpenTabsError,
  canIssueSignIn,
  isAdminRole,
  type BlockingTab,
  type StaffMember,
  type SubscriptionTier,
} from '@yalla/api';
import { useCreateStaff, useIssueStaffSignIn, useStaff } from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCurrentUser } from '../../auth/useCurrentUser';
import { newCommandId } from '../../lib/commandId';
import { PinDialog } from '../venue/staff/PinDialog';
import { SignInLinkDialog } from '../venue/staff/SignInLinkDialog';
import { SignInPrompt } from '../venue/staff/SignInPrompt';
import { StaffForm } from '../venue/staff/StaffForm';
import { issueFailureText } from '../venue/staff/signInIssue';
import type { ShownCredentials, SignInPromptState } from '../venue/staff/StaffScreen';
import {
  useConsoleVenue,
  useDeleteVenue,
  useResumeVenue,
  useSetBranchTier,
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
 *
 * **This is the venue bootstrap path.** A new venue has nobody in it, so there
 * is no owner yet to add a co-owner, and the only actor strictly above an
 * owner is the platform admin — so the first owner is made here, and here is
 * the only place an owner's sign-in can be issued or repaired. A hire from this card that did
 * not also issue a sign-in produced an owner nobody could ever sign in as.
 */
export function VenueDetailRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { venueId } = useParams<{ venueId: string }>();
  const { user } = useCurrentUser();

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
  const issueSignIn = useIssueStaffSignIn(venueId ?? '');
  const suspend = useSuspendVenue();
  const resume = useResumeVenue();
  const remove = useDeleteVenue();
  const setTier = useSetBranchTier();

  const [confirming, setConfirming] = useState<'suspend' | 'delete' | null>(null);
  /**
   * The tier refusal, on the row it belongs to. Both of the server's answers
   * are actionable in the next minute — "3 dishes still need a photo", "table 7
   * has an open tab" — so they are shown where the button was, not in a
   * venue-wide banner.
   */
  const [tierFailure, setTierFailure] = useState<{ branchId: string; text: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<readonly BlockingTab[] | null>(null);
  const [hiring, setHiring] = useState(false);
  const [refusal, setRefusal] = useState<StaffPermissionError | null>(null);
  /** The one moment a PIN or a link is on screen; same rule as the venue's staff screen. */
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
      setPrompt((current) => (current ? { ...current, failure: failureText(error) } : null));
    } finally {
      // The hook keeps the result as its own `data` — a second copy of the
      // link. The dialog's state is the only one wanted.
      issueSignIn.reset();
    }
  }

  // From the dialog to the row: the address is corrected there, and the
  // reason it was refused goes with it, since the dialog's alert unmounts
  // with the dialog.
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

  if (isLoading) return <p className="muted">{t('loading')}</p>;
  if (!venue) return <p className="error">{t('venue.notFound')}</p>;

  // A platform admin belongs to no venue, so no row is ever theirs; the guard
  // is still the shared one so the rank rule cannot drift from the server's.
  const actor = { id: user?.id ?? 'platform', role: 'platformAdmin' as const };

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

  /**
   * Tabs and ordering are what a branch pays for. The gateway, the mock and
   * the contract could always change this; the page only displayed it, so the
   * one way to switch a venue on was a hand call to the API.
   */
  const switchTier = async (branchId: string, tier: SubscriptionTier) => {
    setTierFailure(null);
    try {
      await setTier.mutateAsync({ branchId, tier, commandId: newCommandId() });
    } catch (error) {
      if (error instanceof BranchNotReadyError) {
        setTierFailure({
          branchId,
          text: t('venue.tier.notReady', { count: error.incompleteMenuItemCount }),
        });
        return;
      }
      // The open-tabs refusal is a plain 409 whose sentence names the tables;
      // the server's words beat any paraphrase here.
      if (error instanceof ApiError && error.status === 409) {
        setTierFailure({ branchId, text: error.message });
        return;
      }
      setTierFailure({ branchId, text: t('venue.failed') });
    }
  };
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
                <div className="actions">
                  {tierFailure?.branchId === branch.id ? (
                    <span className="error small">{tierFailure.text}</span>
                  ) : null}
                  <span className={`pill pill-${branch.subscriptionTier}`}>
                    {t(`tier.${branch.subscriptionTier}`)}
                  </span>
                  <button
                    type="button"
                    className="button button-small button-ghost"
                    disabled={setTier.isPending || venue.status === 'deleted'}
                    onClick={() =>
                      void switchTier(
                        branch.id,
                        branch.subscriptionTier === 'paid' ? 'free' : 'paid',
                      )
                    }
                  >
                    {branch.subscriptionTier === 'paid'
                      ? t('venue.tier.toFree')
                      : t('venue.tier.toPaid')}
                  </button>
                </div>
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
            // The issue call counts too: the form stays in "Saving…" until
            // the dialog is ready, as on the venue staff screen.
            isSaving={createStaff.isPending || issueSignIn.isPending}
            onCancel={() => {
              setHiring(false);
              setRefusal(null);
            }}
            onCreate={async (input, signIn) => {
              setRefusal(null);
              try {
                // No email on the create call: the server refuses one without
                // a password, and the address goes on the issue call after the
                // owner exists.
                const created = await createStaff.mutateAsync(input);
                // The single moment the PIN is on a screen, same as the venue
                // staff screen: it came from the form and goes no further.
                if (!signIn) {
                  setShown({ kind: 'pin', name: created.fullName, pin: input.pin });
                  setHiring(false);
                  return;
                }
                // Always the dialog: the owner exists now, and their PIN has to
                // be shown whether or not the link followed. The form closes
                // only once the dialog is set, in the same render.
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
                  issueSignIn.reset();
                  setHiring(false);
                }
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

        {/* Dropped from state entirely on close, same as the venue staff
            screen. There is nowhere else either credential lives. */}
        {shown?.kind === 'pin' ? (
          <PinDialog name={shown.name} pin={shown.pin} onClose={() => setShown(null)} />
        ) : shown ? (
          <SignInLinkDialog
            name={shown.name}
            pin={shown.pin}
            link={shown.link}
            failure={shown.failure}
            timeZoneId={CONSOLE_TIME_ZONE}
            locale={locale}
            onRetry={retryFrom(shown.retry, shown.failure)}
            onClose={() => setShown(null)}
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
            {staff.data?.map((member) => {
              const signsIn = isAdminRole(member.role);
              // The same gate as the venue staff screen: strictly below the
              // actor, an admin-panel role, and active — the server refuses
              // the rest and a refused action is not offered.
              const canIssue = canIssueSignIn(actor, member);
              return (
                <Fragment key={member.id}>
                  <li className={member.isActive ? 'row' : 'row is-inactive'}>
                    <div>
                      <div className="row-title">{member.fullName}</div>
                      {signsIn && member.email ? (
                        <div className="muted small">{member.email}</div>
                      ) : null}
                    </div>
                    <div className="actions">
                      {member.isActive ? null : (
                        <span className="badge">{t('staff.status.inactive')}</span>
                      )}
                      {/* Not on a deactivated row, as on the venue staff screen:
                          no action is offered there, and the badge returns
                          with the action on reactivation. */}
                      {member.isActive && signsIn && !member.email ? (
                        <span className="badge badge-warn">{t('staff.status.noSignIn')}</span>
                      ) : null}
                      {member.isActive && signsIn && member.email && !member.hasPasswordSignIn ? (
                        <span className="badge">{t('staff.status.awaitingPassword')}</span>
                      ) : null}
                      <span className="muted small">{t(`role.${member.role}`)}</span>
                      {canIssue ? (
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
                    </div>
                  </li>
                  {prompt?.staffMemberId === member.id ? (
                    <li className="row sign-in-prompt-row">
                      <SignInPrompt
                        key={prompt.email}
                        member={member}
                        initialEmail={prompt.email}
                        failure={prompt.failure}
                        isPending={issueSignIn.isPending}
                        onSend={(email) => void sendSignIn(member, email)}
                        onCancel={() => setPrompt(null)}
                      />
                    </li>
                  ) : null}
                </Fragment>
              );
            })}
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
