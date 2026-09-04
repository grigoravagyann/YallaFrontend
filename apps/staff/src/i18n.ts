import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCALE_STORAGE_KEY, initI18n, type LocaleStorage } from '@yalla/i18n';
import { getLocales } from 'expo-localization';

const storage: LocaleStorage = {
  read: () => AsyncStorage.getItem(LOCALE_STORAGE_KEY),
  write: (locale) => AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale),
};

/**
 * Staff-side language follows the tablet, which the venue sets once.
 *
 * Unlike the diner app there is no tourist case here — but a Yerevan cafe may
 * well have Russian-speaking staff, so the override still exists and persists.
 */
export function bootstrapI18n() {
  return initI18n({
    deviceLocales: getLocales().map((locale) => locale.languageTag),
    storage,
    namespaces: ['common', 'staff'],
    defaultNamespace: 'staff',
    debug: __DEV__,
  });
}
