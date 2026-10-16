import {
  branchBindingFor,
  type BranchBinding,
  type ConsoleBranch,
  type StaffRole,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { useStaffLabels } from './staffLabels';

/** The sentinel the branch `<select>` uses for "every branch of the venue". */
export const ALL_BRANCHES = '__all__';

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

/**
 * The role a hire opens on: the first one the actor may give that is neither
 * their own nor a general manager.
 *
 * An owner may hire a co-owner and a general manager, but a form that opens on
 * either makes a partner, or somebody who runs every branch, out of a careless
 * waiter hire. Somebody minting one picks it. A platform admin still opens on
 * the owner — giving a venue its first owner is what they are here for.
 */
export function defaultRoleFor(
  actorRole: StaffRole | 'platformAdmin',
  roles: readonly StaffRole[],
): StaffRole {
  return (
    roles.find((role) => role !== actorRole && role !== 'generalManager') ?? roles[0] ?? 'waiter'
  );
}

/**
 * The branch the select shows for a role, from what was last chosen.
 *
 * Derived rather than stored: "All branches" is not an answer for a branch
 * manager, so switching the role to one moves the select to a real branch —
 * the one on screen, else the first — without an effect repairing state. The
 * choice itself is kept, so switching back to a waiter restores it.
 */
export function branchChoiceFor(
  role: StaffRole,
  choice: string,
  fallbackBranchId: string | null,
  branches: readonly ConsoleBranch[],
): string {
  if (branchBindingFor(role) !== 'required' || choice !== ALL_BRANCHES) return choice;
  const fallback = branches.find((branch) => branch.id === fallbackBranchId) ?? branches[0];
  return fallback?.id ?? ALL_BRANCHES;
}

/**
 * The `branchId` a save sends for this role: none for a general manager, who
 * runs every branch; otherwise the choice, with "All branches" as null.
 */
export function branchIdFor(role: StaffRole, choice: string): string | null {
  if (branchBindingFor(role) === 'venueWide') return null;
  return choice === ALL_BRANCHES ? null : choice;
}

export interface BranchFieldProps {
  /** `canChooseBranch(actor)`: an owner or a general manager picks; a branch manager is told. */
  readonly chooseBranch: boolean;
  /**
   * How the role being given is bound to a branch: a branch manager needs one
   * (no "All branches"), a general manager has none (no picker at all).
   */
  readonly binding: BranchBinding;
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
 * choose, and a sentence for a branch manager, who holds one branch — a
 * control with a single option invites somebody to go looking for the others.
 *
 * The role being given decides the rest, as the server's invariants do: a
 * branch manager is offered branches and no "All branches", and a general
 * manager is told they work everywhere, with no control at all. The server's
 * refusal, when there is one, sits under whichever of these is shown.
 */
export function BranchField({
  chooseBranch,
  binding,
  branches,
  value,
  onChange,
  fixedBranchId,
  error,
}: BranchFieldProps) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const errorId = useId();

  const errorLine = error ? (
    <span id={errorId} className="field-error" role="alert">
      {error}
    </span>
  ) : null;

  if (binding === 'venueWide') {
    return (
      <div className="labelled">
        <p className="muted small" {...(error ? { 'aria-describedby': errorId } : {})}>
          {t('staff.field.branchVenueWide')}
        </p>
        {errorLine}
      </div>
    );
  }

  if (!chooseBranch) {
    return (
      <div className="labelled">
        <p className="muted small">
          {t('staff.field.branchFixed', {
            name: branches.find((branch) => branch.id === fixedBranchId)?.name ?? '',
          })}
        </p>
        {errorLine}
      </div>
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
      {errorLine}
    </div>
  );
}
