import { create } from 'zustand';

interface ConflictState {
  /** Label of the table someone else took, or null. */
  takenTableLabel: string | null;
  report: (tableLabel: string) => void;
  clear: () => void;
}

/**
 * The "someone just took that table" signal.
 *
 * A store rather than a route param because the confirm screen needs to *pop*
 * back to the branch screen that is already mounted — the one still holding the
 * diner's slot, party size and scroll position. Navigating to it with a new
 * param would push a second copy of the room instead of returning to theirs.
 */
export const useConflict = create<ConflictState>((set) => ({
  takenTableLabel: null,
  report: (tableLabel) => set({ takenTableLabel: tableLabel }),
  clear: () => set({ takenTableLabel: null }),
}));
