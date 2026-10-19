import {
  assignableRoles,
  canChooseBranch,
  isAdminRole,
  outranks,
  type ConsoleBranch,
  type StaffMember,
  type StaffRole,
  type StaffSignInLink,
} from '@yalla/api';
import { useCreateStaff, useIssueStaffSignIn } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';
import { Dialog } from '../../ui/Dialog';
import { Required, usePendingFocus } from '../../platform/venue/venueFields';
import { issueFailureText } from './signInIssue';
import { asStaffRefusal, refusalIsFormLevel, refusalText } from './staffRefusal';
import { useStaffLabels } from './staffLabels';

/** The artboard's check: something, an @, something, a dot, something. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Mirrors `FieldLengths.Email` on the server: the most an address may be. On
 * the input as `maxLength`, and checked on submit too, because `maxLength`
 * binds typing and not a value an autofill set.
 */
export const EMAIL_MAX_LENGTH = 320;

type Step = 1 | 2 | 3 | 4;

/** Who was added, and what to show once. */
export interface Hired {
  readonly member: StaffMember;
  readonly pin: string;
  /** The sign-in link, when one was asked for and made. */
  readonly link: StaffSignInLink | null;
  /** Asked for, refused: the server's sentence, and the address that was tried. */
  readonly linkFailure: { readonly text: string; readonly email: string } | null;
}

export interface AddStaffWizardProps {
  readonly venueId: string;
  readonly branches: readonly ConsoleBranch[];
  /**
   * Who is adding: the roles offered are theirs to give (`assignableRoles`).
   * The platform admin by default — the venue page's Staff tab.
   */
  readonly actorRole?: StaffRole | 'platformAdmin';
  /**
   * The branch a branch manager adds people at. They hold one, so it is said
   * rather than offered (`canChooseBranch`).
   */
  readonly fixedBranchId?: string | null;
  /** The branch the picker opens on: the one on screen. */
  readonly initialBranchId?: string | null;
  readonly onClose: () => void;
  readonly onHired: (hired: Hired) => void;
}

/** Owner and general manager work at every branch (the artboards' rule). */
const venueWide = (role: StaffRole) => role === 'owner' || role === 'generalManager';

/**
 * Add somebody to the venue in four steps (Staff and VenueDetail artboards):
 * the person, their role and branch, their tablet PIN, and — for an owner or a
 * manager — an email for the console.
 *
 * One wizard for both consoles. The rules are `@yalla/api`'s: the roles
 * offered are the actor's to give (`assignableRoles`), a branch manager adds
 * at their own branch only, and a console sign-in is asked for only where the
 * actor outranks the role (`outranks`) — an owner adding a co-owner is told
 * the Yalla team issues it, because the server refuses a sign-in for a peer.
 * The person is created without an email — the server refuses one without a
 * password — and the sign-in is issued right after, so the link and the PIN
 * are shown once, together. If the link is refused, the person exists all
 * the same: their PIN is shown, with the reason and a way to try again.
 *
 * A refusal from the server goes under the field it names, on the step that
 * has it: a PIN somebody on the same tablet uses goes back to the PIN.
 */
