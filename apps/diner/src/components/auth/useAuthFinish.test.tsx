import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bookingParams, useAuthFinish } from './useAuthFinish';

/**
 * The sign-in and SMS detour between the booking screen and the confirm screen
 * carries the booking through untouched — including the promise to free the
 * table by a time (booking times), which the confirm screen sends with it.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), dismiss: vi.fn(), back: vi.fn() }));

vi.mock('expo-router', () => ({
  useRouter: () => router,
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));

const BOOKING = {
  branchId: 'b1',
  venueId: 'v1',
  tableId: 't1',
  slotUtc: '2026-10-20T15:00:00.000Z',
  partySize: '2',
  requests: 'A high chair',
  acceptsFreeByUtc: '2026-10-20T15:55:00.000Z',
};

describe('the booking carried through sign-in', () => {
  it('keeps the agreed time to free the table by', () => {
    expect(bookingParams(BOOKING)).toEqual(BOOKING);
  });

  it('hands it on to the confirm screen', () => {
    const { result } = renderHook(() => useAuthFinish({ ...BOOKING, from: 'welcome' }));
    expect(result.current.forward).toEqual(BOOKING);
    result.current.finish();
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/reserve/confirm', params: BOOKING });
  });
});
