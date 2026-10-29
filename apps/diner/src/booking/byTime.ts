import type { BookingRules, CopyLine, DaySlots } from '@yalla/api';
import type { Place, PlaceRoom } from '../places/model';

/**
 * Booking by time only (2026-10-29): at such a branch a diner picks a day, how
 * many and a time — no room photo, no table — and may add a wish in the note.
 * The venue chooses the table when the party arrives, and caps how many guests
 * it takes at once.
 */

/**
 * Whether `place` books by time only. The booking rules once they have
 * answered — read fresh from the branch's page — and the place's own page
 * until then, so the screen does not draw rooms it is about to take away.
 */
export function isBookedByTime(
  place: Pick<Place, 'bookingMode'>,
  rules: Pick<BookingRules, 'bookingMode'> | null | undefined,
): boolean {
  return (rules?.bookingMode ?? place.bookingMode) === 'timeOnly';
}

/** At or under this many places left, the chosen time says how many: "3 places left". */
export const FEW_PLACES_LEFT = 6;

/**
 * How many more guests the branch takes at `at` (an instant in milliseconds),
 * from whichever day's answer lists that time — a late venue's 00:30 is the
 * next date's. `null` when no answer lists it, or the answer counts tables.
 */
export function guestsLeftAt(
  answers: readonly (DaySlots | null | undefined)[],
  at: number | null,
): number | null {
  if (at === null) return null;
  for (const day of answers) {
    const slot = day?.slots.find((candidate) => Date.parse(candidate.slotUtc) === at);
    if (slot) return slot.guestsLeft ?? null;
  }
  return null;
}

/**
 * "3 places left" under the chosen time, when the room then is nearly full;
 * `null` when there is plenty, or the count is not known.
 */
export function placesLeftLine(guestsLeft: number | null): CopyLine | null {
  if (guestsLeft === null || guestsLeft <= 0 || guestsLeft > FEW_PLACES_LEFT) return null;
  return { key: 'book.byTime.placesLeft', params: { count: guestsLeft } };
}

/**
 * The rooms as photos only, every pin taken off: at a branch that books by
 * time only there is no table to pick — the venue chooses one on arrival — and
 * a pin would offer exactly that.
 */
export function roomsWithoutPins(rooms: readonly PlaceRoom[]): readonly PlaceRoom[] {
  return rooms.map((room) => ({
    ...room,
    photos: room.photos.map((photo) => ({ ...photo, tables: [] })),
  }));
}
