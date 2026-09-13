import type { DinerProfileView } from '@yalla/api';
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
 * The email is what sign-up asked for, kept for receipts. Since accounts, all
 * three are also what the server holds on the profile: once `/me` is read they
 * are brought in step with it (see `setProfile`), so the booking prefill and
 * the account never disagree.
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

/** What the name step hands over; a field left out is left alone. */
export interface RememberedInput {
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
  /**
   * The account as the server last described it — `GET /api/diner/me`.
   *
   * `null` until the profile query has answered this launch, and again after
   * sign-out. Not persisted: the keychain keeps the refresh token, and the
   * profile is read fresh once that token is known to be good.
   */
  profile: DinerProfileView | null;
  /** Signed in under this number. A change of number also forgets the name and email. */
  setVerified: (input: { phoneE164: string }) => void;
  setGuestName: (guestName: string) => void;
  /** The name and the email typed on this phone, persisted together. */
  setRemembered: (input: RememberedInput) => void;
  /**
   * The profile the server answered with. The remembered number, name and
   * email follow it — a name the account holds wins over one typed on this
   * phone; an account with no name yet leaves the typed one alone.
   */
  setProfile: (profile: DinerProfileView) => void;
  clearProfile: () => void;
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
  profile: null,
  setVerified: ({ phoneE164 }) => {
    // A different number than the one remembered is a different person: their
    // predecessor's name, email and profile must not be shown for, or booked
    // under, it.
    set((state) =>
      state.phoneE164 !== null && state.phoneE164 !== phoneE164
        ? { signedIn: true, phoneE164, guestName: null, email: null, profile: null }
        : { signedIn: true, phoneE164 },
    );
    persist(get());
  },
  setGuestName: (guestName) => {
    set({ guestName });
    persist(get());
  },
  setRemembered: (input) => {
    set({
      ...(input.guestName !== undefined ? { guestName: input.guestName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    });
    persist(get());
  },
  setProfile: (profile) => {
    set((state) => ({
      profile,
      phoneE164: profile.phoneE164,
      guestName: profile.displayName ?? state.guestName,
      email: profile.email,
    }));
    persist(get());
  },
  clearProfile: () => set({ profile: null }),
  // Signed out by the token session (a refused refresh): the account is no
  // longer this device's to show.
  setSignedIn: (signedIn) => set(signedIn ? { signedIn } : { signedIn, profile: null }),
  hydrate: (profile) =>
    set({ phoneE164: profile.phoneE164, guestName: profile.guestName, email: profile.email }),
  clear: () => set({ signedIn: false, profile: null }),
}));

export function isSignedIn(): boolean {
  return useSession.getState().signedIn;
}
