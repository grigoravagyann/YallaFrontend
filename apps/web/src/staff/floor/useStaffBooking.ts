import { toCallOrder, type BookingToCall } from '@yalla/api';
import { useBookingsToCall } from '@yalla/api/react';
import { useCallback, useMemo, useState } from 'react';

/** The New booking sheet, when it is open: from the header (no table) or from a free table's panel. */
export interface BookingSheetState {
  readonly tableId: string | null;
}

/**
 * Bookings taken by hand (2026-10-31): whether the sheet is open and from
 * where, and the call list — the staff-taken bookings in their window, mine
 * first — read while the floor is open. Both shells draw from it.
 */
export function useStaffBooking(branchId: string, active: boolean) {
  const [sheet, setSheet] = useState<BookingSheetState | null>(null);
  const openSheet = useCallback((tableId: string | null = null) => setSheet({ tableId }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const toCallQuery = useBookingsToCall(branchId, active);
  const toCall: readonly BookingToCall[] = useMemo(
    () => toCallOrder(toCallQuery.data ?? []),
    [toCallQuery.data],
  );

  return { sheet, openSheet, closeSheet, toCallQuery, toCall };
}
