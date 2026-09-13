import { create } from 'zustand';

/**
 * What the app remembers about the diner between launches.
 *
 * The phone number and the name the venue asks for at the door. Both are needed
 * to make a booking (`CreateReservationRequest` requires them), and the number
 * is not on the diner's token — so a diner whose session was restored from the
 * keychain has no other way to supply it without being sent through an SMS
 * again.
 *
 * The email is optional and lives only here: there is no profile endpoint, so
 * it is what sign-up asked for and nothing more. Kept for receipts later.
 */
export interface DinerProfile {
  readonly phoneE164: string | null;
  readonly guestName: string | null;
  readonly email: string | null;
}

export interface ProfileStorage {
  read(): Promise<DinerProfile>;
  write(profile: DinerProfile): Promise<void>;
}

export const EMPTY_PROFILE: DinerProfile = { phoneE164: null, guestName: null, email: null };

let storage: ProfileStorage | null = null;

/** Set once at startup. Tests pass a memory store, or nothing. */
export function configureProfileStorage(next: ProfileStorage | null): void {
  storage = next;
}

/** What sign-up and the name step hand over; a field left out is left alone. */
export interface ProfileInput {
  readonly guestName?: string;
  readonly email?: string | null;
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
  email: string | null;
  /** Signed in under this number. A change of number also forgets the name and email. */
  setVerified: (input: { phoneE164: string }) => void;
  setGuestName: (guestName: string) => void;
  /** The name and the email from sign-up, persisted together. */
  setProfile: (input: ProfileInput) => void;
  setSignedIn: (signedIn: boolean) => void;
  hydrate: (profile: DinerProfile) => void;
  /** Signed out: the session is gone. The remembered number, name and email stay, as prefill. */
  clear: () => void;
}

function persist(state: DinerProfile): void {
  void storage
    ?.write({ phoneE164: state.phoneE164, guestName: state.guestName, email: state.email })
    .catch(() => undefined);
}

export const useSession = create<SessionState>((set, get) => ({
  signedIn: false,
  phoneE164: null,
  guestName: null,
  email: null,
  setVerified: ({ phoneE164 }) => {
    // A different number than the one remembered is a different person: their
    // predecessor's name and email must not be shown for, or booked under, it.
    set((state) =>
      state.phoneE164 !== null && state.phoneE164 !== phoneE164
        ? { signedIn: true, phoneE164, guestName: null, email: null }
        : { signedIn: true, phoneE164 },
    );
    persist(get());
  },
  setGuestName: (guestName) => {
    set({ guestName });
    persist(get());
  },
  setProfile: (input) => {
    set({
      ...(input.guestName !== undefined ? { guestName: input.guestName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    });
    persist(get());
  },
  setSignedIn: (signedIn) => set({ signedIn }),
  hydrate: (profile) =>
    set({ phoneE164: profile.phoneE164, guestName: profile.guestName, email: profile.email }),
  clear: () => set({ signedIn: false }),
}));

export function isSignedIn(): boolean {
  return useSession.getState().signedIn;
}
