import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bookingParams, useAuthFinish } from './useAuthFinish';

/**
 * The sign-in and SMS detour between the booking screen and the confirm screen
 * carries the booking through untouched — including the promise to free the
 * table by a time (booking times), which the confirm screen sends with it.
 */

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  dismiss: vi.fn(),
  back: vi.fn(),
  canDismiss: vi.fn(() => true),
  dismissAll: vi.fn(),
  canGoBack: vi.fn(() => true),
}));

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

describe('a booking by time only carried through sign-in', () => {
  it('has no table, and still hands the booking on to the confirm screen', () => {
    router.replace.mockClear();
    const { tableId: _, acceptsFreeByUtc: __, ...rest } = BOOKING;
    const byTime = { ...rest, byTime: '1', requests: 'By the window' };
    const { result } = renderHook(() => useAuthFinish({ ...byTime, from: 'welcome' }));
    expect(result.current.forward).toEqual(byTime);
    result.current.finish();
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/reserve/confirm', params: byTime });
  });
});

describe('signing in from the first screen of the app', () => {
  it('opens the app itself, leaving no welcome underneath', () => {
    router.replace.mockClear();
    router.dismissAll.mockClear();
    const { result } = renderHook(() => useAuthFinish({ from: 'start' }));
    result.current.finish();
    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('keeps the start in hand when switching between log in and sign up', () => {
    router.replace.mockClear();
    const { result } = renderHook(() => useAuthFinish({ from: 'start' }));
    result.current.switchTo('/auth/signup');
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/auth/signup',
      params: { from: 'start' },
    });
  });
});
