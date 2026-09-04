import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { NavLink, Outlet } from 'react-router-dom';
import { navItems } from './router';

/**
 * Sidebar shell for the admin panel.
 *
 * The language switcher lives in the shell rather than on a settings screen: an
 * owner whose staff read Armenian and whose accountant reads Russian will switch
 * often, and the choice persists across reloads.
 */
export function AppLayout() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale, setLocale } = useLocale();

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t('shell.title')}>
        <div className="brand">{t('common:appName')}</div>

        <ul className="nav">
          {navItems.map((item) => (
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
