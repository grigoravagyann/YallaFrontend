import { USER_ROLES, type UserRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useNavigate } from 'react-router-dom';
import { useDevRole } from './session';
import { landingPathFor } from './useCurrentUser';

export interface DevRoleSwitcherProps {
  /** `sidebar` in the console, `bar` on the staff floor header. */
  readonly variant?: 'sidebar' | 'bar';
}

/**
 * Walk all four tiers without four accounts.
 *
 * Development only, and structurally so: `import.meta.env.DEV` is replaced with
 * `false` at build time and this whole subtree becomes dead code the bundler
 * drops. It changes which role the *mock* reports; against a real backend the
 * role comes from the token and `resolveConsoleGateway` ignores it outright, so
 * it could not become a privilege-escalation path even if it did ship.
 *
 * It navigates to the new role's landing page on change, because the route you
 * are standing on usually does not exist in the role you just switched to —
 * leaving you on the refusal page, which is correct but useless.
 *
 * Rendered in the floor header as well as the console sidebar: the floor screen
 * has no sidebar at all, and without this a waiter session would be a one-way
 * door out of the console until a reload.
 */
export function DevRoleSwitcher({ variant = 'sidebar' }: DevRoleSwitcherProps) {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const role = useDevRole((state) => state.role);
  const setRole = useDevRole((state) => state.setRole);

  if (!import.meta.env.DEV) return null;

  return (
    <label className={variant === 'bar' ? 'dev-role dev-role-bar' : 'dev-role'}>
      <span className="dev-role-label">{t('shell.devRole')}</span>
      <select
        value={role}
        onChange={(event) => {
          const next = event.target.value as UserRole;
          setRole(next);
          navigate(landingPathFor(next), { replace: true });
        }}
      >
        {USER_ROLES.map((code) => (
          <option key={code} value={code}>
            {t(`role.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
