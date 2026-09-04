import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCALE_STORAGE_KEY, initI18n, type LocaleStorage } from '@yalla/i18n';
import { getLocales } from 'expo-localization';

/** AsyncStorage adapter for the manual language override. */
const storage: LocaleStorage = {
  read: () => AsyncStorage.getItem(LOCALE_STORAGE_KEY),
  write: (locale) => AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale),
};

/**
 * Read the device's preferred languages, most-preferred first.
 *
 * A tourist arrives with a phone already set to Russian or English; getting
 * this right on first launch is the difference between the app being usable
 * and being a wall of Armenian.
 */
function deviceLocales(): string[] {
  return getLocales().map((locale) => locale.languageTag);
}

export function bootstrapI18n() {
  return initI18n({
    deviceLocales: deviceLocales(),
    storage,
    namespaces: ['common', 'diner'],
    defaultNamespace: 'diner',
    debug: __DEV__,
  });
}
