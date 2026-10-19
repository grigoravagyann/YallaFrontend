import {
  useChangePlatformPassword,
  usePlatformProfile,
  useUpdatePlatformProfile,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { LanguageCard, PasswordCard, ProfileCard } from '../ui/AccountCards';
import { GlobeIcon, UserIcon } from '../ui/icons';
import { PageHeader } from '../ui/PageHeader';

type Section = 'account' | 'language';

/**
 * Settings (Settings artboard): "My account" — the admin's own name, the
 * email that configuration fixes, and the password — and the console's
 * language. There is one platform admin, so there is no list of admins here
 * (HANDOFF section 3). The cards are the venue console's My account's too.
 */
export function SettingsRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const [section, setSection] = useState<Section>('account');
  const profile = usePlatformProfile();
  const rename = useUpdatePlatformProfile();
  const change = useChangePlatformPassword();
  return (
    <div className="yc-settings">
      <PageHeader title={t('settings.title')} sub={t('settings.sub')} />
      <div className="yc-cols">
        <nav className="yc-card yc-subnav" aria-label={t('settings.sections.label')}>
          <button
            type="button"
            className={section === 'account' ? 'is-on' : undefined}
            {...(section === 'account' ? { 'aria-current': 'page' as const } : {})}
            onClick={() => setSection('account')}
          >
            <UserIcon />
            {t('settings.sections.account')}
          </button>
          <button
            type="button"
            className={section === 'language' ? 'is-on' : undefined}
            {...(section === 'language' ? { 'aria-current': 'page' as const } : {})}
            onClick={() => setSection('language')}
          >
            <GlobeIcon />
            {t('settings.sections.language')}
          </button>
        </nav>
        <div className="yc-scontent">
          {section === 'account' ? (
            <>
              <ProfileCard query={profile} save={rename} cap={t('settings.profile.cap')} />
              <PasswordCard change={change} title={t('settings.password.title')} />
            </>
          ) : (
            <LanguageCard />
          )}
        </div>
      </div>
    </div>
  );
}
