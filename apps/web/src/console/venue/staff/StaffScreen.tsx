import {
  StaffPinTakenError,
  assignableRoles,
  canChooseBranch,
  type StaffMember,
  type StaffRole,
  type StaffSignInLink,
} from '@yalla/api';
import {
  useBranchShifts,
  useClearPinLockout,
  useManagedVenue,
  useSetStaffPin,
  useStaff,
  useUpdateStaff,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { initialsOf } from '../../ui/ConsoleShell';
import {
  ClockIcon,
  LockIcon,
  PadlockIcon,
  PauseIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  SendIcon,
  UserIcon,
} from '../../ui/icons';
import { OnceLinkDialog } from '../../ui/OnceLinkDialog';
import { PageHeader } from '../../ui/PageHeader';
import { RowMenu, type RowMenuItem } from '../../ui/RowMenu';
import { useToast } from '../../ui/toast';
import { useVenueOutlet } from '../VenueLayout';
import { AddStaffWizard, type Hired } from './AddStaffWizard';
import { ChangeOwnPinDialog } from './ChangeOwnPinDialog';
import { DeactivateDialog } from './DeactivateDialog';
import { DevicesPanel } from './DevicesPanel';
import { EditStaffDialog } from './EditStaffDialog';
import { IssueSignInDialog } from './IssueSignInDialog';
import { ShiftDialog } from './ShiftDialog';
import {
  canChangeOwnPin,
  rowActionsFor,
  staffStatusOf,
  type StaffAction,
  type StaffStatus,
} from './staffActions';
import { asStaffRefusal, type StaffRefusal } from './staffRefusal';
import { shiftLineOf, type ShiftLine } from './staffShifts';
import { useStaffLabels } from './staffLabels';

/** The groups' order, most senior first (Staff artboard). */
const ROLE_ORDER: readonly StaffRole[] = [
  'owner',
  'generalManager',
  'manager',
  'waiter',
  'kitchen',
];

type RoleFilter = StaffRole | 'all';

const PILL: Readonly<Record<StaffStatus, string>> = {
  active: 'yc-pill yc-pill-green',
  awaiting: 'yc-pill yc-pill-amber',
  noSignIn: 'yc-pill yc-pill-grey',
  pinLocked: 'yc-pill yc-pill-red',
  inactive: 'yc-pill yc-pill-grey',
};

/** How many PINs "New PIN" draws before it gives up on finding a free one. */
const RESET_PIN_ATTEMPTS = 5;

/** Four random digits, from the platform's cryptographic source. */
function randomPin(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(1000 + ((value ?? 0) % 9000));
}

/** The one dialog open on the page; a credential lives in it and nowhere else. */
type Open =
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly member: StaffMember }
  | { readonly kind: 'deactivate'; readonly member: StaffMember }
  | { readonly kind: 'ownPin'; readonly member: StaffMember }
  | { readonly kind: 'shift'; readonly member: StaffMember }
  | {
      readonly kind: 'issue';
      readonly member: StaffMember;
      readonly email: string;
      readonly failure: string | null;
    }
  | {
      readonly kind: 'once';
      readonly title: string;
      readonly pin: string | null;
      readonly link: StaffSignInLink | null;
      readonly failure: string | null;
      /** Where "try again" goes: the address, with the person it is for. */
      readonly retry: { readonly member: StaffMember; readonly email: string } | null;
      /** Said when it closes: "added", "saved", or nothing for a new PIN. */
      readonly toast: string | null;
      readonly returnTo: string;
    };

/**
 * Who works at this branch, today's shift of each, and the tablets they sign
 * in on (Staff artboard).
 *
 * People are rows grouped by role, each with the one thing that needs doing
 * now as a button — unlock a PIN, give a sign-in, a new link — and the rest in
 * a ⋮ menu: New PIN, Edit, Shift, the sign-in, Deactivate. Somebody above the
 * actor's role says so and offers nothing (`rowActionsFor`). A PIN, a sign-in
 * link and a tablet's enrolment code are shown once, in a dialog that warns
 * once before closing on a link not yet copied (`OnceLinkDialog`).
 *
 * Staff belong to the venue and a tablet to a branch; the page shows the
 * people who work at the branch in the sidebar — its own and the venue-wide
 * owners and general managers — as the artboard does.
 */
