/**
 * The per-diner booking keys, part of `keys` in `queries.ts`, kept in a module
 * with no imports so the sign-out and session-scope tests seed the same keys
 * the Bookings screens read.
 */
export const bookingKeys = {
  bookings: ['bookings'] as const,
  booking: (bookingId: string) => ['booking', bookingId] as const,
  /** What a notification screen read about one booking. Invalidated with it. */
  reservationState: (reservationId: string) => ['reservationState', reservationId] as const,
};
