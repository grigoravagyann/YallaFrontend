import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCALE_STORAGE_KEY, initI18n, type LocaleStorage } from '@yalla/i18n';
import { DINER_NAMESPACES, dinerResources } from '@yalla/i18n/diner';
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
    /*
     * The narrow map, not the whole one.
     *
     * These two namespaces were always the ones declared here, but the import
     * was `@yalla/i18n/resources` — the whole map — and Metro bundles what is
     * imported regardless of what i18next is later told to register. That put
     * the venue console's and the counter screen's copy, about 149 kB of JSON
     * across three languages, inside a phone binary that renders neither.
     */
    resources: dinerResources,
    deviceLocales: deviceLocales(),
    storage,
    namespaces: [...DINER_NAMESPACES],
    defaultNamespace: 'diner',
    debug: __DEV__,
  });
}
