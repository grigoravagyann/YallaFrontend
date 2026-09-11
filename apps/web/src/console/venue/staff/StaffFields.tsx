import type { ConsoleBranch, StaffRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { ALL_BRANCHES } from './StaffForm';
import { useStaffLabels } from './staffLabels';

export interface RoleChoicesProps {
  /** From `assignableRoles(actor)`: a role the actor may not give is not rendered. */
  readonly roles: readonly StaffRole[];
  readonly value: StaffRole;
  readonly onChange: (role: StaffRole) => void;
  /** A server refusal aimed at the role. */
  readonly error: string | null;
}

/**
 * The role as a real radio group of cards, one per role the actor may give.
 *
 * Native radios, so the arrows move between them, the group is one tab stop
 * and the checked one is announced — and the radio stays visible, so which
 * card is chosen is never said by colour alone.
 *
 * A refusal sits inside the group but outside every label, linked with
 * `aria-describedby`: it describes the question, it does not rename it.
 */
export function RoleChoices({ roles, value, onChange, error }: RoleChoicesProps) {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();
  const helpId = useId();
  const errorId = useId();
  const name = useId();

  return (
    <fieldset className="choice-list" aria-describedby={error ? `${helpId} ${errorId}` : helpId}>
      <legend className="choice-legend">{t('staff.wizard.roleLegend')}</legend>
      <p id={helpId} className="muted small">
        {t('staff.wizard.roleHelp')}
      </p>
      {roles.map((role) => (
        <label key={role} className="choice-card">
          <input
            type="radio"
            name={name}
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
          />
          <span className="choice-title">{t(`role.${role}`)}</span>
          <span className="choice-desc muted small">{labels.roleInfo(role)}</span>
        </label>
      ))}
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

export interface BranchFieldProps {
  /** `canChooseBranch(actor)`: an owner picks; a manager is told. */
  readonly chooseBranch: boolean;
  readonly branches: readonly ConsoleBranch[];
  /** A branch id, or `ALL_BRANCHES`. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The branch a manager hires for. */
  readonly fixedBranchId: string | null;
  readonly error: string | null;
}

/**
 * Where they work: a select with "All branches" first for somebody who may
 * choose, and a sentence for a manager, who holds one branch — a control with
 * a single option invites somebody to go looking for the others.
 */
export function BranchField({
  chooseBranch,
  branches,
  value,
  onChange,
  fixedBranchId,
  error,
}: BranchFieldProps) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const errorId = useId();

  if (!chooseBranch) {
    return (
      <p className="muted small">
        {t('staff.field.branchFixed', {
          name: branches.find((branch) => branch.id === fixedBranchId)?.name ?? '',
        })}
      </p>
    );
  }

  return (
    <div className="labelled">
      <label htmlFor={fieldId}>{t('staff.wizard.branchLabel')}</label>
      <select
        id={fieldId}
        className="field"
        value={value}
        {...(error ? { 'aria-describedby': errorId } : {})}
        onChange={(event) => onChange(event.currentTarget.value)}
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
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
