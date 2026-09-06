import i18next, { type i18n as I18nInstance, type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_NAMESPACE } from './namespaces';
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

/**
 * The bundles a surface renders, as `{ locale: { namespace: bundle } }`.
 *
 * Loose on purpose. A precise type would have to name every namespace, and
 * naming them here is what would force this module to import the full
 * `resources` map — which is the one thing it must not do, because that import
 * is what puts the console's copy in the public page's bundle. The shape is
 * checked by i18next at init and by `pnpm i18n:check` across the files
 * themselves, which is where key drift is actually catchable.
 */
export type LocaleResources = Resource;

export interface InitI18nOptions {
  /**
   * Which bundles to load. Required, and it is a *bundling* decision as much as
   * a functional one: pass `resources` from `@yalla/i18n/resources` for a
   * surface that renders everything, or `publicResources` from
   * `@yalla/i18n/public` for the branch page. See `src/bundles/README.md`.
   */
  readonly resources: LocaleResources;
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
export async function initI18n(options: InitI18nOptions): Promise<I18nInstance> {
  const {
    resources,
    deviceLocales = [],
    storage = createMemoryLocaleStorage(),
    defaultNamespace = DEFAULT_NAMESPACE,
    debug = false,
  } = options;
  const namespaces = options.namespaces ?? Object.keys(resources['hy'] ?? {});

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
