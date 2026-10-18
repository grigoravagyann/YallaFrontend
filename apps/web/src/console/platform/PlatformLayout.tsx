import type { ConsoleUser } from '@yalla/api';
import { usePlatformProfile } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from '../../auth/authSession';
import { DevRoleSwitcher } from '../../auth/DevRoleSwitcher';
import { usingMockData } from '../../data/gateway';
import { HomeIcon, SettingsIcon, SignOutIcon, VenuesIcon } from '../ui/icons';
import { ToastProvider } from '../ui/toast';
import '../ui/console.css';

interface PlatformNavItem {
  readonly to: string;
  /** Key in the `admin` namespace. */
  readonly labelKey: string;
  readonly icon: ReactNode;
  /** Matches only itself, not every page under it. */
  readonly end?: boolean;
}

/**
 * Exactly three destinations (HANDOFF section 2). Home is `/platform`, which
 * sends a platform admin to the venues list until the Home screen exists.
 */
export const PLATFORM_NAV: readonly PlatformNavItem[] = [
  { to: '/platform', labelKey: 'nav.home', icon: <HomeIcon />, end: true },
  { to: '/platform/venues', labelKey: 'nav.venues', icon: <VenuesIcon /> },
  { to: '/platform/settings', labelKey: 'nav.settings', icon: <SettingsIcon /> },
];

const MAIN_ID = 'main';

/** Up to two initials from a name: "Grigor Avagyan" → "GA". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

export interface PlatformLayoutProps {
  readonly user: ConsoleUser;
}

/**
 * The platform admin's shell (docs/design/console): a 232px dark-brown sidebar
 * with the three destinations and who is signed in, and the page in a `main`
 * beside it. Below 800px the sidebar becomes a bar across the top.
 *
 * The language picker is not here on purpose: it lives in Settings and on the
 * sign-in page only. The toast lives here, so every platform page can say one.
 *
 * Venue roles keep `ConsoleLayout`; the redesign is the platform area's.
 */
export function PlatformLayout({ user }: PlatformLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  // The admin's name as it is now: the token carries the one it was issued
  // with, and a rename in Settings (here or on another device) would leave the
  // sidebar wrong until the next sign-in. The token's name until `/me` answers.
  const profile = usePlatformProfile().data;
  const name = profile?.fullName || user.displayName || t(`role.${user.role}`);

  return (
    <ToastProvider>
      <div className="yc yc-app">
        <a className="yc-skip" href={`#${MAIN_ID}`}>
          {t('shell.skipToContent')}
        </a>

        <div className="yc-side">
          <div className="yc-brand">{t('common:appName')}</div>

          <nav className="yc-nav" aria-label={t('shell.mainNav')}>
            {PLATFORM_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end ?? false}>
                {item.icon}
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="yc-side-foot">
            <DevRoleSwitcher />
            <div className="yc-me">
              <span className="yc-avatar" aria-hidden="true">
                {initialsOf(name)}
              </span>
              <span className="yc-me-t">
                <span className="yc-me-n">{name}</span>
                <span className="yc-me-r">{t(`role.${user.role}`)}</span>
              </span>
              {/* Only against a real backend: the mock has no session to end,
                  and a sign-out that does nothing is worse than none. */}
              {usingMockData ? null : (
                <button
                  type="button"
                  className="yc-out"
                  aria-label={t('shell.signOut')}
                  title={t('shell.signOut')}
                  onClick={() => void signOut()}
                >
                  <SignOutIcon />
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="yc-main" id={MAIN_ID} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
