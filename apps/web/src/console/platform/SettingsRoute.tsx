import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useId } from 'react';
import { PageHeader } from '../ui/PageHeader';
import { useToast } from '../ui/toast';

/**
 * Settings, as far as phase 1 of the redesign goes: the console language.
 *
 * The language picker left the sidebar with the redesign (HANDOFF section 3:
 * it lives in Settings and on sign-in only), so this page has to exist for the
 * platform admin to change it. "My account" — the admin's own name and
 * password — follows once the backend has endpoints for it (section 6.6).
 */
export function SettingsRoute() {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { locale, setLocale } = useLocale();
  const toast = useToast();
  const headingId = useId();

  async function choose(next: Locale) {
    if (next === locale) return;
    await setLocale(next);
    // Said in the language just chosen, which is also the proof it worked.
    toast.say(i18n.t('admin:settings.language.changed', { lng: next }));
  }

  return (
    <div className="yc-settings">
      <PageHeader title={t('settings.title')} />
      <section className="yc-card" aria-labelledby={headingId}>
        <div className="yc-card-h">
          <div>
            <h2 className="yc-h2" id={headingId}>
              {t('settings.language.title')}
            </h2>
            <p className="yc-cap">{t('settings.language.body')}</p>
          </div>
        </div>
        <div className="yc-radios" role="radiogroup" aria-labelledby={headingId}>
          {LOCALES.map((code) => (
            <label key={code} className={code === locale ? 'yc-radio is-on' : 'yc-radio'}>
              <input
                type="radio"
                name="console-language"
                value={code}
                checked={code === locale}
                onChange={() => void choose(code)}
              />
              <span lang={code}>{t(`common:language.${code}`)}</span>
              {code === 'hy' ? (
                <span className="yc-radio-hint">{t('settings.language.default')}</span>
              ) : null}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
