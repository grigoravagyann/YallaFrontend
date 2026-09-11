import { create } from 'zustand';

interface ConflictState {
  /** Label of the table someone else took, or null. */
  takenTableLabel: string | null;
  /**
   * Which kind of loss: somebody sat down there, or somebody booked it for the
   * slot. Two different sentences — the first table may free up early.
   */
  takenReason: 'occupied' | 'alreadyBooked';
  report: (tableLabel: string, reason?: 'occupied' | 'alreadyBooked') => void;
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
  takenReason: 'alreadyBooked',
  report: (tableLabel, reason = 'alreadyBooked') =>
    set({ takenTableLabel: tableLabel, takenReason: reason }),
  clear: () => set({ takenTableLabel: null, takenReason: 'alreadyBooked' }),
}));
