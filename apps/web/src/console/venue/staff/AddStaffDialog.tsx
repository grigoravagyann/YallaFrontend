import {
  assignableRoles,
  canChooseBranch,
  isAdminRole,
  outranks,
  type ConsoleBranch,
  type CreateStaffInput,
  type StaffPermissionError,
  type StaffRole,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import { BranchField, RoleChoices } from './StaffFields';
import { ALL_BRANCHES, EMAIL_MAX_LENGTH, EMAIL_SHAPE, type SignInRequest } from './StaffForm';

type StepId = 'person' | 'roleBranch' | 'pin' | 'signIn';

export interface AddStaffDialogProps {
  readonly actorRole: StaffRole | 'platformAdmin';
  /** The branch a manager hires for, and an owner's preselected branch. */
  readonly fixedBranchId: string | null;
  readonly branches: readonly ConsoleBranch[];
  /**
   * `signIn` is set exactly when the role uses the admin panel. Resolves to
   * the refusal when the server said no, so the dialog can go back to the
   * step that holds the field it named; to null otherwise.
   */
  readonly onCreate: (
    input: CreateStaffInput,
    signIn: SignInRequest | null,
  ) => Promise<StaffPermissionError | null>;
  readonly onCancel: () => void;
  readonly refusal: StaffPermissionError | null;
  readonly isSaving: boolean;
}

/** Which step holds the field a refusal named. */
const STEP_OF_FIELD: Record<string, StepId> = {
  fullName: 'person',
  phone: 'person',
  role: 'roleBranch',
  branchId: 'roleBranch',
  pin: 'pin',
  email: 'signIn',
};

/**
 * "Add someone", as four short steps in a dialog: who, what they do and
 * where, their tablet PIN, and — only for somebody who signs in to this
 * console — the address their link goes to.
 *
 * It replaces the inline form on this screen, which said "a form, not a
 * wizard" because adding a waiter should take twenty seconds. That still
 * holds as far as it can: a waiter or a cook gets three steps, not four, Enter
 * is Next on every step, and each step asks only for what it names.
 *
 * Every rule the form had is kept, because it is the same act:
 *
 * - The roles offered come from the actor's own role; the default is the
 *   first one below them, never their own.
 * - A manager is told their branch; an owner picks one, "All branches" first.
 * - The PIN is exactly four digits, checked before the step moves on.
 * - The address is asked only for somebody the actor outranks who signs in
 *   (an owner hiring a co-owner gets no fourth step: the server refuses a
 *   sign-in for a peer), and it travels beside the create input, never in it.
 *
 * Every value lives here rather than in the step on screen, so Back loses
 * nothing — including an address typed before the role changed to waiter
 * and back.
 */
export function AddStaffDialog({
  actorRole,
  fixedBranchId,
  branches,
  onCreate,
  onCancel,
  refusal,
  isSaving,
}: AddStaffDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const statusId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const roles = assignableRoles(actorRole);
  const chooseBranch = canChooseBranch(actorRole);
  const defaultRole = roles.find((option) => option !== actorRole) ?? roles[0] ?? 'waiter';

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>(defaultRole);
  const [branchChoice, setBranchChoice] = useState<string>(fixedBranchId ?? ALL_BRANCHES);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const needsSignIn = isAdminRole(role) && outranks(actorRole, role);
  const steps: readonly StepId[] = needsSignIn
    ? ['person', 'roleBranch', 'pin', 'signIn']
    : ['person', 'roleBranch', 'pin'];
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index]!;
  const isLast = index === steps.length - 1;

  const stepLabel = (id: StepId) => {
    switch (id) {
      case 'person':
        return t('staff.wizard.step.person');
      case 'roleBranch':
        return t('staff.wizard.step.roleBranch');
      case 'pin':
        return t('staff.wizard.step.pin');
      case 'signIn':
        return t('staff.wizard.step.signIn');
    }
  };

  const cancel = useCallback(() => onCancel(), [onCancel]);
  useDialogFocus(dialogRef, { onEscape: cancel, escapeEnabled: !isSaving });

  // Each step starts in its first control: the checked role on step 2, the
  // field otherwise. A refusal that sends the dialog back lands here too.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const target =
      body.querySelector<HTMLElement>('input[type="radio"]:checked') ??
      body.querySelector<HTMLElement>('input, select');
    target?.focus();
  }, [step]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    // Four digits, checked here rather than at the end: the message is the
    // same either way, and it belongs on the step that asked.
    if (step === 'pin') {
      if (!/^\d{4}$/u.test(pin)) {
        setPinError(t('staff.pin.fourDigits'));
        return;
      }
      setPinError(null);
    }

    const address = email.trim();
    if (step === 'signIn') {
      if (!EMAIL_SHAPE.test(address)) {
        setEmailError(t('staff.signIn.emailRequired'));
        return;
      }
      if (address.length > EMAIL_MAX_LENGTH) {
        setEmailError(t('staff.signIn.emailTooLong'));
        return;
      }
      setEmailError(null);
    }

    if (!isLast) {
      setStepIndex(index + 1);
      return;
    }

    const branchId = branchChoice === ALL_BRANCHES ? null : branchChoice;
    const refused = await onCreate(
      { fullName, phone, role, pin, branchId: chooseBranch ? branchId : fixedBranchId },
      needsSignIn ? { email: address } : null,
    );
    // Back to the step that holds what the server named, where the message
    // is and the next action is obvious.
    const back = refused?.field ? STEP_OF_FIELD[refused.field] : undefined;
    if (back) setStepIndex(Math.max(0, steps.indexOf(back)));
  }

  /** A refusal the server aimed at a specific control. */
  const refusalFor = (field: string) => (refusal?.field === field ? refusal.message : null);

  return (
    <div className="scrim" role="presentation">
      <div
        ref={dialogRef}
        className="card wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusId}
      >
        <header className="wizard-head">
          <h2 id={titleId}>{t('staff.add')}</h2>
          {/* Not clickable: jumping ahead would skip a step's own checks. */}
          <ol className="wizard-progress" aria-label={t('staff.wizard.progress')}>
            {steps.map((id, at) => (
              <li
                key={id}
                className={`wizard-progress-step${at < index ? ' is-done' : ''}`}
                aria-current={at === index ? 'step' : undefined}
              >
                <span className="visually-hidden">
                  {at < index
                    ? t('staff.wizard.stepDone', { label: stepLabel(id) })
                    : at === index
                      ? t('staff.wizard.stepCurrent', { label: stepLabel(id) })
                      : stepLabel(id)}
                </span>
              </li>
            ))}
          </ol>
          <p id={statusId} className="muted small wizard-progress-label" role="status">
            {t('staff.wizard.stepOf', {
              current: index + 1,
              total: steps.length,
              label: stepLabel(step),
            })}
          </p>
        </header>

        <form
          className="wizard-form"
          aria-labelledby={titleId}
          onSubmit={(event) => void submit(event)}
        >
          <div ref={bodyRef} className="wizard-body">
            {step === 'person' ? (
              <>
                <h3 className="wizard-step-title">{t('staff.wizard.personTitle')}</h3>
                <label className="labelled">
                  <span>{t('staff.field.name')}</span>
                  <input
                    className="field"
                    value={fullName}
                    required
                    autoComplete="off"
                    onChange={(event) => setFullName(event.currentTarget.value)}
                  />
                </label>
                <label className="labelled">
                  <span>{t('staff.field.phone')}</span>
                  <input
                    className="field"
                    type="tel"
                    value={phone}
                    required
                    autoComplete="off"
                    onChange={(event) => setPhone(event.currentTarget.value)}
                  />
                </label>
              </>
            ) : null}

            {step === 'roleBranch' ? (
              <>
                <RoleChoices
                  roles={roles}
                  value={role}
                  onChange={setRole}
                  error={refusalFor('role')}
                />
                {/* Why the fourth step went away: an owner hires a partner
                    PIN-only, and the Yalla team issues their sign-in. */}
                {role === 'owner' && !outranks(actorRole, 'owner') ? (
                  <p className="muted small">{t('staff.wizard.coOwnerNote')}</p>
                ) : null}
                <BranchField
                  chooseBranch={chooseBranch}
                  branches={branches}
                  value={branchChoice}
                  onChange={setBranchChoice}
                  fixedBranchId={fixedBranchId}
                  error={refusalFor('branchId')}
                />
              </>
            ) : null}

            {step === 'pin' ? (
              <div className="labelled">
                <label htmlFor="staff-pin">{t('staff.field.pin')}</label>
                <input
                  id="staff-pin"
                  className="field"
                  /*
                   * `inputMode` rather than `type="password"`: the PIN is about
                   * to be read aloud to the person standing there. No `name`
                   * and `autoComplete="off"`, so nothing offers to remember it.
                   * No `pattern`: the four-digit rule is checked on Next with
                   * the app's own sentence, not the browser's, in its language.
                   */
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  required
                  autoComplete="off"
                  {...(pinError ? { 'aria-describedby': 'staff-pin-error' } : {})}
                  onChange={(event) => setPin(event.currentTarget.value.replace(/\D/gu, ''))}
                />
                <span className="muted small">{t('staff.pin.help')}</span>
                <span className="muted small">{t('staff.wizard.pinShownAgain')}</span>
                {pinError ? (
                  <span id="staff-pin-error" className="field-error" role="alert">
                    {pinError}
                  </span>
                ) : null}
              </div>
            ) : null}

            {step === 'signIn' ? (
              <div className="labelled">
                <label htmlFor="staff-email">{t('staff.field.email')}</label>
                <input
                  id="staff-email"
                  className="field"
                  // As on the old form: the shape is checked with the app's own
                  // sentence; the browser only enforces "not empty".
                  type="text"
                  inputMode="email"
                  value={email}
                  required
                  maxLength={EMAIL_MAX_LENGTH}
                  autoComplete="email"
                  {...(emailError ? { 'aria-describedby': 'staff-email-error' } : {})}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
                <span className="muted small">{t('staff.field.emailHelp')}</span>
                <span className="muted small">{t('staff.wizard.signInAfter')}</span>
                {emailError ? (
                  <span id="staff-email-error" className="field-error" role="alert">
                    {emailError}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Only a refusal that named no field lands here. */}
            {refusal && !refusal.field ? (
              <p className="field-error" role="alert">
                {refusal.message}
              </p>
            ) : null}
          </div>

          <footer className="wizard-foot">
            <button
              type="button"
              className="button button-ghost"
              disabled={isSaving}
              onClick={onCancel}
            >
              {t('common:action.cancel')}
            </button>
            <div className="wizard-foot-end">
              {index > 0 ? (
                <button
                  type="button"
                  className="button"
                  disabled={isSaving}
                  onClick={() => setStepIndex(index - 1)}
                >
                  {t('staff.wizard.back')}
                </button>
              ) : null}
              <button type="submit" className="button button-primary" disabled={isSaving}>
                {isSaving ? t('saving') : isLast ? t('staff.form.create') : t('staff.wizard.next')}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
