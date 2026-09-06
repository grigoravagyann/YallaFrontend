export {
  initI18n,
  setLocale,
  currentLocale,
  resolveLocale,
  isLocale,
  i18next,
  LOCALES,
  FALLBACK_LOCALE,
} from './init';
export type { Locale, InitI18nOptions, LocaleResources } from './init';

export { useLocale } from './useLocale';
export type { UseLocaleResult } from './useLocale';

export { NAMESPACES, DEFAULT_NAMESPACE } from './namespaces';
export type { Namespace } from './namespaces';

/**
 * The full resource map is **not** re-exported here.
 *
 * Importing it from the barrel would put every namespace in every bundle that
 * touches `@yalla/i18n`, which is all three surfaces. Take it from
 * `@yalla/i18n/resources`, or the narrow one from `@yalla/i18n/public`.
 */

export { createMemoryLocaleStorage, LOCALE_STORAGE_KEY } from './storage';
export type { LocaleStorage } from './storage';
export { createWebLocaleStorage } from './webStorage';

// Re-exported so apps can render text without importing react-i18next directly.
export { useTranslation, Trans, I18nextProvider } from 'react-i18next';
