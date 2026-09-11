import {
  assignableRoles,
  canChooseBranch,
  type ConsoleBranch,
  type StaffMember,
  type StaffPermissionError,
  type StaffRole,
  type UpdateStaffInput,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import { BranchField, RoleChoices } from './StaffFields';
import { ALL_BRANCHES } from './StaffForm';

export interface EditStaffDialogProps {
  readonly member: StaffMember;
  readonly actorRole: StaffRole | 'platformAdmin';
  readonly fixedBranchId: string | null;
  readonly branches: readonly ConsoleBranch[];
  readonly onUpdate: (patch: UpdateStaffInput) => Promise<void>;
  readonly onCancel: () => void;
  readonly refusal: StaffPermissionError | null;
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

  const cancel = useCallback(() => onCancel(), [onCancel]);
  useDialogFocus(dialogRef, { onEscape: cancel, escapeEnabled: !isSaving });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const branchId = branchChoice === ALL_BRANCHES ? null : branchChoice;
    await onUpdate({
      fullName,
      phone,
      role,
      // Always sent when the actor may choose, because `null` is a real
      // assignment and the flag is what tells it from "leave it alone".
      ...(chooseBranch ? { setBranch: true, branchId } : {}),
    });
  }

  const refusalFor = (field: string) => (refusal?.field === field ? refusal.message : null);

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
              branches={branches}
              value={branchChoice}
              onChange={setBranchChoice}
              fixedBranchId={fixedBranchId}
              error={refusalFor('branchId')}
            />

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
            <button type="submit" className="button button-primary" disabled={isSaving}>
              {isSaving ? t('saving') : t('common:action.save')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
