import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_NAMESPACE, NAMESPACES, resources } from './resources';
import { createMemoryLocaleStorage, type LocaleStorage } from './storage';

/** Kept in step with `@yalla/format`'s `Locale`; duplicated so i18n stays dependency-free. */
export const LOCALES = ['hy', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'hy';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Reduce a device locale tag to one we ship.
 *
 * Device tags arrive as `hy-AM`, `ru-RU`, `en-US`, sometimes with a script
 * subtag. Anything we do not ship falls back to Armenian.
 */
export function resolveLocale(tags: readonly (string | null | undefined)[]): Locale {
  for (const tag of tags) {
    if (!tag) continue;
    const primary = tag.toLowerCase().split(/[-_]/u)[0];
    if (isLocale(primary)) return primary;
  }
  return FALLBACK_LOCALE;
}

export interface InitI18nOptions {
  /**
   * Device locale tags, most-preferred first. The native apps pass
   * `expo-localization`'s `getLocales()`; the admin panel passes `navigator.languages`.
   */
  readonly deviceLocales?: readonly (string | null | undefined)[];
  /** Where a manual override is persisted. Defaults to in-memory. */
  readonly storage?: LocaleStorage;
  /** Namespaces this surface loads. Defaults to all of them. */
  readonly namespaces?: readonly string[];
  /** Surface-specific default namespace, e.g. `diner`. */
  readonly defaultNamespace?: string;
  readonly debug?: boolean;
}

let storageRef: LocaleStorage = createMemoryLocaleStorage();

/**
 * Build and initialise the shared i18next instance.
 *
 * A stored manual override always beats the device locale: a Russian-speaking
 * resident with an English phone picked `ru` on purpose.
 */
export async function initI18n(options: InitI18nOptions = {}): Promise<I18nInstance> {
  const {
    deviceLocales = [],
    storage = createMemoryLocaleStorage(),
    namespaces = NAMESPACES,
    defaultNamespace = DEFAULT_NAMESPACE,
    debug = false,
  } = options;

  storageRef = storage;

  const stored = await storage.read();
  const initial = isLocale(stored) ? stored : resolveLocale(deviceLocales);

  await i18next.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: FALLBACK_LOCALE,
    ns: [...namespaces],
    defaultNS: defaultNamespace,
    debug,
    // React already escapes everything it renders.
    interpolation: { escapeValue: false },
    returnNull: false,
    // Surfaces a missing key loudly in dev instead of rendering the raw key path.
    saveMissing: false,
  });

  return i18next;
}

/** Change language and persist the choice. */
export async function setLocale(locale: Locale): Promise<void> {
  await i18next.changeLanguage(locale);
  await storageRef.write(locale);
}

export function currentLocale(): Locale {
  const active = i18next.resolvedLanguage ?? i18next.language;
  return isLocale(active) ? active : FALLBACK_LOCALE;
}

export { i18next };
