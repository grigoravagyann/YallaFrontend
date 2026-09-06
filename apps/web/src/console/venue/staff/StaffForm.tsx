import {
  assignableRoles,
  canChooseBranch,
  type StaffPermissionError,
  type ConsoleBranch,
  type CreateStaffInput,
  type StaffMember,
  type StaffRole,
  type UpdateStaffInput,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';

export interface StaffFormProps {
  readonly actorRole: StaffRole | 'platformAdmin';
  /** The branch a manager is fixed to; `null` when the actor may choose. */
  readonly fixedBranchId: string | null;
  readonly branches: readonly ConsoleBranch[];
  /** Absent when creating. */
  readonly editing: StaffMember | null;
  readonly onCreate: (input: CreateStaffInput) => Promise<void>;
  readonly onUpdate: (patch: UpdateStaffInput) => Promise<void>;
  readonly onCancel: () => void;
  readonly refusal: StaffPermissionError | null;
  readonly isSaving: boolean;
}

/** The sentinel the branch `<select>` uses for "every branch of the venue". */
const ALL_BRANCHES = '__all__';

/**
 * One form for hiring and for editing, because they are the same act.
 *
 * **A form, not a wizard.** Adding a waiter is four fields and takes twenty
 * seconds; a sequence of screens would make it feel like an application.
 *
 * Two rules are visible here rather than enforced on submit:
 *
 * - **The role picker is built from the actor's own role.** A manager does not
 *   see Manager or Owner as options at all — not hidden with CSS, not rendered
 *   and rejected. Offering an action the server will refuse teaches people the
 *   product is broken rather than that a rule exists.
 * - **The branch field offers "all branches"** where the actor's scope allows.
 *   `StaffMember.branchId` is nullable and null means every branch of the
 *   venue; that is how a floating manager or an owner who works the floor is
 *   represented, and nothing in the product could reach it before this screen.
 *
 * A manager sees no branch control at all: they hold one branch, everyone they
 * hire works at it, and a control with a single option invites somebody to go
 * looking for the others.
 */
export function StaffForm({
  actorRole,
  fixedBranchId,
  branches,
  editing,
  onCreate,
  onUpdate,
  onCancel,
  refusal,
  isSaving,
}: StaffFormProps) {
  const { t } = useTranslation(['admin', 'common']);

  const roles = assignableRoles(actorRole);
  const chooseBranch = canChooseBranch(actorRole);

  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [role, setRole] = useState<StaffRole>(editing?.role ?? roles[0] ?? 'waiter');
  const [branchChoice, setBranchChoice] = useState<string>(
    editing ? (editing.branchId ?? ALL_BRANCHES) : (fixedBranchId ?? ALL_BRANCHES),
  );
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const branchId = branchChoice === ALL_BRANCHES ? null : branchChoice;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPinError(null);

    if (editing) {
      await onUpdate({
        fullName,
        phone,
        role,
        // Always sent when the actor may choose, because `null` is a real
        // assignment and the flag is the only thing that distinguishes it from
        // "leave the branch alone".
        ...(chooseBranch ? { setBranch: true, branchId } : {}),
      });
      return;
    }

    // Four digits, checked before the round trip because the message is the
    // same either way and the server should not be asked a question with a
    // known answer.
    if (!/^\d{4}$/u.test(pin)) {
      setPinError(t('staff.pin.fourDigits'));
      return;
    }

    await onCreate({
      fullName,
      phone,
      role,
      pin,
      branchId: chooseBranch ? branchId : fixedBranchId,
    });
  }

  /** A refusal the server aimed at a specific control. */
  const refusalFor = (field: string) => (refusal?.field === field ? refusal.message : null);

  return (
    // Named, so it is a landmark: the screen has a role filter and a role field
    // and a screen reader user needs to know which one they are in.
    <form
      className="staff-form card"
      aria-labelledby="staff-form-title"
      onSubmit={(event) => void submit(event)}
    >
      <h3 id="staff-form-title">
        {editing ? t('staff.form.editTitle', { name: editing.fullName }) : t('staff.form.title')}
      </h3>

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

      {/*
        The error sits *outside* the label and is linked with
        `aria-describedby`. Inside it, the message would become part of the
        field's accessible name — the select would announce as "Role An owner
        cannot assign that role" — when what it is is a description of a field
        still called Role.
      */}
      <div className="labelled">
        <label htmlFor="staff-role">{t('staff.field.role')}</label>
        <select
          id="staff-role"
          className="field"
          value={role}
          {...(refusalFor('role') ? { 'aria-describedby': 'staff-role-error' } : {})}
          onChange={(event) => setRole(event.currentTarget.value as StaffRole)}
        >
          {roles.map((option) => (
            <option key={option} value={option}>
              {t(`role.${option}`)}
            </option>
          ))}
        </select>
        {refusalFor('role') ? (
          <span id="staff-role-error" className="field-error" role="alert">
            {refusalFor('role')}
          </span>
        ) : null}
      </div>

      {chooseBranch ? (
        <div className="labelled">
          <label htmlFor="staff-branch">{t('staff.field.branch')}</label>
          <select
            id="staff-branch"
            className="field"
            value={branchChoice}
            {...(refusalFor('branchId') ? { 'aria-describedby': 'staff-branch-error' } : {})}
            onChange={(event) => setBranchChoice(event.currentTarget.value)}
          >
            {/* The assignment that was unreachable. An owner who works the floor
                and a manager who covers three sites are both this. */}
            <option value={ALL_BRANCHES}>{t('staff.allBranches')}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {refusalFor('branchId') ? (
            <span id="staff-branch-error" className="field-error" role="alert">
              {refusalFor('branchId')}
            </span>
          ) : null}
        </div>
      ) : (
        // Stated rather than offered. A manager hires for their own branch.
        <p className="muted small">
          {t('staff.field.branchFixed', {
            name: branches.find((branch) => branch.id === fixedBranchId)?.name ?? '',
          })}
        </p>
      )}

      {editing ? null : (
        <div className="labelled">
          <label htmlFor="staff-pin">{t('staff.field.pin')}</label>
          <input
            id="staff-pin"
            className="field"
            /*
             * `inputMode` rather than `type="password"`: a manager is typing a
             * PIN they are about to read aloud to the person standing next to
             * them, and hiding it from the person setting it protects nobody.
             *
             * `autoComplete="off"` and no `name`, so no password manager offers
             * to remember it and no browser writes it to disk.
             */
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            required
            autoComplete="off"
            onChange={(event) => setPin(event.currentTarget.value.replace(/\D/gu, ''))}
          />
          <span className="muted small">{t('staff.pin.help')}</span>
          {pinError ? (
            <span className="field-error" role="alert">
              {pinError}
            </span>
          ) : null}
        </div>
      )}

      {/* Only a refusal that named no field lands here. One that named a field
          is already under that field, where the next action is obvious. */}
      {refusal && !refusal.field ? (
        <p className="field-error" role="alert">
          {refusal.message}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" className="button button-primary" disabled={isSaving}>
          {isSaving ? t('saving') : editing ? t('common:action.save') : t('staff.form.create')}
        </button>
        <button type="button" className="button button-ghost" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
      </div>
    </form>
  );
}
