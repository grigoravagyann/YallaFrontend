import type { StaffRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { useStaffLabels } from './staffLabels';

export type RoleFilter = StaffRole | 'all';

export const ROLE_ORDER: readonly StaffRole[] = ['owner', 'manager', 'waiter', 'kitchen'];

export interface StaffFiltersProps {
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly roleFilter: RoleFilter;
  readonly onRoleFilter: (value: RoleFilter) => void;
  /**
   * How many people each chip would show: counted after search and the
   * switch, before the role, so "Waiters 3" is always three cards.
   */
  readonly counts: Readonly<Record<RoleFilter, number>>;
  readonly showInactive: boolean;
  readonly onShowInactive: (value: boolean) => void;
}

/**
 * Search, the role chips and the "Show deactivated" switch.
 *
 * The chips are a radio group — one role at a time is what they do — and the
 * switch is a checkbox with `role="switch"`, so its state is announced and
 * Space flips it. The switch swaps the list rather than adding to it:
 * deactivated people stay listed, as a history, under their own view.
 */
export function StaffFilters({
  search,
  onSearch,
  roleFilter,
  onRoleFilter,
  counts,
  showInactive,
  onShowInactive,
}: StaffFiltersProps) {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();
  const name = useId();

  const options: readonly { value: RoleFilter; label: string }[] = [
    { value: 'all', label: t('staff.filter.all') },
    ...ROLE_ORDER.map((role) => ({ value: role, label: labels.group(role) })),
  ];

  return (
    <div className="staff-filters">
      <label className="labelled search-field">
        <span>{t('staff.filter.search')}</span>
        <span className="search-field-control">
          <svg
            className="search-field-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="field"
            type="search"
            placeholder={t('staff.filter.searchPlaceholder')}
            value={search}
            onChange={(event) => onSearch(event.currentTarget.value)}
          />
        </span>
      </label>

      <fieldset className="segmented">
        <legend className="visually-hidden">{t('staff.filter.role')}</legend>
        {options.map((option) => (
          <label key={option.value} className="segmented-option">
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={option.value}
              checked={roleFilter === option.value}
              onChange={() => onRoleFilter(option.value)}
            />
            {option.label} <span className="segmented-count">{counts[option.value]}</span>
          </label>
        ))}
      </fieldset>

      {/* Deactivated people stay listed. Somebody who left in March and comes
          back in June is a reactivation, not a second record — their audit
          history has to stay attached to one person. */}
      <label className="toggle">
        <input
          type="checkbox"
          role="switch"
          className="toggle-input"
          checked={showInactive}
          onChange={(event) => onShowInactive(event.currentTarget.checked)}
        />
        <span>{t('staff.filter.inactive')}</span>
      </label>
    </div>
  );
}
