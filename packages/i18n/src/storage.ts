/**
 * Persistence for the manual language override.
 *
 * The three apps have three different storage APIs (AsyncStorage, expo-sqlite,
 * localStorage) and two of them are async, so i18n takes an injectable adapter
 * rather than importing any of them. The app supplies the adapter at startup.
 *
 * The `localStorage` adapter lives in `webStorage.ts` rather than here, and the
 * split is load-bearing: the public branch page is required to touch no browser
 * storage at all, and it imports `createMemoryLocaleStorage` from this module.
 * With both in one file a bundler cannot drop one and keep the other, so the
 * page's bundle would carry a `localStorage` call it never makes — and the
 * guarantee would stop being checkable. `productionBundle.test.ts` checks it.
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
