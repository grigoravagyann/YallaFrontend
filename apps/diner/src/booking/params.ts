// A type alias, not an interface: `useLocalSearchParams` wants an implicit
// index signature, which only object literal types carry.
export type BookingParams = {
  placeId: string;
  tableId?: string;
  tableLabel?: string;
  capacityMin?: string;
  capacityMax?: string;
  /**
   * Change mode: the booking being moved, and the instant (ISO) and party it
   * holds now — with `tableId`, its table. See `changeBookingRoute`.
   */
  bookingId?: string;
  slotUtc?: string;
  /** With a new booking: its party, from a declined one (see `anotherTimeRoute`). */
  party?: string;
  /** A new booking after a declined one: the instant whose day to open on. */
  dayOf?: string;
};

/** A route param read as a whole number above zero, or `null`. */
export function positiveInt(value: string | undefined): number | null {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}
