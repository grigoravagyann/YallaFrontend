import { EMPTY_PROFILE, type DinerProfile } from '../stores/session';

/**
 * The stored profile, read back tolerantly.
 *
 * Anything unreadable comes back empty; a profile written before the email
 * existed reads back with `email: null`. Shared by the keychain store on the
 * phone and the localStorage store on the web.
 */
export function decodeProfile(raw: string | null): DinerProfile {
  if (!raw) return EMPTY_PROFILE;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof DinerProfile, unknown>>;
    return {
      phoneE164: typeof parsed.phoneE164 === 'string' ? parsed.phoneE164 : null,
      guestName: typeof parsed.guestName === 'string' ? parsed.guestName : null,
      email: typeof parsed.email === 'string' ? parsed.email : null,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}
