import { create } from 'zustand';

/**
 * What the app remembers about the diner between launches.
 *
 * The phone number and the name the venue asks for at the door. Both are needed
 * to make a booking (`CreateReservationRequest` requires them), and the number
 * is not on the diner's token — so a diner whose session was restored from the
 * keychain has no other way to supply it without being sent through an SMS
 * again.
 */
export interface DinerProfile {
  readonly phoneE164: string | null;
  readonly guestName: string | null;
}

export interface ProfileStorage {
  read(): Promise<DinerProfile>;
  write(profile: DinerProfile): Promise<void>;
}

export const EMPTY_PROFILE: DinerProfile = { phoneE164: null, guestName: null };

let storage: ProfileStorage | null = null;

/** Set once at startup. Tests pass a memory store, or nothing. */
export function configureProfileStorage(next: ProfileStorage | null): void {
  storage = next;
}

interface SessionState {
  /**
   * True while this device has a diner session.
   *
   * Derived from the token session — a refresh token restored from the
   * keychain, a sign-in this launch — and kept here as a cache so screens can
   * subscribe to it. It used to be a flag set only by the verify screen, so a
   * returning diner was sent through an SMS code again and push was never
   * re-registered after a relaunch.
   */
  signedIn: boolean;
  phoneE164: string | null;
  guestName: string | null;
  setVerified: (input: { phoneE164: string }) => void;
  setGuestName: (guestName: string) => void;
  setSignedIn: (signedIn: boolean) => void;
  hydrate: (profile: DinerProfile) => void;
  /** Signed out: the session is gone. The remembered number and name stay, as prefill. */
  clear: () => void;
}

function persist(state: DinerProfile): void {
  void storage
    ?.write({ phoneE164: state.phoneE164, guestName: state.guestName })
    .catch(() => undefined);
}

export const useSession = create<SessionState>((set, get) => ({
  signedIn: false,
  phoneE164: null,
  guestName: null,
  setVerified: ({ phoneE164 }) => {
    set({ signedIn: true, phoneE164 });
    persist(get());
  },
  setGuestName: (guestName) => {
    set({ guestName });
    persist(get());
  },
  setSignedIn: (signedIn) => set({ signedIn }),
  hydrate: (profile) => set({ phoneE164: profile.phoneE164, guestName: profile.guestName }),
  clear: () => set({ signedIn: false }),
}));

export function isSignedIn(): boolean {
  return useSession.getState().signedIn;
}
