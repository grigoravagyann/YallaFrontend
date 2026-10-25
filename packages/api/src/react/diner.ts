import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking, RescheduleBookingCommand } from '../contracts/booking';
import { staleTime } from '../queryClient';
import { useGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- Diner: browse ------------------------------------------------------------

/** Venue lists change when an owner edits them: reference data, cached for minutes. */
export function useVenues() {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.venues,
    queryFn: () => gateway.listVenues(),
    staleTime: staleTime.reference,
  });
}

export function useVenue(venueId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.venue(venueId ?? ''),
    queryFn: () => gateway.getVenue(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.reference,
  });
}

// --- Diner: proving a phone --------------------------------------------------

/**
 * Which ways of proving a number this backend has on: an SMS code, the
 * Telegram bot, or both. Until an SMS provider is chosen (decided 2026-10-20)
 * production has Telegram only, and a screen that offered "Send code" there
 * would hand the diner a button that cannot work.
 *
 * A fact about the deployment, the same for everybody and for the life of the
 * process, so it is read once and kept: `staleTime.static`. While it is
 * loading a screen shows neither door rather than guessing one; if it fails
 * the screen falls back to offering both, and each door's own refusal
 * (`SmsUnavailableError`, `TelegramUnavailableError`) closes it after one try.
 */
export function usePhoneProofChannels() {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.phoneProofChannels,
    queryFn: () => gateway.getPhoneProofChannels(),
    staleTime: staleTime.static,
  });
}

// --- Diner: changing a booking ------------------------------------------------

/**
 * Move a booking to another time, size or table, keeping its code.
 *
 * Retry is off, as for every booking mutation: the `commandId` makes a
 * *deliberate* retry safe, and the screen must show what happened in between.
 * On success the booking's own cache entry takes the answer — its status may
 * now be "waiting for the venue" — and every list and room that showed the old
 * time is read again, at both the old and the new slot.
 */
export function useRescheduleBooking() {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: RescheduleBookingCommand) => gateway.rescheduleBooking(command),
    retry: false,
    onSuccess: (booking: Booking) => {
      queryClient.setQueryData(queryKeys.booking(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservationState(booking.id) });
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.branchId] });
    },
  });
}