export function StaffScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();
  const { locale } = useLocale();
  const toast = useToast();
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  const { user } = useCurrentUser();

  const venueId = user?.scope.venueId ?? undefined;
  // The read a venue user may make. The platform one answers them 403.
  const venue = useManagedVenue(venueId);
  const staff = useStaff(venueId);
  const shifts = useBranchShifts(branchId);

  const updateStaff = useUpdateStaff(venueId);
  const setPin = useSetStaffPin(venueId);
  const clearLockout = useClearPinLockout(venueId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [refusal, setRefusal] = useState<StaffRefusal | null>(null);

  const branches = venue.data?.branches ?? [];
  const here = branchName ?? branches.find((branch) => branch.id === branchId)?.name ?? '';

  const actorRole: StaffRole | 'platformAdmin' =
    user?.role === 'platformAdmin' ? 'platformAdmin' : ((user?.role ?? 'manager') as StaffRole);

  // The actor's own staff row, so "You" and "Change my PIN" point at the right
  // person. The console user's id is that row's id against the real API; the
  // first row with the actor's role at this branch is the fallback for a
  // session whose id matches nothing (the mock's development role switch).
  const actorId = useMemo(() => {
    const list = staff.data ?? [];
    if (user && list.some((member) => member.id === user.id)) return user.id;
    const self = list.find(
      (member) =>
        member.role === actorRole && (member.branchId === branchId || member.branchId === null),
    );
    return self?.id ?? user?.id ?? '';
  }, [staff.data, actorRole, branchId, user]);

  // Where the actor works, for the one rule that needs it: a branch manager
  // touches their own branch's people only.
  const actorBranchId =
    staff.data?.find((member) => member.id === actorId)?.branchId ??
    user?.scope.branchIds[0] ??
    null;
  const actor = { id: actorId, role: actorRole, branchId: actorBranchId };
  const self = staff.data?.find((member) => member.id === actorId) ?? null;

  /** The people of this branch, and the venue-wide ones. */
  const atBranch = useMemo(
    () =>
      (staff.data ?? []).filter(
        (member) => !branchId || member.branchId === null || member.branchId === branchId,
      ),
    [staff.data, branchId],
  );

  const groups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const digits = needle.replace(/\s/gu, '');
    const visible = atBranch
      .filter((member) => showInactive || member.isActive)
      .filter((member) => roleFilter === 'all' || member.role === roleFilter)
      .filter(
        (member) =>
          !needle ||
          member.fullName.toLocaleLowerCase().includes(needle) ||
          (member.email ?? '').toLocaleLowerCase().includes(needle) ||
          (digits !== '' && member.phone.replace(/\s/gu, '').includes(digits)),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, locale));
    return ROLE_ORDER.map((role) => ({
      role,
      members: visible.filter((member) => member.role === role),
    })).filter((group) => group.members.length > 0);
  }, [atBranch, search, showInactive, roleFilter, locale]);

  const branchLabel = (member: StaffMember) =>
    member.branchId === null
      ? t('staff.allBranches')
      : (branches.find((branch) => branch.id === member.branchId)?.name ?? '—');

  const kebab = (id: string) => () =>
    document.querySelector<HTMLElement>(`[data-kebab="${CSS.escape(id)}"]`);

  const failureToast = useCallback(
    (error: unknown) => {
      const refused = asStaffRefusal(error);
      toast.say(refused?.message ?? t('state.error'), { tone: 'error' });
    },
    [t, toast],
  );

  /**
   * A generated PIN, set and shown once.
   *
   * PINs are unique per tablet roster, so a random one can be somebody else's
   * on the same keypad: the server says `pin-taken` and another is drawn.
   * Nothing is shown until one is accepted, so the PIN on screen is the one
   * that works.
   */
  async function resetPin(member: StaffMember) {
    for (let attempt = 0; attempt < RESET_PIN_ATTEMPTS; attempt += 1) {
      const pin = randomPin();
      try {
        await setPin.mutateAsync({ staffMemberId: member.id, pin });
        setOpen({
          kind: 'once',
          title: t('staff.pin.shownOnceTitle', { name: member.fullName }),
          pin,
          link: null,
          failure: null,
          retry: null,
          toast: null,
          returnTo: `[data-kebab="${member.id}"]`,
        });
        return;
      } catch (error) {
        if (!(error instanceof StaffPinTakenError)) {
          failureToast(error);
          return;
        }
      } finally {
        // The mutation keeps its variables, which hold the PIN.
        setPin.reset();
      }
    }
    toast.say(t('state.error'), { tone: 'error' });
  }

  function reactivate(member: StaffMember) {
    updateStaff.mutate(
      { staffMemberId: member.id, patch: { isActive: true } },
      {
        onSuccess: () => toast.say(t('staff.toast.reactivated', { name: member.fullName })),
        onError: failureToast,
      },
    );
  }

  function act(member: StaffMember, action: StaffAction) {
    setRefusal(null);
    switch (action) {
      case 'unlock':
        // The most time-critical control on the screen: a waiter locked out
        // mid-rush cannot wait out a timer.
        if (!branchId) return;
        clearLockout.mutate(
          { branchId, staffMemberId: member.id },
          {
            onSuccess: () => toast.say(t('staff.toast.unlocked', { name: member.fullName })),
            onError: failureToast,
          },
        );
        return;
      case 'resetPin':
        void resetPin(member);
        return;
      case 'edit':
        setOpen({ kind: 'edit', member });
        return;
      case 'shift':
        setOpen({ kind: 'shift', member });
        return;
      case 'changeOwnPin':
        setOpen({ kind: 'ownPin', member });
        return;
      case 'issueSignIn':
      case 'sendNewLink':
        setOpen({ kind: 'issue', member, email: member.email ?? '', failure: null });
        return;
      case 'deactivate':
        setOpen({ kind: 'deactivate', member });
        return;
      case 'reactivate':
        // Deactivate, never delete — the API offers no delete. Somebody who
        // left in March and returns in June is a reactivation.
        reactivate(member);
        return;
    }
  }

  const menuIcon: Readonly<Record<StaffAction, ReactNode>> = {
    unlock: <PadlockIcon />,
    resetPin: <LockIcon />,
    edit: <UserIcon />,
    shift: <ClockIcon />,
    issueSignIn: <SendIcon />,
    sendNewLink: <SendIcon />,
    deactivate: <PauseIcon />,
    reactivate: <RestoreIcon />,
    changeOwnPin: <LockIcon />,
  };

  function afterHire(hired: Hired) {
    setOpen({
      kind: 'once',
      title: t('staff.once.added', { name: hired.member.fullName }),
      pin: hired.pin,
      link: hired.link,
      failure: hired.linkFailure?.text ?? null,
      retry: hired.linkFailure ? { member: hired.member, email: hired.linkFailure.email } : null,
      toast: hired.link ? t('venuePage.once.savedLink') : t('venuePage.once.added'),
      returnTo: '[data-add]',
    });
  }

  if (!venueId) {
    return (
      <div className="yc-page">
        <PageHeader title={t('nav.staff')} />
        <p className="yc-card yc-empty-line">{t('staff.noVenue')}</p>
      </div>
    );
  }

  const canAdd = assignableRoles(actorRole).length > 0;
  const ownPin = self && canChangeOwnPin(self, actor) ? self : null;
  const onShift = shifts.data ? t('staff.onShift', { count: shifts.data.onShiftToday }) : null;
  const nextDay = t('hours.nextDay');

  const shiftText = (line: ShiftLine) => {
    switch (line.kind) {
      case 'none':
        return t('staff.shift.notSet');
      case 'off':
        return t('staff.shift.todayOff');
      case 'today':
        return t('staff.shift.todayAt', { times: line.times });
      case 'later':
        return line.day === 'tomorrow'
          ? t('staff.shift.tomorrowAt', { times: line.times })
          : t('staff.shift.dateAt', {
              date: new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              }).format(new Date(`${line.date}T12:00:00Z`)),
              times: line.times,
            });
    }
  };

  const primaryLabel = (action: 'unlock' | 'issueSignIn' | 'sendNewLink') =>
    action === 'unlock'
      ? t('staff.action.unlock')
      : action === 'issueSignIn'
        ? t('venuePage.staff.giveSignIn')
        : t('venuePage.staff.newLink');

  return (
    <div className="yc-page">
      <PageHeader
        title={t('nav.staff')}
        sub={[here, t('staff.intro'), onShift].filter(Boolean).join(' · ')}
        actions={
          <div className="yc-ph-acts">
            {ownPin ? (
              <button
                type="button"
                className="yc-btn yc-btn-sec"
                data-ownpin=""
                onClick={() => setOpen({ kind: 'ownPin', member: ownPin })}
              >
                {t('staff.action.changeOwnPin')}
              </button>
            ) : null}
            {canAdd ? (
              <button
                type="button"
                className="yc-btn yc-btn-pri"
                data-add=""
                onClick={() => setOpen({ kind: 'add' })}
              >
                <PlusIcon />
                {t('venuePage.staff.add')}
              </button>
            ) : null}
          </div>
        }
      />

      <div className="yc-tools">
        <div className="yc-fld yc-search yc-st-search">
          <label htmlFor="st-q">{t('staff.filter.search')}</label>
          <SearchIcon />
          <input
            id="st-q"
            className="yc-ctl"
            type="search"
            placeholder={t('staff.filter.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
        <div className="yc-fld">
          <label htmlFor="st-role">{t('staff.filter.role')}</label>
          <select
            id="st-role"
            className="yc-ctl"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.currentTarget.value as RoleFilter)}
          >
            <option value="all">{t('staff.filter.all')}</option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </select>
        </div>
        <label className="yc-check-line">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.currentTarget.checked)}
          />
          {t('staff.filter.inactive')}
        </label>
      </div>

      <div className="yc-st-layout">
        <div className="yc-st-groups">
          {staff.isError ? (
            <div className="yc-card yc-ov-pad">
              <QueryFailureNotice error={staff.error} onRetry={() => void staff.refetch()} />
            </div>
          ) : staff.isLoading ? (
            <p className="yc-card yc-empty-line" role="status">
              {t('loading')}
            </p>
          ) : atBranch.length === 0 ? (
            /* The common state during onboarding, so it routes straight into
               hiring somebody rather than saying "no staff" and stopping. */
            <div className="yc-card yc-empty">
              <h2 className="yc-h2">{t('staff.empty.title')}</h2>
              <p className="yc-muted">{t('staff.empty.body')}</p>
              {canAdd ? (
                <button
                  type="button"
                  className="yc-btn yc-btn-pri"
                  onClick={() => setOpen({ kind: 'add' })}
                >
                  {t('staff.empty.action')}
                </button>
              ) : null}
            </div>
          ) : groups.length === 0 ? (
            <div className="yc-card yc-empty">
              <h2 className="yc-h2">{t('staff.empty.noMatch')}</h2>
              <p className="yc-muted">{t('staff.empty.noMatchBody')}</p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.role} className="yc-card" aria-labelledby={`grp-${group.role}`}>
                <div className="yc-card-h">
                  <div>
                    <h2 className="yc-h2" id={`grp-${group.role}`}>
                      {labels.group(group.role)}{' '}
                      <span className="yc-st-count">{group.members.length}</span>
                    </h2>
                    <p className="yc-cap">{labels.roleInfo(group.role)}</p>
                  </div>
                </div>
                <ul className="yc-people">
                  {group.members.map((member) => {
                    const actions = rowActionsFor(member, actor, { canUnlock: branchId !== null });
                    const status = staffStatusOf(member);
                    const line = shiftLineOf(member.id, member.isActive, shifts.data, nextDay);
                    const items: RowMenuItem[] = actions.menu.map((action) => ({
                      key: action,
                      label: labels.action(action, member),
                      icon: menuIcon[action],
                      ...(action === 'deactivate' ? { danger: true } : {}),
                      onSelect: () => act(member, action),
                    }));
                    return (
                      <li
                        key={member.id}
                        className={member.isActive ? 'yc-st-row' : 'yc-st-row is-off'}
                      >
                        <div className="yc-person">
                          <span className="yc-av" aria-hidden="true">
                            {initialsOf(member.fullName)}
                          </span>
                          <div className="yc-st-who">
                            <div className="yc-pn">
                              {member.fullName}
                              {actions.isSelf ? (
                                <span className="yc-you">{t('staff.card.you')}</span>
                              ) : null}
                            </div>
                            <div className="yc-pe">{member.email ?? member.phone}</div>
                          </div>
                        </div>
                        <span className="yc-st-branch">{branchLabel(member)}</span>
                        <span
                          className={
                            line?.kind === 'today' ? 'yc-st-shift' : 'yc-st-shift is-quiet'
                          }
                        >
                          {line ? (
                            <>
                              <i className={`yc-st-dot is-${line.kind}`} aria-hidden="true" />
                              {shiftText(line)}
                            </>
                          ) : null}
                        </span>
                        <span className="yc-st-status">
                          <span className={PILL[status]}>
                            <span className="yc-dot" aria-hidden="true" />
                            {labels.status(status)}
                          </span>
                        </span>
                        <div className="yc-st-acts">
                          {actions.locked ? (
                            <span className="yc-above">
                              <LockIcon />
                              {t('staff.action.notYours')}
                            </span>
                          ) : null}
                          {actions.primary ? (
                            <button
                              type="button"
                              className="yc-btn yc-btn-sec yc-btn-sm"
                              data-prim={member.id}
                              aria-label={t('venuePage.staff.actionFor', {
                                action: primaryLabel(actions.primary),
                                name: member.fullName,
                              })}
                              onClick={() => act(member, actions.primary!)}
                            >
                              {primaryLabel(actions.primary)}
                            </button>
                          ) : null}
                          {items.length > 0 ? (
                            <RowMenu
                              id={member.id}
                              label={t('staff.action.moreFor', { name: member.fullName })}
                              items={items}
                              open={menuFor === member.id}
                              onOpenChange={(next) => setMenuFor(next ? member.id : null)}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <aside className="yc-st-side">
          {/* Keyed by branch: a code or an open revoke confirmation belongs to
              the branch it was made for, not the one switched to. */}
          {branchId ? (
            <DevicesPanel
              key={branchId}
              branchId={branchId}
              branchName={here}
              timeZoneId={timeZoneId}
              locale={locale}
            />
          ) : null}
        </aside>
      </div>

      {open?.kind === 'add' ? (
        <AddStaffWizard
          venueId={venueId}
          branches={branches}
          actorRole={actorRole}
          fixedBranchId={canChooseBranch(actorRole) ? null : (actorBranchId ?? branchId)}
          initialBranchId={branchId}
          onClose={() => setOpen(null)}
          onHired={afterHire}
        />
      ) : null}

      {open?.kind === 'edit' ? (
        <EditStaffDialog
          key={open.member.id}
          member={open.member}
          actorRole={actorRole}
          fixedBranchId={canChooseBranch(actorRole) ? null : (actorBranchId ?? branchId)}
          branches={branches}
          refusal={refusal}
          isSaving={updateStaff.isPending}
          returnFocusTo={kebab(open.member.id)}
          onCancel={() => {
            setRefusal(null);
            setOpen(null);
          }}
          onUpdate={async (patch) => {
            setRefusal(null);
            try {
              await updateStaff.mutateAsync({ staffMemberId: open.member.id, patch });
              setOpen(null);
              toast.say(t('staff.toast.saved', { name: patch.fullName ?? open.member.fullName }));
            } catch (error) {
              const refused = asStaffRefusal(error);
              if (refused) setRefusal(refused);
              else failureToast(error);
            }
          }}
        />
      ) : null}

      {open?.kind === 'deactivate' ? (
        <DeactivateDialog
          member={open.member}
          isSaving={updateStaff.isPending}
          returnFocusTo={kebab(open.member.id)}
          onCancel={() => setOpen(null)}
          onConfirm={() => {
            const member = open.member;
            updateStaff.mutate(
              { staffMemberId: member.id, patch: { isActive: false } },
              {
                onSuccess: () => {
                  setOpen(null);
                  toast.say(t('staff.toast.deactivated', { name: member.fullName }), {
                    undo: () => reactivate(member),
                    focusUndo: true,
                    fallbackFocus: () => document.querySelector<HTMLElement>('[data-add]'),
                  });
                },
                onError: (error) => {
                  setOpen(null);
                  failureToast(error);
                },
              },
            );
          }}
        />
      ) : null}

      {open?.kind === 'ownPin' ? (
        <ChangeOwnPinDialog
          onSubmit={async (pin) => {
            try {
              await setPin.mutateAsync({ staffMemberId: open.member.id, pin });
            } finally {
              // Drops the mutation's copy of the typed PIN.
              setPin.reset();
            }
          }}
          onChanged={() => {
            setOpen(null);
            toast.say(t('staff.ownPin.changedToast'));
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open?.kind === 'shift' && branchId ? (
        <ShiftDialog
          member={open.member}
          branchId={branchId}
          branchName={here}
          serviceDate={shifts.data?.serviceDate ?? null}
          timeZoneId={timeZoneId}
          returnFocusTo={kebab(open.member.id)}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open?.kind === 'issue' ? (
        <IssueSignInDialog
          venueId={venueId}
          member={open.member}
          initialEmail={open.email}
          initialFailure={open.failure}
          onClose={() => setOpen(null)}
          onIssued={(link) =>
            setOpen({
              kind: 'once',
              title: t('venuePage.once.title', { name: open.member.fullName }),
              pin: null,
              link,
              failure: null,
              retry: null,
              toast: t('venuePage.once.savedLink'),
              returnTo: `[data-kebab="${open.member.id}"]`,
            })
          }
        />
      ) : null}

      {/* Dropped from state entirely on close: there is nowhere else a PIN or
          a link lives. */}
      {open?.kind === 'once' ? (
        <OnceLinkDialog
          title={open.title}
          link={open.link}
          pin={open.pin}
          body={t('venuePage.once.body')}
          pinHelp={t('venuePage.once.pinHelp')}
          linkHelp={(when) => t('venuePage.once.help', { when })}
          // A PIN alone has nothing to copy: it is read out, then "Written down".
          {...(open.link
            ? {}
            : { pinLabel: t('staff.once.pinLabel'), doneLabel: t('staff.pin.written') })}
          failure={open.failure}
          retryClosesPin
          onRetry={
            open.retry
              ? () => {
                  const retry = open.retry;
                  if (!retry) return;
                  setOpen({
                    kind: 'issue',
                    member: retry.member,
                    email: retry.email,
                    failure: open.failure,
                  });
                }
              : null
          }
          timeZoneId={timeZoneId}
          onDone={() => {
            const said = open.toast;
            const returnTo = open.returnTo;
            setOpen(null);
            document.querySelector<HTMLElement>(returnTo)?.focus();
            if (said) toast.say(said);
          }}
        />
      ) : null}
    </div>
  );
}
