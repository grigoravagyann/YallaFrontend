import type { UserRole } from '@yalla/api';
import { create } from 'zustand';

/**
 * Which role the *mock backend* reports as signed in.
 *
 * Against a real backend this store does nothing: the role and the scope come
 * out of the token, `resolveConsoleGateway` ignores `mockRole`, and no request
 * the client makes can widen what it is allowed to see. It exists so all four
 * tiers can be walked in development without four accounts, and the switcher
 * that drives it is gated on `import.meta.env.DEV`.
 *
 * Deliberately not persisted. A remembered role would be a client-side claim
 * that outlived the session that granted it, which is precisely the shape of
 * bug this whole module is arranged to prevent.
 */
interface DevRoleState {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

export const useDevRole = create<DevRoleState>((set) => ({
  role: 'platformAdmin',
  setRole: (role) => set({ role }),
}));
