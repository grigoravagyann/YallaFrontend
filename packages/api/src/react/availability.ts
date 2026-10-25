import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { staleTime } from '../queryClient';
import { useGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- Floor ---------------------------------------------------------------------

/*
 * `useFloorPlan` was here, and it is deliberately gone.
 *
 * It fetched the room **as it is now**, and it is what both booking surfaces
 * drew the floor plan from while asking the availability endpoint about a slot
 * three days out — so a diner picking Saturday at 20:00 saw tonight's walk-ins
 * greyed out and Saturday's bookings drawn free. `useSlotFloor` below replaced
 * it, and after that it had no callers at all.
 *
 * Leaving an unused public hook exported would have been the whole bug's
 * re-entry point: the next screen that needs "a floor plan" would reach for the
 * one named `useFloorPlan`, get now-shaped state, and reintroduce a defect that
 * took five prompts to notice. A surface that genuinely wants the room as it
 * stands right now wants the *staff* floor — `useStaffFloor` — and should say
 * so at the call site.
 */

/**
 * How long the party-size stepper is allowed to settle before we ask again.
 *
 * A diner going from 2 to 6 taps four times in about a second. Each tap is a
 * different question with a different answer, and asking all four wastes three
 * round trips on a rate-limited anonymous endpoint and lands them out of order
 * often enough to matter. Long enough to coalesce a run of taps, short enough
 * that a deliberate single change still feels immediate.
 */
export const PARTY_SIZE_DEBOUNCE_MS = 300;

/**
 * The value once it has stopped moving.
 *
 * Deliberately not a debounce on the *request*: the query key carries the
 * settled value, so React Query sees one key change and therefore one fetch,
 * and a cached answer for a size the diner passes back through is served
 * instantly rather than refetched.
 */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setSettled(value);
      return;
    }
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

/**
 * The room as it will be at a slot, and the answer for every table in it.
 *
 * The hook both booking surfaces render from. It replaced a pair — a now-shaped
 * floor read for the geometry and `useTableAvailability` for the overlay —
 * where the first asked about *now*: a diner picking Saturday at 20:00 was
 * shown the room as it stood at that moment, with tonight's walk-ins greyed out
 * and 20:00's bookings drawn free. Date, time and party size are all server
 * inputs, so all three belong in the key.
 *
 * `keepPreviousData` matters more here than anywhere else in this file. Changing
 * the time is a new key, and without it the room would blank to a spinner on
 * every adjustment of a control that sits directly above it.
 */
export function useSlotFloor(input: {
  readonly branchId: string | undefined;
  readonly slotUtc: string;
  readonly partySize: number;
  /** The branch's IANA zone; the backend asks in wall-clock terms. */
  readonly timeZoneId?: string | undefined;
  /** Override for tests. `0` disables the wait entirely. */
  readonly debounceMs?: number;
  /**
   * Refresh cadence, opt-in per surface rather than a default.
   *
   * The public page asks for one because it is the surface genuinely left open
   * on a table with nobody touching it, and a slot an hour out still gains and
   * loses bookings while somebody reads the menu. The phone app does not: it
   * refetches on focus, which is when a diner is actually looking.
   */
  readonly pollMs?: number;
  /**
   * The booking being changed, when the screen is changing one: the server
   * leaves it out, so the diner's own table reads free at nearby times.
   */
  readonly excludeBookingId?: string | undefined;
}) {
  const gateway = useGateway();
  const {
    branchId,
    slotUtc,
    timeZoneId,
    excludeBookingId,
    debounceMs = PARTY_SIZE_DEBOUNCE_MS,
    pollMs,
  } = input;
  const partySize = useSettled(input.partySize, debounceMs);

  return useQuery({
    // The zone is in the key because it decides the wall-clock date and time
    // actually sent. It resolves a beat after the first render, and without it
    // here that first answer — computed in the fallback zone — would be cached
    // and never corrected.
    queryKey: queryKeys.slotFloor(
      branchId ?? '',
      slotUtc,
      partySize,
      timeZoneId ?? '',
      excludeBookingId,
    ),
    queryFn: () =>
      gateway.getSlotFloor({
        branchId: branchId!,
        slotUtc,
        partySize,
        timeZoneId,
        excludeBookingId,
      }),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
    placeholderData: keepPreviousData,
    ...(pollMs
      ? {
          refetchInterval: pollMs,
          // A page in a background tab is a page nobody is reading. Polling it
          // spends a stranger's mobile data on a room they cannot see.
          refetchIntervalInBackground: false,
        }
      : {}),
  });
}

