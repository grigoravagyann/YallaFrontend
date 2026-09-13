import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/**
 * The places the diner tapped the heart on.
 *
 * Kept on the phone only: there is no account to put them under, and a list of
 * favourite cafés is not worth an SMS. Persisted through AsyncStorage, which is
 * a plain file on the phone and `localStorage` on the web build.
 *
 * Hydration is asynchronous. Until `hydrated` flips, `favoriteIds` is empty and
 * a heart drawn from it is hollow for a frame or two; screens that care can
 * wait on the flag.
 */

export const FAVORITES_STORAGE_KEY = 'yalla.diner.favorites.v1';

export interface FavoritesState {
  readonly favoriteIds: readonly string[];
  /** True once the persisted list has been read (or found absent). */
  readonly hydrated: boolean;
  toggle: (placeId: string) => void;
  add: (placeId: string) => void;
  remove: (placeId: string) => void;
  isFavorite: (placeId: string) => boolean;
  setHydrated: () => void;
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
    (set, get) => ({
      favoriteIds: [],
      hydrated: false,
      toggle: (placeId) => {
        if (get().favoriteIds.includes(placeId)) get().remove(placeId);
        else get().add(placeId);
      },
      add: (placeId) =>
        set((state) =>
          state.favoriteIds.includes(placeId)
            ? state
            : { favoriteIds: [...state.favoriteIds, placeId] },
        ),
      remove: (placeId) =>
        set((state) => ({ favoriteIds: state.favoriteIds.filter((id) => id !== placeId) })),
      isFavorite: (placeId) => get().favoriteIds.includes(placeId),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: FAVORITES_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      // Only the list is saved; the flag and the functions are not state worth keeping.
      partialize: (state) => ({ favoriteIds: state.favoriteIds }),
      onRehydrateStorage: () => (state, error) => {
        // Hydrated either way: a failed read means "no favourites yet", and a
        // screen waiting on the flag must not wait forever.
        if (error || !state) useFavorites.getState().setHydrated();
        else state.setHydrated();
      },
    },
  ),
);

/** Subscribe to one place's heart, re-rendering only when that place flips. */
export function useIsFavorite(placeId: string): boolean {
  return useFavorites((state) => state.favoriteIds.includes(placeId));
}

/** Kick off the read explicitly at startup — persist also does this on first use. */
export function hydrateFavorites(): Promise<void> {
  return Promise.resolve(useFavorites.persist.rehydrate()).then(() => undefined);
}