export function AddStaffWizard({
  venueId,
  branches,
  actorRole = 'platformAdmin',
  fixedBranchId = null,
  initialBranchId = null,
  onClose,
  onHired,
}: AddStaffWizardProps) {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();
  const create = useCreateStaff(venueId);
  const issue = useIssueStaffSignIn(venueId);
  const focusLater = usePendingFocus();

  const roles = assignableRoles(actorRole);
  const chooseBranch = canChooseBranch(actorRole);

  const [step, setStep] = useState<Step>(1);
  const [tried, setTried] = useState<ReadonlySet<Step>>(new Set());
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>(roles.includes('waiter') ? 'waiter' : roles[0]!);
  const [branchId, setBranchId] = useState(
    fixedBranchId ??
      branches.find((branch) => branch.id === initialBranchId)?.id ??
      branches[0]?.id ??
      '',
  );
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  /** The server's refusal, by the field it named; `form` for one it did not. */
  const [refused, setRefused] = useState<{ field: string; text: string } | null>(null);

  const signsIn = isAdminRole(role) && outranks(actorRole, role);
  const trimmedEmail = email.trim();
  const errors = {
    name: name.trim() ? null : t('venuePage.wizard.error.name'),
    phone: phone.trim() ? null : t('venuePage.wizard.error.phone'),
    pin: /^\d{4}$/u.test(pin) ? null : t('venuePage.wizard.error.pin'),
    email: !signsIn
      ? null
      : trimmedEmail.length > EMAIL_MAX_LENGTH
        ? t('staff.signIn.emailTooLong')
        : trimmedEmail && !EMAIL_SHAPE.test(trimmedEmail)
          ? t('venuePage.wizard.error.email')
          : null,
  };
  const serverError = (field: string) => (refused?.field === field ? refused.text : null);
  const shown = (field: keyof typeof errors, onStep: Step) =>
    (tried.has(onStep) ? errors[field] : null) ??
    serverError(field === 'name' ? 'fullName' : field);

  const roleLabel = (value: StaffRole) => t(`role.${value}`);
  const fixedBranchName = branches.find((branch) => branch.id === fixedBranchId)?.name ?? '';

  function goTo(next: Step, focus: string) {
    setStep(next);
    focusLater(focus);
  }

  async function finish() {
    setBusy(true);
    setRefused(null);
    const staffBranch = venueWide(role) ? null : chooseBranch ? branchId || null : fixedBranchId;
    let member: StaffMember;
    try {
      member = await create.mutateAsync({
        fullName: name.trim(),
        phone: phone.trim(),
        role,
        pin,
        branchId: staffBranch,
      });
    } catch (caught) {
      setBusy(false);
      const refusal = asStaffRefusal(caught);
      if (!refusal) {
        setRefused({ field: 'form', text: t('venue.failed') });
        return;
      }
      const field = refusal.field ?? '';
      const text = refusalText(refusal, field) ?? refusal.message ?? t('venue.failed');
      if (refusalIsFormLevel(refusal, ['fullName', 'phone', 'branchId', 'pin'])) {
        setRefused({ field: 'form', text });
        return;
      }
      setRefused({ field, text });
      if (field === 'pin') goTo(3, 'sw-pin');
      else if (field === 'branchId') goTo(2, chooseBranch ? 'sw-branch' : `sw-role-${role}`);
      else goTo(1, field === 'phone' ? 'sw-phone' : 'sw-name');
      return;
    }

    const address = signsIn ? trimmedEmail : '';
    if (!address) {
      onHired({ member, pin, link: null, linkFailure: null });
      return;
    }
    try {
      const link = await issue.mutateAsync({ staffMemberId: member.id, email: address });
      onHired({ member, pin, link, linkFailure: null });
    } catch (caught) {
      onHired({
        member,
        pin,
        link: null,
        linkFailure: {
          email: address,
          text: issueFailureText(caught, {
            offline: t('state.offline'),
            generic: t('state.error'),
            badEmail: t('venuePage.issue.error'),
            tooManyRequests: t('staff.signIn.tooManyRequests'),
          }),
        },
      });
    } finally {
      // The hook keeps the answer as its own `data`: a second copy of the
      // link. The once dialog's copy is the only one wanted.
      issue.reset();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried((previous) => new Set(previous).add(step));
    if (step === 1 && (errors.name || errors.phone)) {
      focusLater(errors.name ? 'sw-name' : 'sw-phone');
      return;
    }
    if (step === 3 && errors.pin) {
      focusLater('sw-pin');
      return;
    }
    if (step === 4 && errors.email) {
      focusLater('sw-email');
      return;
    }
    if (step < 4) {
      goTo(
        (step + 1) as Step,
        step === 1 ? `sw-role-${role}` : step === 2 ? 'sw-pin' : signsIn ? 'sw-email' : 'sw-next',
      );
      return;
    }
    void finish();
  }

  function back() {
    if (busy) return;
    if (step === 1) {
      onClose();
      return;
    }
    goTo((step - 1) as Step, step === 2 ? 'sw-name' : step === 3 ? `sw-role-${role}` : 'sw-pin');
  }

  function randomPin() {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    setPin(String(1000 + ((value[0] ?? 0) % 9000)));
    setRefused((current) => (current?.field === 'pin' ? null : current));
    focusLater('sw-pin');
  }

  const describe = (...ids: (string | false | null)[]) =>
    ids.filter(Boolean).join(' ') || undefined;
  const nameError = shown('name', 1);
  const phoneError = shown('phone', 1);
  const pinError = shown('pin', 3);
  const emailError = shown('email', 4);
  const branchError = serverError('branchId');
  const stepLabels = [
    t('venuePage.wizard.stepPerson'),
    t('venuePage.wizard.stepRole'),
    t('venuePage.wizard.stepPin'),
    t('venuePage.wizard.stepSignIn'),
  ];
  const branchName = venueWide(role)
    ? t('venuePage.wizard.allBranches')
    : chooseBranch
      ? (branches.find((branch) => branch.id === branchId)?.name ?? '')
      : fixedBranchName;

  return (
    <Dialog
      wide
      title={t('venuePage.wizard.title')}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
    >
      <form className="yc-form" noValidate onSubmit={submit}>
        <span className="yc-stepn">{t('venuePage.wizard.step', { step })}</span>
        <ol className="yc-steps" aria-label={t('venuePage.wizard.steps')}>
          {stepLabels.map((label, index) => {
            const n = (index + 1) as Step;
            return (
              <li
                key={label}
                className={n === step ? 'is-on' : n < step ? 'is-done' : undefined}
                {...(n === step ? { 'aria-current': 'step' } : {})}
              >
                {label}
              </li>
            );
          })}
        </ol>

        {step === 1 ? (
          <div className="yc-row2">
            <div className="yc-fld">
              <label htmlFor="sw-name">
                {t('venuePage.wizard.name')}
                <Required />
              </label>
              <input
                id="sw-name"
                className="yc-ctl"
                data-autofocus=""
                autoComplete="off"
                aria-required="true"
                aria-invalid={Boolean(nameError)}
                aria-describedby={describe(nameError && 'sw-name-err')}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {nameError ? (
                <span className="yc-err" id="sw-name-err">
                  {nameError}
                </span>
              ) : null}
            </div>
            <div className="yc-fld">
              <label htmlFor="sw-phone">
                {t('venuePage.wizard.phone')}
                <Required />
              </label>
              <input
                id="sw-phone"
                className="yc-ctl"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="+374"
                aria-required="true"
                aria-invalid={Boolean(phoneError)}
                aria-describedby={describe(phoneError && 'sw-phone-err')}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              {phoneError ? (
                <span className="yc-err" id="sw-phone-err">
                  {phoneError}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <fieldset className="yc-roles">
              <legend>
                {t('venuePage.wizard.roleLegend')}{' '}
                <span className="yc-help">{t('venuePage.wizard.roleHelp')}</span>
              </legend>
              {roles.map((value) => (
                <label key={value} className={value === role ? 'yc-rc is-on' : 'yc-rc'}>
                  <input
                    id={`sw-role-${value}`}
                    type="radio"
                    name="staff-role"
                    value={value}
                    checked={value === role}
                    onChange={() => {
                      setRole(value);
                      setRefused(null);
                    }}
                  />
                  <b>{roleLabel(value)}</b>
                  <span>{labels.roleInfo(value)}</span>
                </label>
              ))}
            </fieldset>
            {venueWide(role) ? (
              <p className="yc-help">
                {role === 'owner'
                  ? t('venuePage.wizard.venueWideOwner')
                  : t('venuePage.wizard.venueWideGm')}
              </p>
            ) : chooseBranch ? (
              <div className="yc-fld">
                <label htmlFor="sw-branch">{t('venuePage.wizard.branch')}</label>
                <select
                  id="sw-branch"
                  className="yc-ctl"
                  aria-invalid={Boolean(branchError)}
                  aria-describedby={describe(branchError && 'sw-branch-err')}
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                {branchError ? (
                  <span className="yc-err" id="sw-branch-err">
                    {branchError}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="yc-fld">
                <span className="yc-lbl">{t('venuePage.wizard.branch')}</span>
                <span className="yc-muted">
                  {t('venuePage.wizard.branchFixed', { branch: fixedBranchName })}
                </span>
                {branchError ? <span className="yc-err">{branchError}</span> : null}
              </div>
            )}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="yc-fld">
              <label htmlFor="sw-pin">
                {t('venuePage.wizard.pin')}
                <Required />
              </label>
              <input
                id="sw-pin"
                className="yc-ctl yc-pin-input"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                aria-required="true"
                aria-invalid={Boolean(pinError)}
                aria-describedby={describe('sw-pin-help', pinError && 'sw-pin-err')}
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/gu, '').slice(0, 4));
                  setRefused((current) => (current?.field === 'pin' ? null : current));
                }}
              />
              <span className="yc-help" id="sw-pin-help">
                {t('venuePage.wizard.pinHelp')}
              </span>
              {pinError ? (
                <span className="yc-err" id="sw-pin-err">
                  {pinError}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="yc-btn yc-btn-ghost yc-btn-sm yc-self-start"
              onClick={randomPin}
            >
              {t('venuePage.wizard.randomPin')}
            </button>
          </>
        ) : null}

        {step === 4 ? (
          <>
            {signsIn ? (
              <>
                <div className="yc-fld">
                  <label htmlFor="sw-email">
                    {t('venuePage.wizard.email')}
                    <span className="yc-optional">{t('venues.add.optional')}</span>
                  </label>
                  <input
                    id="sw-email"
                    className="yc-ctl"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={EMAIL_MAX_LENGTH}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={describe('sw-email-help', emailError && 'sw-email-err')}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <span className="yc-help" id="sw-email-help">
                    {t('venuePage.wizard.emailHelp')}
                  </span>
                  {emailError ? (
                    <span className="yc-err" id="sw-email-err">
                      {emailError}
                    </span>
                  ) : null}
                </div>
                <p className="yc-help">{t('venuePage.wizard.linkNote')}</p>
              </>
            ) : isAdminRole(role) ? (
              // A co-owner: the server refuses a sign-in for a peer.
              <p>{t('staff.wizard.coOwnerNote')}</p>
            ) : (
              <p>{t('venuePage.wizard.tabletOnly', { role: roleLabel(role) })}</p>
            )}
            <dl className="yc-summary">
              <dt>{t('venuePage.wizard.summaryPerson')}</dt>
              <dd>{name.trim()}</dd>
              <dt>{t('venuePage.wizard.summaryRole')}</dt>
              <dd>{roleLabel(role)}</dd>
              <dt>{t('venuePage.wizard.summaryBranch')}</dt>
              <dd>{branchName}</dd>
            </dl>
          </>
        ) : null}

        {refused?.field === 'form' ? (
          <p className="yc-alert" role="alert">
            {refused.text}
          </p>
        ) : null}

        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" onClick={back} disabled={busy}>
            {step === 1 ? t('venuePage.wizard.cancel') : t('venuePage.wizard.back')}
          </button>
          <button id="sw-next" type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
            {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {busy
              ? t('venuePage.wizard.adding')
              : step === 4
                ? t('venuePage.wizard.add')
                : t('venuePage.wizard.next')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
