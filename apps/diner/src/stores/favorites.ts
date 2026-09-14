import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useSession } from './session';

/**
 * The hearts, as every screen reads them.
 *
 * Two lists, and which one a heart shows depends on whether somebody is signed in:
 *
 * - **Signed in**, the account's saved places (K11). `remoteIds` mirrors the
 *   favourites query in `data/favoriteQueries.ts` with any taps the server has
 *   not confirmed yet applied; `toggle` goes through that module, which sends
 *   the write and rolls the heart back if it is refused.
 * - **Signed out**, `localIds`: hearts kept on this phone, persisted through
 *   AsyncStorage (a plain file on the phone, `localStorage` on the web build).
 *   They are uploaded into the account at the next sign-in and then forgotten
 *   here — so a heart tapped before creating an account is not lost.
 *
 * A heart is a store subscription and not a query, so it renders without a
 * provider and re-renders only when that one place flips.
 *
 * Hydration is asynchronous. Until `hydrated` flips, `localIds` is empty.
 */

export const FAVORITES_STORAGE_KEY = 'yalla.diner.favorites.v1';

export interface FavoritesState {
  /** Hearts tapped while signed out, on this phone, oldest first. */
  readonly localIds: readonly string[];
  /**
   * The signed-in account's saved places, newest first, with unconfirmed taps
   * applied. `null` until the account's list has been read, and when signed out.
   */
  readonly remoteIds: readonly string[] | null;
  /** True once the phone's list has been read (or found absent). */
  readonly hydrated: boolean;
  /** Save or unsave: to the account when signed in, else on this phone. */
  toggle: (placeId: string) => void;
  /** The favourites sync's mirror of the account's list. */
  setRemote: (ids: readonly string[] | null) => void;
  /** Forget the phone's hearts that have been uploaded into the account. */
  forgetLocal: (ids: readonly string[]) => void;
  setHydrated: () => void;
}

/** Installed by the favourites sync while it runs; `null` outside the app (tests). */
let remoteToggle: ((placeId: string) => void) | null = null;

export function registerRemoteToggle(toggle: ((placeId: string) => void) | null): void {
  remoteToggle = toggle;
}

/**
 * AsyncStorage behind a try/catch.
 *
 * On the web build AsyncStorage is `localStorage`, which throws in a private
 * window or when site data is blocked; a failing read there must come back as
 * "nothing saved", not take the whole Explore tab down with it.
 */
const safeStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      // Nothing to do: the favourite stays in memory for this session.
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // As above.
    }
  },
};

export const useFavorites = create<FavoritesState>()(
  persist(
    (set) => ({
      localIds: [],
      remoteIds: null,
      hydrated: false,
      toggle: (placeId) => {
        if (useSession.getState().signedIn && remoteToggle) {
          remoteToggle(placeId);
          return;
        }
        set((state) => ({
          localIds: state.localIds.includes(placeId)
            ? state.localIds.filter((id) => id !== placeId)
            : [...state.localIds, placeId],
        }));
      },
      setRemote: (ids) => set({ remoteIds: ids }),
      forgetLocal: (ids) =>
        set((state) => ({ localIds: state.localIds.filter((id) => !ids.includes(id)) })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: FAVORITES_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      // Only the phone's own hearts are saved; the account's list is the server's.
      partialize: (state) => ({ localIds: state.localIds }),
      // Version 1 kept every heart on the phone as `favoriteIds`. They become
      // signed-out hearts, so the next sign-in carries them into the account.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as { favoriteIds?: unknown; localIds?: unknown };
        const ids = version < 2 ? old.favoriteIds : old.localIds;
        return {
          localIds: Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [],
        } as unknown as FavoritesState;
      },
      onRehydrateStorage: () => (state, error) => {
        // Hydrated either way: a failed read means "no favourites yet", and a
        // screen waiting on the flag must not wait forever.
        if (error || !state) useFavorites.getState().setHydrated();
        else state.setHydrated();
      },
    },
  ),
);

/** The ids the hearts show right now, for whoever is (or is not) signed in. */
export function favoriteIdsFor(
  state: Pick<FavoritesState, 'localIds' | 'remoteIds'>,
  signedIn: boolean,
): readonly string[] {
  return signedIn ? (state.remoteIds ?? []) : state.localIds;
}

/** Subscribe to one place's heart, re-rendering only when that place flips. */
export function useIsFavorite(placeId: string): boolean {
  const signedIn = useSession((state) => state.signedIn);
  return useFavorites((state) => favoriteIdsFor(state, signedIn).includes(placeId));
}

/** Kick off the read explicitly at startup — persist also does this on first use. */
export function hydrateFavorites(): Promise<void> {
  return Promise.resolve(useFavorites.persist.rehydrate()).then(() => undefined);
}
