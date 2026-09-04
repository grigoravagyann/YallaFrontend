import { useTranslation } from 'react-i18next';
import { FALLBACK_LOCALE, type Locale, isLocale, setLocale } from './init';

export interface UseLocaleResult {
  /** The active locale, ready to hand to `@yalla/format`. */
  readonly locale: Locale;
  /** Change language and persist the choice. */
  readonly setLocale: (next: Locale) => Promise<void>;
}

/**
 * The active locale as a narrowed union.
 *
 * Every `@yalla/format` call needs a `Locale`, and i18next's `language` is a
 * plain string that can carry a region subtag. This is the one place that
 * narrowing happens.
 */
export function useLocale(): UseLocaleResult {
  const { i18n } = useTranslation();
  const active = i18n.resolvedLanguage ?? i18n.language;

  return {
    locale: isLocale(active) ? active : FALLBACK_LOCALE,
    setLocale,
  };
}
