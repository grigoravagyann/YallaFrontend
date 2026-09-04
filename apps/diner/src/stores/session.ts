import { create } from 'zustand';

interface SessionState {
  /** Set once the phone is verified; required to create a booking. */
  verificationToken: string | null;
  phoneE164: string | null;
  setVerified: (input: { verificationToken: string; phoneE164: string }) => void;
  clear: () => void;
}

/**
 * Verification state, held in memory for the session.
 *
 * Deliberately not persisted: a verification token is a short-lived credential,
 * and the spec forbids web storage anyway. Re-verifying on a fresh launch is
 * the correct cost.
 *
 * This lives in a store rather than route params so that returning from the
 * verification screens does not have to thread a token back through navigation
 * — the branch screen stays mounted underneath with its table still selected.
 */
export const useSession = create<SessionState>((set) => ({
  verificationToken: null,
  phoneE164: null,
  setVerified: ({ verificationToken, phoneE164 }) => set({ verificationToken, phoneE164 }),
  clear: () => set({ verificationToken: null, phoneE164: null }),
}));

export function isPhoneVerified(): boolean {
  return useSession.getState().verificationToken !== null;
}
