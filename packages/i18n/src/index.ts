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
export type { Locale, InitI18nOptions } from './init';

export { useLocale } from './useLocale';
export type { UseLocaleResult } from './useLocale';

export { NAMESPACES, DEFAULT_NAMESPACE, resources } from './resources';
export type { Namespace, Resources } from './resources';

export { createMemoryLocaleStorage, createWebLocaleStorage, LOCALE_STORAGE_KEY } from './storage';
export type { LocaleStorage } from './storage';

// Re-exported so apps can render text without importing react-i18next directly.
export { useTranslation, Trans, I18nextProvider } from 'react-i18next';