/**
 * Several times' rooms at once, each the very query {@link useSlotFloor}
 * makes — so a time already looked at is not asked again, and one asked here
 * is there when the diner moves to it. For the times worth offering after a
 * "no" to freeing a table by a time: which of them leave the chosen table, or
 * any, with no limit is a question about each table, which the day of slots
 * does not answer. No previous answer is kept: each result is its own time's.
 */
export function useSlotFloors(input: {
  readonly branchId: string | undefined;
  readonly slotUtcs: readonly string[];
  readonly partySize: number;
  readonly timeZoneId?: string | undefined;
  readonly excludeBookingId?: string | undefined;
}) {
  const gateway = useGateway();
  const { branchId, slotUtcs, partySize, timeZoneId, excludeBookingId } = input;
  return useQueries({
    queries: slotUtcs.map((slotUtc) => ({
      queryKey: queryKeys.slotFloor(
        branchId ?? '',
        slotUtc,
        partySize,
        timeZoneId ?? '',
        excludeBookingId,
      ),
      queryFn: () =>
        gateway.getSlotFloor({
          branchId: branchId!,
          slotUtc,
          partySize,
          timeZoneId,
          excludeBookingId,
        }),
      enabled: Boolean(branchId),
      staleTime: staleTime.live,
    })),
  });
}

/**
 * Every time on one day, each with whether the party can still get a table —
 * what the booking screen strikes its time chips from.
 *
 * Disabled until there is a branch and a date. The party size settles first,
 * as for {@link useSlotFloor}, so stepping from 2 to 6 is one request. The
 * previous answer stays on screen while a new party size loads **for the same
 * day only**: another day's struck times drawn over this day's chips would
 * strike the wrong ones, so a new date starts from nothing struck.
 *
 * A loading or failed read strikes nothing; the room the diner opens still
 * says whether a table is free.
 */
export function useDaySlots(input: {
  readonly branchId: string | undefined;
  /** `YYYY-MM-DD` in the branch's calendar. */
  readonly date: string | undefined;
  readonly partySize: number;
  /** The booking being changed, so its own table reads free. */
  readonly excludeBookingId?: string | undefined;
  /** Override for tests. `0` disables the wait entirely. */
  readonly debounceMs?: number;
  readonly enabled?: boolean;
}) {
  const gateway = useGateway();
  const { branchId, date, excludeBookingId, debounceMs = PARTY_SIZE_DEBOUNCE_MS } = input;
  const partySize = useSettled(input.partySize, debounceMs);

  return useQuery({
    queryKey: queryKeys.daySlots(branchId ?? '', date ?? '', partySize, excludeBookingId),
    queryFn: () =>
      gateway.getDaySlots({ branchId: branchId!, date: date!, partySize, excludeBookingId }),
    enabled: Boolean(branchId) && Boolean(date) && (input.enabled ?? true),
    staleTime: staleTime.live,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === (branchId ?? '') && previousQuery.queryKey[3] === (date ?? '')
        ? previous
        : undefined,
  });
}

export function useTableAvailability(input: {
  readonly branchId: string | undefined;
  readonly slotUtc: string;
  readonly partySize: number;
  /** The branch's IANA zone; the backend asks in wall-clock terms. */
  readonly timeZoneId?: string | undefined;
}) {
  const gateway = useGateway();
  const { branchId, slotUtc, partySize, timeZoneId } = input;
  return useQuery({
    queryKey: queryKeys.availability(branchId ?? '', slotUtc, partySize),
    queryFn: () =>
      gateway.getTableAvailability({ branchId: branchId!, slotUtc, partySize, timeZoneId }),
    enabled: Boolean(branchId),
    staleTime: staleTime.live,
  });
}

/**
 * Invalidate the floor (and any availability) for a branch. Every table-state
 * mutation calls this in its `onSuccess`, and so must the offline queue when a
 * replayed action lands.
 */
export function useInvalidateFloor() {
  const queryClient = useQueryClient();
  return (branchId: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.floor(branchId) });
    void queryClient.invalidateQueries({ queryKey: ['availability', branchId] });
  };
}
