import type { Booking } from '@yalla/api';
import { useBookingBlock } from '../../data/bookingBlock';
import { useBookingRules } from '../../data/queries';
import { usePlace } from '../../places/hooks';
import { bookingRulesInput } from '../../places/navigation';
import { LEAD_MINUTES } from '../../places/slots';
import { canChangeBooking } from './changeBooking';

/**
 * Whether to offer Change on `booking` now: {@link canChangeBooking} with the
 * branch's own lead time, read from the same rules the booking screen reads
 * (by the place's slugs). While those are not known, the booking screen's
 * stand-in — so Change closes when that screen's time picker would.
 *
 * Not while booking is paused after three no-shows in three days (guest
 * record, 2026-10-20): the server refuses every change then, and the bookings
 * tab says until when.
 */
export function useCanChangeBooking(booking: Booking | null, now: Date): boolean {
  const { data: place } = usePlace(booking?.branchId);
  const rules = useBookingRules(bookingRulesInput(place ?? {}));
  const paused = useBookingBlock() !== null;
  if (!booking || paused) return false;
  return canChangeBooking(booking, now, rules.data?.minLeadMinutes ?? LEAD_MINUTES);
}
