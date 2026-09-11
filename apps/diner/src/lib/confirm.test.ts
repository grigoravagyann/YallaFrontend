import type { TableAvailability } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { canSubmit, confirmState } from './confirm';

const TABLE: TableAvailability = {
  tableId: 't1',
  tableLabel: '7',
  floorAreaName: null,
  seats: 4,
  isBookable: true,
  unavailableReason: null,
  window: null,
  freeCancellationUntilUtc: null,
  requiresApproval: false,
};

describe('the confirm button', () => {
  it('stays off while the table is still being checked', () => {
    const state = confirmState({ offline: false, isLoading: true, isError: false, table: null });
    expect(state).toBe('loading');
    expect(canSubmit({ state, guestName: 'Ani', pending: false })).toBe(false);
  });

  it('stays off when the check failed', () => {
    const state = confirmState({ offline: false, isLoading: false, isError: true, table: null });
    expect(canSubmit({ state, guestName: 'Ani', pending: false })).toBe(false);
  });

  it('stays off, and says why, for a table that is no longer bookable', () => {
    const state = confirmState({
      offline: false,
      isLoading: false,
      isError: false,
      table: { ...TABLE, isBookable: false, unavailableReason: 'alreadyBooked' },
    });
    expect(state).toBe('unavailable');
    expect(canSubmit({ state, guestName: 'Ani', pending: false })).toBe(false);
  });

  it('needs the name the venue will ask for', () => {
    const state = confirmState({ offline: false, isLoading: false, isError: false, table: TABLE });
    expect(canSubmit({ state, guestName: '   ', pending: false })).toBe(false);
    expect(canSubmit({ state, guestName: 'Ani', pending: false })).toBe(true);
  });
});
