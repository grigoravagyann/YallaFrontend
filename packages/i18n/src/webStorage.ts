import { LOCALE_STORAGE_KEY, type LocaleStorage } from './storage';

/**
 * The `localStorage` adapter, in its own module.
 *
 * Separated from `storage.ts` so that a surface which must not touch browser
 * storage — the public branch page — can import the memory adapter without this
 * one following it into the bundle. See the note in `storage.ts`.
 *
 * Falls back to doing nothing if storage is blocked. A private window, or a
 * browser set to refuse site data, is not an error state for a language
 * preference: the choice simply lasts one session.
 */
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
