import { staleTime, type Booking, type CreateBookingCommand } from '@yalla/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gateway } from './gateway';

/** Query keys in one place, so an invalidation cannot miss a cache entry. */
export const keys = {
  venues: ['venues'] as const,
  venue: (venueId: string) => ['venue', venueId] as const,
  floor: (branchId: string) => ['floor', branchId] as const,
  availability: (branchId: string, slotUtc: string, partySize: number) =>
    ['availability', branchId, slotUtc, partySize] as const,
  bookings: ['bookings'] as const,
  booking: (bookingId: string) => ['booking', bookingId] as const,
};

export function useVenues() {
  return useQuery({
    queryKey: keys.venues,
    queryFn: () => gateway.listVenues(),
    staleTime: staleTime.frequent,
  });
}

export function useVenue(venueId: string | undefined) {
  return useQuery({
    queryKey: keys.venue(venueId ?? ''),
    queryFn: () => gateway.getVenue(venueId!),
    enabled: Boolean(venueId),
    staleTime: staleTime.frequent,
  });
}

export function useFloorPlan(branchId: string | undefined) {
  return useQuery({
    queryKey: keys.floor(branchId ?? ''),
    queryFn: () => gateway.getFloorPlan(branchId!),
    enabled: Boolean(branchId),
    // Live table state: treat as stale almost immediately.
    staleTime: staleTime.live,
  });
}

export function useTableAvailability(input: {
  branchId: string | undefined;
  slotUtc: string;
  partySize: number;
}) {
  const { branchId, slotUtc, partySize } = input;
  return useQuery({
    queryKey: keys.availability(branchId ?? '', slotUtc, partySize),
    queryFn: () => gateway.getTableAvailability({ branchId: branchId!, slotUtc, partySize }),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

export function useBookings() {
  return useQuery({
    queryKey: keys.bookings,
    queryFn: () => gateway.listBookings(),
    staleTime: staleTime.frequent,
  });
}

export function useBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: keys.booking(bookingId ?? ''),
    queryFn: () => gateway.getBooking(bookingId!),
    enabled: Boolean(bookingId),
    staleTime: staleTime.frequent,
  });
}

/**
 * Create a booking.
 *
 * Retry is off (the shared query-client default): seating is not idempotent
 * from the user's point of view, and an automatic retry after a timeout is
 * exactly how a diner ends up with two tables. The `commandId` in the command
 * makes a *deliberate* retry safe; an automatic one is still the wrong call
 * because the UI must show what happened between attempts.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: CreateBookingCommand) => gateway.createBooking(command),
    onSuccess: (booking: Booking) => {
      queryClient.setQueryData(keys.booking(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: keys.bookings });
      void queryClient.invalidateQueries({ queryKey: keys.floor(booking.branchId) });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => gateway.cancelBooking(bookingId),
    onSuccess: (booking: Booking) => {
      queryClient.setQueryData(keys.booking(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: keys.bookings });
      void queryClient.invalidateQueries({ queryKey: keys.floor(booking.branchId) });
    },
  });
}

export function useRequestPhoneCode() {
  return useMutation({
    mutationFn: (phoneE164: string) => gateway.requestPhoneCode(phoneE164),
  });
}

export function useVerifyPhoneCode() {
  return useMutation({
    mutationFn: (input: { challengeId: string; code: string }) => gateway.verifyPhoneCode(input),
  });
}
