import type { ConsoleUser } from '@yalla/api';
import { usePlatformProfile } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Outlet } from 'react-router-dom';
import { signOut } from '../../auth/authSession';
import { usingMockData } from '../../data/gateway';
import { ConsoleShell, type ShellLink } from '../ui/ConsoleShell';
import { HomeIcon, SettingsIcon, VenuesIcon } from '../ui/icons';
import { UnsavedChangesHost } from '../venue/useUnsavedChangesGuard';

/**
 * Exactly three destinations (HANDOFF section 2). Home is `/platform`, which
 * sends a platform admin to the venues list until the Home screen exists.
 */
export const PLATFORM_NAV: readonly ShellLink[] = [
  { to: '/platform', labelKey: 'nav.home', icon: <HomeIcon />, end: true },
  { to: '/platform/venues', labelKey: 'nav.venues', icon: <VenuesIcon /> },
  { to: '/platform/settings', labelKey: 'nav.settings', icon: <SettingsIcon /> },
];

export interface PlatformLayoutProps {
  readonly user: ConsoleUser;
}

/**
 * The platform admin's shell (docs/design/console): the console's one shell
 * (`ConsoleShell`, shared with the venue console) with the three destinations
 * and who is signed in. Below 800px the sidebar becomes a bar across the top.
 *
 * The language picker is not here on purpose: it lives in Settings and on the
 * sign-in page only.
 */
export function PlatformLayout({ user }: PlatformLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);
  // The admin's name as it is now: the token carries the one it was issued
  // with, and a rename in Settings (here or on another device) would leave the
  // sidebar wrong until the next sign-in. The token's name until `/me` answers.
  const profile = usePlatformProfile().data;
  const name = profile?.fullName || user.displayName || t(`role.${user.role}`);

  return (
    <ConsoleShell
      groups={[{ id: 'platform', links: PLATFORM_NAV }]}
      person={{ name, caption: t(`role.${user.role}`) }}
      // Only against a real backend: the mock has no session to end, and a
      // sign-out that does nothing is worse than none.
      onSignOut={usingMockData ? undefined : () => void signOut()}
    >
      <Outlet />
      {/* The branch pages' rooms and public page keep unsaved work. */}
      <UnsavedChangesHost />
    </ConsoleShell>
  );
}
