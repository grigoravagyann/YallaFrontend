import { useMemo, useState } from 'react';
import type { BookingChange } from '../components/bookings/changeBooking';
import { useDinerProfile } from '../data/accountQueries';
import { useBookingBlock } from '../data/bookingBlock';
import type { Place } from '../places/model';
import { useSession } from '../stores/session';

/**
 * Who books. The number is verified by SMS; the name is remembered from the
 * first booking and asked for once here when it is not.
 */
export function useBooker(change: BookingChange | null, place: Place) {
  const signedIn = useSession((s) => s.signedIn);
  const phoneE164 = useSession((s) => s.phoneE164);
  const rememberedName = useSession((s) => s.guestName);
  const rememberName = useSession((s) => s.setGuestName);
  const [guestName, setGuestName] = useState(rememberedName ?? '');
  // A diner who still has to confirm their number gives the name on the confirm
  // screen after the SMS, so it is neither required nor asked twice here.
  const verified = signedIn && Boolean(phoneE164);
  // A booking being changed already has its name.
  const needsName = !change && verified && !rememberedName;
  /*
   * An account whose number has never passed the SMS code cannot book (again
   * so since the guest record, 2026-10-20). Known from the profile before the
   * tap, or from the server's refusal after it (the backstop); either way
   * Confirm becomes the Verify step, until the refreshed profile says the
   * number is verified.
   */
  // Read here so the check does not depend on the Profile tab having been opened.
  useDinerProfile();
  const profilePhoneVerified = useSession((s) => s.profile?.phoneVerified);
  const [verifyRefused, setVerifyRefused] = useState(false);
  // Not for a change: the booking was made on a verified number, and the code
  // flow ends on the confirm screen, which makes a new booking.
  const mustVerify =
    !change &&
    verified &&
    (profilePhoneVerified === false || (verifyRefused && profilePhoneVerified !== true));
  /**
   * Booking — and changing a booking — paused after three no-shows in three
   * days: until when, or `null`. Book is not offered meanwhile, and says why.
   */
  const pausedUntil = useBookingBlock();
  // The place being booked, as an overlap at another venue names places.
  const here = useMemo(
    () => ({ venueName: place.venueName, branchName: place.branchName }),
    [place.venueName, place.branchName],
  );

  return {
    phoneE164,
    rememberName,
    guestName,
    setGuestName,
    verified,
    needsName,
    setVerifyRefused,
    mustVerify,
    pausedUntil,
    here,
  };
}
