import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/**
 * The special request typed on the booking screen, kept against the booking.
 *
 * The reservation API carries no free-text note yet, so the words cannot go
 * to the venue with the booking. Rather than collect them and drop them, they
 * are kept on the phone under the booking's id and shown on the confirmation
 * and the booking's own screen — so the diner has them in hand at the door.
 * When the API takes a note, the request goes in the command and this store
 * becomes the local echo of it.
 */

export const BOOKING_NOTES_STORAGE_KEY = 'yalla.diner.bookingNotes.v1';

/** Keep the store small: a booking is a one-evening thing. */
const MAX_NOTES = 50;

export interface BookingNotesState {
  readonly notes: Readonly<Record<string, string>>;
  /** Saves a trimmed note; an empty note removes any earlier one. */
  setNote: (bookingId: string, note: string) => void;
  noteFor: (bookingId: string) => string | null;
}

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
      // The note stays in memory for this session.
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

export const useBookingNotes = create<BookingNotesState>()(
  persist(
    (set, get) => ({
      notes: {},
      setNote: (bookingId, note) =>
        set((state) => {
          const trimmed = note.trim();
          const { [bookingId]: _previous, ...rest } = state.notes;
          if (trimmed === '') return { notes: rest };
          // Newest last; the oldest fall off once there are too many.
          const entries = [...Object.entries(rest), [bookingId, trimmed] as const].slice(
            -MAX_NOTES,
          );
          return { notes: Object.fromEntries(entries) };
        }),
      noteFor: (bookingId) => get().notes[bookingId] ?? null,
    }),
    {
      name: BOOKING_NOTES_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ notes: state.notes }),
    },
  ),
);

/** Subscribe to one booking's note. */
export function useBookingNote(bookingId: string | undefined): string | null {
  return useBookingNotes((state) => (bookingId ? (state.notes[bookingId] ?? null) : null));
}
