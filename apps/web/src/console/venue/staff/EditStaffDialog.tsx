import {
  assignableRoles,
  branchBindingFor,
  canChooseBranch,
  type ConsoleBranch,
  type StaffMember,
  type StaffRole,
  type UpdateStaffInput,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';

/**
 * The person's staff id, read-only, with a Copy button.
 *
 * Here and not on the card: the id is needed rarely — a tablet that cannot
 * load its roster — and the card is for the one thing that needs doing. The
 * edit dialog is already "the whole record at once", so the id belongs with
 * it. Copy and its status line are the sign-in link dialog's: the clipboard,
 * or select the text and say so where the clipboard is out of reach.
 */
function StaffIdRow({ staffMemberId }: { readonly staffMemberId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const valueRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'select'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(staffMemberId);
      setCopied('copied');
    } catch {
      const node = valueRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopied('select');
    }
  }

  return (
    <div className="labelled">
      <span>{t('staff.staffId.label')}</span>
      <code ref={valueRef} className="sign-in-link-value">
        {staffMemberId}
      </code>
      <div className="actions">
        <button type="button" className="button button-small" onClick={() => void copy()}>
          {t('staff.staffId.copy')}
        </button>
        {copied !== 'idle' ? (
          <span className="muted small" role="status">
            {copied === 'copied' ? t('staff.signIn.copied') : t('staff.signIn.selectAndCopy')}
          </span>
        ) : null}
      </div>
      <span className="muted small">{t('staff.staffId.help')}</span>
    </div>
  );
}
import { useDialogFocus } from '../../../components/useDialogFocus';
import { BranchField, RoleChoices, branchChoiceFor, branchIdFor } from './StaffFields';
import { ALL_BRANCHES } from './StaffForm';
import { refusalIsFormLevel, refusalText, type StaffRefusal } from './staffRefusal';

export interface EditStaffDialogProps {
  readonly member: StaffMember;
  readonly actorRole: StaffRole | 'platformAdmin';
  readonly fixedBranchId: string | null;
  readonly branches: readonly ConsoleBranch[];
  readonly onUpdate: (patch: UpdateStaffInput) => Promise<void>;
  readonly onCancel: () => void;
  readonly refusal: StaffRefusal | null;
  readonly isSaving: boolean;
}

/**
 * Editing somebody, as one page in the same dialog shell as "Add someone" —
 * not the steps again.
 *
 * An edit is a correction to one field, usually a phone number, and seeing the
 * whole record at once is the check. There is no PIN and no address here:
 * both have their own actions on the card (New PIN, Send new link), because
 * changing either replaces a working credential and deserves its own
 * confirmation rather than a field among five.
 *
 * Mounted per person (keyed by id), so editing somebody never starts from the
 * last person's values.
 */
export function EditStaffDialog({
  member,
  actorRole,
  fixedBranchId,
  branches,
  onUpdate,
  onCancel,
  refusal,
  isSaving,
}: EditStaffDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const roles = assignableRoles(actorRole);
  const chooseBranch = canChooseBranch(actorRole);

  const [fullName, setFullName] = useState(member.fullName);
  const [phone, setPhone] = useState(member.phone);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [branchChoice, setBranchChoice] = useState<string>(member.branchId ?? ALL_BRANCHES);
  // A real branch whenever the role needs one: promoting a waiter who works
  // everywhere to branch manager puts them at the branch on screen.
  const shownBranch = branchChoiceFor(role, branchChoice, fixedBranchId, branches);
  const binding = branchBindingFor(role);

  const cancel = useCallback(() => onCancel(), [onCancel]);
  useDialogFocus(dialogRef, { onEscape: cancel, escapeEnabled: !isSaving });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const branchId = branchIdFor(role, shownBranch);
    await onUpdate({
      fullName,
      phone,
      role,
      // Always sent when the actor may choose, because `null` is a real
      // assignment and the flag is what tells it from "leave it alone". The
      // role and the branch travel together, so promoting a branch manager to
      // general manager clears the branch in the same save, as the server
      // checks the pair.
      ...(chooseBranch ? { setBranch: true, branchId } : {}),
    });
  }

  const refusalFor = (field: string) => refusalText(refusal, field);

  return (
    <div className="scrim" role="presentation">
      <div
        ref={dialogRef}
        className="card wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wizard-head">
          <h2 id={titleId}>{t('staff.form.editTitle', { name: member.fullName })}</h2>
        </header>

        <form
          className="wizard-form"
          aria-labelledby={titleId}
          onSubmit={(event) => void submit(event)}
        >
          <div className="wizard-body">
            <h3 className="wizard-step-title">{t('staff.wizard.step.person')}</h3>
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

            <h3 className="wizard-step-title">{t('staff.wizard.step.roleBranch')}</h3>
            <RoleChoices roles={roles} value={role} onChange={setRole} error={refusalFor('role')} />
            <BranchField
              chooseBranch={chooseBranch}
              binding={binding}
              branches={branches}
              value={shownBranch}
              onChange={setBranchChoice}
              fixedBranchId={fixedBranchId}
              error={refusalFor('branchId')}
            />

            <StaffIdRow staffMemberId={member.id} />

            {/* Anything without a control in this dialog, at the foot. */}
            {refusal && refusalIsFormLevel(refusal, ['role', 'branchId']) ? (
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
            <button type="submit" className="button button-primary" disabled={isSaving}>
              {isSaving ? t('saving') : t('common:action.save')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
