import type { ConsoleUser, UserRole } from '@yalla/api';
import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
      { to: '/venue/public', labelKey: 'nav.public' },
      { to: '/venue/reviews', labelKey: 'nav.reviews' },
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

/** The one id the menu button points at; the sidebar is rendered once. */
const NAV_ID = 'console-nav';

/**
 * Sidebar shell for the console. The staff floor screen uses its own layout.
 *
 * Above the phone breakpoint (`--shell-collapse` in the stylesheet) the
 * sidebar is a column beside the content, as it always was. Below it the
 * column left 135px for the content on a 375px phone — every screen wrapped
 * one word per line and the floor-plan canvas was unreachable — so there the
 * same `nav` becomes a drawer behind a menu button, and the content takes the
 * width. One element, two layouts: the links, the role switcher and the
 * language picker are not duplicated for the small screen.
 */
export function ConsoleLayout({ user }: ConsoleLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale, setLocale } = useLocale();
  const items = navItemsFor(user.role);
  const { pathname } = useLocation();
  // The drawer is open *for a page*: choosing a destination changes the
  // pathname and so closes it, with no effect writing state after the fact.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === pathname;
  const setMenuOpen = (open: boolean) => setOpenFor(open ? pathname : null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="shell">
      {/* Only drawn below the breakpoint; see `.shell-bar` in the stylesheet. */}
      <header className="shell-bar">
        <button
          type="button"
          className="button button-ghost shell-menu"
          aria-expanded={menuOpen}
          aria-controls={NAV_ID}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="shell-menu-icon" aria-hidden="true" />
          {t('shell.openMenu')}
        </button>
        <span className="shell-bar-brand">{t('common:appName')}</span>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="shell-scrim"
          aria-label={t('shell.closeMenu')}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <nav
        id={NAV_ID}
        className={menuOpen ? 'sidebar is-open' : 'sidebar'}
        aria-label={t('shell.title')}
      >
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
                // Overview is the section's root: without `end` it matched every page under it.
                end={item.to === '/venue'}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                onClick={() => setMenuOpen(false)}
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
