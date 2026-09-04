/**
 * Persistence for the manual language override.
 *
 * The three apps have three different storage APIs (AsyncStorage, expo-sqlite,
 * localStorage) and two of them are async, so i18n takes an injectable adapter
 * rather than importing any of them. The app supplies the adapter at startup.
 */
export interface LocaleStorage {
  read(): Promise<string | null>;
  write(locale: string): Promise<void>;
}

export const LOCALE_STORAGE_KEY = 'yalla.locale';

/** Used when an app has not supplied storage yet; the override lasts one session. */
export function createMemoryLocaleStorage(): LocaleStorage {
  let value: string | null = null;
  return {
    read: () => Promise.resolve(value),
    write: (locale) => {
      value = locale;
      return Promise.resolve();
    },
  };
}

/** Web adapter for the admin panel. Falls back to memory if storage is blocked. */
export function createWebLocaleStorage(): LocaleStorage {
  return {
    read: () => {
      try {
        return Promise.resolve(globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null);
      } catch {
        // Private mode / blocked storage. A missing override is not an error.
        return Promise.resolve(null);
      }
    },
    write: (locale) => {
      try {
        globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // Preference simply will not survive a reload.
      }
      return Promise.resolve();
    },
  };
}
