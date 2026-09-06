import type { ConsoleUser, UserRole } from '@yalla/api';
import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from '../auth/authSession';
import { DevRoleSwitcher } from '../auth/DevRoleSwitcher';
import { FLOOR_ROLES, PLATFORM_ROLES, VENUE_ROLES } from '../auth/useCurrentUser';
import { usingMockData } from '../data/gateway';

export interface NavItem {
  readonly to: string;
  /** Key in the `admin` namespace. */
  readonly labelKey: string;
}

/**
 * The sidebar, built from the role rather than filtered by CSS.
 *
 * This function is the *whole* navigation story for the console: a link that is
 * not returned here does not appear, and — more importantly — the matching
 * route is not registered in the router either (see `AppRoutes`). A waiter has
 * no hidden platform route to reveal.
 */
export function navItemsFor(role: UserRole): readonly NavItem[] {
  const items: NavItem[] = [];

  if (PLATFORM_ROLES.includes(role)) {
    items.push({ to: '/platform/venues', labelKey: 'nav.venues' });
  }

  if (VENUE_ROLES.includes(role)) {
    items.push(
      { to: '/venue', labelKey: 'nav.overview' },
      { to: '/venue/floorplan', labelKey: 'nav.floorplan' },
      { to: '/venue/menu', labelKey: 'nav.menu' },
      { to: '/venue/hours', labelKey: 'nav.hours' },
      { to: '/venue/policy', labelKey: 'nav.policy' },
      { to: '/venue/staff', labelKey: 'nav.staff' },
      { to: '/venue/reports', labelKey: 'nav.reports' },
    );
  }

  if (FLOOR_ROLES.includes(role)) {
    items.push({ to: '/staff', labelKey: 'nav.floor' });
  }

  return items;
}

export interface ConsoleLayoutProps {
  readonly user: ConsoleUser;
}

/** Sidebar shell for the console. The staff floor screen uses its own layout. */
export function ConsoleLayout({ user }: ConsoleLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale, setLocale } = useLocale();
  const items = navItemsFor(user.role);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t('shell.title')}>
        <div className="brand">{t('common:appName')}</div>

        <div className="whoami">
          <span className="whoami-name">
            {user.displayName
              ? t('shell.signedInAs', { name: user.displayName })
              : t(`role.${user.role}`)}
          </span>
          {user.displayName ? <span className="whoami-role">{t(`role.${user.role}`)}</span> : null}
          {/* Only against a real backend: the mock has no session to end, and a
              sign-out that does nothing is worse than none. */}
          {usingMockData ? null : (
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => void signOut()}
            >
              {t('shell.signOut')}
            </button>
          )}
        </div>

        <ul className="nav">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>

        <DevRoleSwitcher />

        <label className="language">
          <span className="language-label">{t('common:language.label')}</span>
          <select
            value={locale}
            onChange={(event) => {
              void setLocale(event.target.value as Locale);
            }}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(`common:language.${code}`)}
              </option>
            ))}
          </select>
        </label>
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
