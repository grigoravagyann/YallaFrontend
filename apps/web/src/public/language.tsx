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
 * A path inside the public page that keeps the reader's `?lang=`.
 *
 * The language lives in the URL and nowhere else, so a link that dropped it
 * would open the next page in the browser's language again — and a link copied
 * from there would send a friend the wrong one. With no `?lang=` on this page
 * the path is returned as it is: the browser is still deciding.
 */
export function useLangPath(): (path: string) => string {
  const [params] = useSearchParams();
  const lang = params.get(PARAM);
  return (path) => (lang && isLocale(lang) ? `${path}?${PARAM}=${lang}` : path);
}

/**
 * Each language's own short name, the same in every language — they are names,
 * not translations — beside the full name a screen reader says (Public page
 * artboards: «Հայ», «Рус», «Eng» on the top bar).
 */
const SHORT_NAME: Readonly<Record<Locale, string>> = { hy: 'Հայ', ru: 'Рус', en: 'Eng' };

/**
 * The switcher, on the top bar.
 *
 * Three buttons, each showing its language's own short name and named in full —
 * Հայերեն, Русский, English — never a flag, which is a country and not a
 * language. The full name contains the short one, so what a voice-control user
 * reads is what they can say (WCAG 2.5.3). At the top of the page rather than
 * in a footer: someone who cannot read the page cannot be expected to scroll
 * to the bottom of it.
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
    <div className="pub-lang" role="group" aria-label={t('language.change')}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-label={t(`language.${code}`, { ns: 'common' })}
          aria-pressed={code === locale}
          onClick={() => choose(code)}
        >
          {SHORT_NAME[code]}
        </button>
      ))}
    </div>
  );
}
