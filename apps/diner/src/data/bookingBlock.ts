import { useNow } from '../hooks/useNow';
import { blockedUntil } from '../lib/guestRecord';
import { useSession } from '../stores/session';
import { useBookings } from './queries';

/**
 * When the guest's pause on booking ends (ISO UTC), or `null` while they may
 * book: three no-shows in three days pause booking — new and changes alike —
 * for a week (guest record, 2026-10-20). Read from the guest's own record,
 * which comes with their bookings list, so every screen where a booking
 * starts says it before the tap rather than after the server's 403.
 */
export function useBookingBlock(): string | null {
  const signedIn = useSession((s) => s.signedIn);
  const { data } = useBookings(signedIn);
  const now = useNow();
  return blockedUntil(data?.guestRecord, now);
}
