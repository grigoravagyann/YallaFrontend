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
import { useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../../ui/Dialog';
import { ALL_BRANCHES, branchChoiceFor, branchIdFor } from './StaffFields';
import { refusalIsFormLevel, refusalText, type StaffRefusal } from './staffRefusal';
import { useStaffLabels } from './staffLabels';

/**
 * The person's staff id, read-only, with a Copy button.
 *
 * Here and not on the row: the id is needed rarely — a tablet that cannot
 * load its roster — and the row is for the one thing that needs doing. Copy
 * falls back to selecting the text where the clipboard is out of reach.
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
    <div className="yc-once">
      <span className="yc-help yc-strong">{t('staff.staffId.label')}</span>
      <div className="yc-linkrow">
        <code ref={valueRef} className="yc-mono yc-st-id">
          {staffMemberId}
        </code>
        <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={() => void copy()}>
          {t('staff.staffId.copy')}
        </button>
      </div>
      {copied !== 'idle' ? (
        <span className="yc-help" role="status">
          {copied === 'copied' ? t('staff.signIn.copied') : t('staff.signIn.selectAndCopy')}
        </span>
      ) : null}
      <span className="yc-help">{t('staff.staffId.help')}</span>
    </div>
  );
}

export interface EditStaffDialogProps {
  readonly member: StaffMember;
  readonly actorRole: StaffRole | 'platformAdmin';
  readonly fixedBranchId: string | null;
  readonly branches: readonly ConsoleBranch[];
  readonly onUpdate: (patch: UpdateStaffInput) => Promise<void>;
  readonly onCancel: () => void;
  readonly refusal: StaffRefusal | null;
  readonly isSaving: boolean;
  /** The row's ⋮ button: the menu item that opened this is gone. */
  readonly returnFocusTo?: () => HTMLElement | null;
}

/**
 * Editing somebody, as one page in a dialog — not the add steps again.
 *
 * An edit is a correction to one field, usually a phone number, and seeing the
 * whole record at once is the check. There is no PIN and no address here:
 * both have their own items in the row's menu (New PIN, the sign-in link),
 * because changing either replaces a working credential.
 *
 * The role and the branch travel together, as the server checks the pair: a
 * branch manager needs a branch (no "All branches"), a general manager has
 * none, and promoting a waiter who works everywhere to branch manager puts
 * them at the branch on screen. Mounted per person (keyed by id).
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
  returnFocusTo,
}: EditStaffDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();

  const roles = assignableRoles(actorRole);
  const chooseBranch = canChooseBranch(actorRole);

  const [fullName, setFullName] = useState(member.fullName);
  const [phone, setPhone] = useState(member.phone);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [branchChoice, setBranchChoice] = useState<string>(member.branchId ?? ALL_BRANCHES);
  const shownBranch = branchChoiceFor(role, branchChoice, fixedBranchId, branches);
  const binding = branchBindingFor(role);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isSaving) return;
    const branchId = branchIdFor(role, shownBranch);
    await onUpdate({
      fullName,
      phone,
      role,
      // Always sent when the actor may choose, because `null` is a real
      // assignment and the flag is what tells it from "leave it alone".
      ...(chooseBranch ? { setBranch: true, branchId } : {}),
    });
  }

  const roleError = refusalText(refusal, 'role');
  const branchError = refusalText(refusal, 'branchId');
  const fixedName = branches.find((branch) => branch.id === fixedBranchId)?.name ?? '';

  return (
    <Dialog
      wide
      title={t('staff.form.editTitle', { name: member.fullName })}
      onClose={isSaving ? () => undefined : onCancel}
      dismissible={!isSaving}
      {...(returnFocusTo ? { returnFocusTo } : {})}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-row2">
          <div className="yc-fld">
            <label htmlFor="se-name">{t('staff.field.name')}</label>
            <input
              id="se-name"
              className="yc-ctl"
              data-autofocus=""
              autoComplete="off"
              required
              value={fullName}
              onChange={(event) => setFullName(event.currentTarget.value)}
            />
          </div>
          <div className="yc-fld">
            <label htmlFor="se-phone">{t('staff.field.phone')}</label>
            <input
              id="se-phone"
              className="yc-ctl"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              required
              value={phone}
              onChange={(event) => setPhone(event.currentTarget.value)}
            />
          </div>
        </div>

        <fieldset
          className="yc-roles"
          {...(roleError ? { 'aria-describedby': 'se-role-err' } : {})}
        >
          <legend>
            {t('venuePage.wizard.roleLegend')}{' '}
            <span className="yc-help">{t('venuePage.wizard.roleHelp')}</span>
          </legend>
          {roles.map((value) => (
            <label key={value} className={value === role ? 'yc-rc is-on' : 'yc-rc'}>
              <input
                type="radio"
                name="staff-edit-role"
                value={value}
                checked={value === role}
                onChange={() => setRole(value)}
              />
              <b>{t(`role.${value}`)}</b>
              <span>{labels.roleInfo(value)}</span>
            </label>
          ))}
        </fieldset>
        {roleError ? (
          <span className="yc-err" id="se-role-err" role="alert">
            {roleError}
          </span>
        ) : null}

        {binding === 'venueWide' ? (
          <p className="yc-help">{t('staff.field.branchVenueWide')}</p>
        ) : !chooseBranch ? (
          <p className="yc-help">{t('staff.field.branchFixed', { name: fixedName })}</p>
        ) : (
          <div className="yc-fld">
            <label htmlFor="se-branch">{t('staff.wizard.branchLabel')}</label>
            <select
              id="se-branch"
              className="yc-ctl"
              value={shownBranch}
              aria-invalid={Boolean(branchError)}
              {...(branchError ? { 'aria-describedby': 'se-branch-err' } : {})}
              onChange={(event) => setBranchChoice(event.currentTarget.value)}
            >
              {/* An owner or a waiter who works every branch. Never a branch
                  manager: they run one, and the server refuses one with none. */}
              {binding === 'either' ? (
                <option value={ALL_BRANCHES}>{t('staff.allBranches')}</option>
              ) : null}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {branchError ? (
          <span className="yc-err" id="se-branch-err" role="alert">
            {branchError}
          </span>
        ) : null}

        <StaffIdRow staffMemberId={member.id} />

        {/* Anything without a control in this dialog, at the foot. */}
        {refusal && refusalIsFormLevel(refusal, ['role', 'branchId']) ? (
          <p className="yc-alert" role="alert">
            {refusal.message}
          </p>
        ) : null}

        <div className="yc-acts">
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            disabled={isSaving}
            onClick={onCancel}
          >
            {t('common:action.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={isSaving}>
            {isSaving ? <span className="yc-spin" aria-hidden="true" /> : null}
            {isSaving ? t('saving') : t('common:action.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
