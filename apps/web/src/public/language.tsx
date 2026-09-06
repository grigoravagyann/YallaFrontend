import { LOCALES, isLocale, setLocale, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useSearchParams } from 'react-router-dom';

/**
 * Language, carried in the URL.
 *
 * Every other surface persists the choice in storage. This one cannot — the
 * page writes to no browser storage at all — and it turns out the URL is the
 * better place anyway: a resident who reads Russian can forward the venue's
 * link with `?lang=ru` on it and their guest opens it in Russian, which no
 * amount of `localStorage` on somebody else's phone could do.
 *
 * With no parameter the browser decides, from `navigator.languages`. That is
 * the case that actually matters. This page is a tourist's first contact with
 * the product, they have no account and no reason to hunt for a switcher, and a
 * wall of Armenian is where they close the tab. Defaulting from the browser and
 * then putting the switcher where it can be seen is the whole of the strategy.
 */

const PARAM = 'lang';

/** The `?lang=` override, or `null`. Read before i18n starts, so not a hook. */
export function languageFromUrl(search: string): string | null {
  const value = new URLSearchParams(search).get(PARAM);
  return value && isLocale(value) ? value : null;
}

/**
 * The switcher.
 *
 * Three plain buttons in their own names — Հայերեն, Русский, English — never a
 * flag and never a two-letter code. A flag is a country and not a language, and
 * "HY" means nothing to the person who needs it most. Rendered at the top of
 * the page rather than in a footer for the same reason: someone who cannot read
 * the page cannot be expected to scroll to the bottom of it.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();

  const choose = (next: Locale) => {
    if (next === locale) return;
    const updated = new URLSearchParams(params);
    updated.set(PARAM, next);
    // `replace`: switching language is not a place someone navigated to, and
    // leaving it in the history means Back cycles languages instead of going
    // back to whatever they were reading before they opened the link.
    setParams(updated, { replace: true });
    void setLocale(next);
  };

  return (
    <nav className="lang" aria-label={t('language.change')}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          className="lang-option"
          lang={code}
          aria-current={code === locale ? 'true' : undefined}
          onClick={() => choose(code)}
        >
          {t(`language.${code}`, { ns: 'common' })}
        </button>
      ))}
    </nav>
  );
}
