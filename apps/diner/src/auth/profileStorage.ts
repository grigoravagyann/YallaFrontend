import * as SecureStore from 'expo-secure-store';
import { EMPTY_PROFILE, type DinerProfile, type ProfileStorage } from '../stores/session';

const KEY = 'yalla.diner.profile';

/**
 * The diner's number and booking name, in the keychain beside the refresh token.
 *
 * The keychain rather than AsyncStorage because a phone number is personal
 * data, and a plain file is the wrong place for it. Anything unreadable comes
 * back empty: the cost is one prompt, never a crash at launch.
 */
export function createSecureProfileStorage(): ProfileStorage {
  return {
    async read(): Promise<DinerProfile> {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return EMPTY_PROFILE;
      try {
        const parsed = JSON.parse(raw) as Partial<Record<keyof DinerProfile, unknown>>;
        return {
          phoneE164: typeof parsed.phoneE164 === 'string' ? parsed.phoneE164 : null,
          guestName: typeof parsed.guestName === 'string' ? parsed.guestName : null,
        };
      } catch {
        return EMPTY_PROFILE;
      }
    },
    write: (profile) => SecureStore.setItemAsync(KEY, JSON.stringify(profile)),
  };
}
